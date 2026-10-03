-- Additive AI billing extension. Execute as one transaction.
-- Existing spend_points, prices, balances and historical ledger entries are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.point_transactions
  ADD COLUMN request_id uuid,
  ADD COLUMN request_hash text,
  ADD COLUMN event_type text,
  ADD COLUMN related_transaction_id text REFERENCES public.point_transactions(id),
  ADD COLUMN settlement_status text,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN settled_at timestamptz,
  ADD COLUMN settlement_reason text;

ALTER TABLE public.point_transactions ADD CONSTRAINT ai_ledger_shape CHECK (
  (request_id IS NULL AND request_hash IS NULL AND event_type IS NULL
    AND related_transaction_id IS NULL AND settlement_status IS NULL
    AND expires_at IS NULL AND settled_at IS NULL AND settlement_reason IS NULL)
  OR
  (request_id IS NOT NULL AND user_id IS NOT NULL AND action_code IS NOT DISTINCT FROM 'ai_question'
    AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$'
    AND event_type IS NOT NULL AND settlement_status IS NOT NULL
    AND expires_at IS NOT NULL
    AND (
      (event_type = 'ai_debit' AND amount < 0 AND related_transaction_id IS NULL
       AND ((settlement_status = 'pending' AND settled_at IS NULL AND settlement_reason IS NULL)
         OR (settlement_status IN ('settled','refunded') AND settled_at IS NOT NULL AND settlement_reason IS NOT NULL)))
      OR (event_type = 'ai_refund' AND amount > 0 AND related_transaction_id IS NOT NULL
          AND settlement_status = 'refunded' AND settled_at IS NOT NULL AND settlement_reason IS NOT NULL)
    ))
);
CREATE UNIQUE INDEX ai_ledger_request_event_unique
  ON public.point_transactions(user_id, request_id, event_type) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX ai_ledger_refund_unique
  ON public.point_transactions(related_transaction_id) WHERE related_transaction_id IS NOT NULL;
CREATE INDEX ai_ledger_pending_expiry
  ON public.point_transactions(expires_at, user_id) WHERE settlement_status = 'pending';

-- All writes are SECURITY INVOKER and executable only by service_role.
-- Backend must validate Supabase identity and compute SHA-256 of the canonical
-- prompt + conversation identity/context before calling reserve.
CREATE FUNCTION public.ai_reserve_points(
  p_user_id text, p_request_id uuid, p_request_hash text, p_expected_cost integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE bal integer; cost integer; tx public.point_transactions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_hash IS NULL
    OR p_request_hash !~ '^[0-9a-f]{64}$' OR p_expected_cost IS NULL OR p_expected_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;
  -- Same order as existing spend_points: account first, ledger second.
  SELECT points INTO bal FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO tx FROM public.point_transactions
    WHERE user_id = p_user_id AND request_id = p_request_id AND event_type = 'ai_debit';
  IF FOUND THEN
    IF tx.request_hash <> p_request_hash THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('created',false,'transaction_id',tx.id,'request_id',tx.request_id,
      'status',tx.settlement_status,'cost',-tx.amount,'balance',bal,'expires_at',tx.expires_at);
  END IF;
  SELECT -points_delta INTO cost FROM public.point_rules
    WHERE action_code = 'ai_question' AND is_active AND points_delta < 0 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ai_rule_unavailable' USING ERRCODE = '22023'; END IF;
  IF p_expected_cost <> cost THEN RAISE EXCEPTION 'price_changed' USING ERRCODE = '22023'; END IF;
  IF bal < cost THEN RAISE EXCEPTION 'insufficient_points' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.point_transactions WHERE user_id = p_user_id AND settlement_status = 'pending') THEN
    RAISE EXCEPTION 'ai_request_in_progress' USING ERRCODE = '55000';
  END IF;
  UPDATE public.user_profiles SET points = points - cost WHERE id = p_user_id RETURNING points INTO bal;
  INSERT INTO public.point_transactions(user_id,amount,balance_after,action_code,action,
    request_id,request_hash,event_type,settlement_status,expires_at)
  VALUES (p_user_id,-cost,bal,'ai_question','AI 问答预扣',p_request_id,p_request_hash,
    'ai_debit','pending',clock_timestamp() + interval '5 minutes') RETURNING * INTO tx;
  RETURN jsonb_build_object('created',true,'transaction_id',tx.id,'request_id',tx.request_id,
    'status',tx.settlement_status,'cost',cost,'balance',bal,'expires_at',tx.expires_at);
END $$;

CREATE FUNCTION public.ai_finalize_points(
  p_user_id text, p_request_id uuid, p_outcome text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE bal integer; tx public.point_transactions%ROWTYPE; why text;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('settled','refunded') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;
  why := CASE WHEN p_outcome = 'settled' THEN 'completed' ELSE coalesce(p_reason,'failed') END;
  IF why NOT IN ('completed','failed','cancelled','timeout','empty_response','expired','interrupted') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'refunded' AND why = 'completed' THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023'; END IF;
  SELECT points INTO bal FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO tx FROM public.point_transactions
    WHERE user_id = p_user_id AND request_id = p_request_id AND event_type = 'ai_debit' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF tx.settlement_status <> 'pending' THEN
    RETURN jsonb_build_object('changed',false,'status',tx.settlement_status,'cost',-tx.amount,'balance',bal);
  END IF;
  IF p_outcome = 'settled' AND tx.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'reservation_expired' USING ERRCODE = '55000';
  END IF;
  IF p_outcome = 'refunded' THEN
    UPDATE public.user_profiles SET points = points - tx.amount WHERE id = p_user_id RETURNING points INTO bal;
    INSERT INTO public.point_transactions(user_id,amount,balance_after,action_code,action,
      request_id,request_hash,event_type,related_transaction_id,settlement_status,expires_at,settled_at,settlement_reason)
    VALUES (p_user_id,-tx.amount,bal,'ai_question','AI 问答退款',p_request_id,tx.request_hash,
      'ai_refund',tx.id,'refunded',tx.expires_at,clock_timestamp(),why);
  END IF;
  UPDATE public.point_transactions SET settlement_status = p_outcome, settled_at = clock_timestamp(),
    settlement_reason = why, action = CASE WHEN p_outcome = 'settled' THEN 'AI 智能问答' ELSE 'AI 问答预扣（已退回）' END
    WHERE id = tx.id;
  RETURN jsonb_build_object('changed',true,'status',p_outcome,'cost',-tx.amount,'balance',bal);
END $$;

-- Run at backend startup and periodically. No cron or external service is changed here.
CREATE FUNCTION public.ai_refund_expired_points(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE candidate record; result jsonb; total integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023'; END IF;
  -- Deterministic account ordering across batches avoids multi-account deadlocks.
  FOR candidate IN SELECT user_id,request_id FROM public.point_transactions
    WHERE settlement_status = 'pending' AND expires_at <= clock_timestamp()
    ORDER BY user_id,request_id LIMIT p_limit
  LOOP
    result := public.ai_finalize_points(candidate.user_id,candidate.request_id,'refunded','expired');
    IF (result->>'changed')::boolean THEN total := total + 1; END IF;
  END LOOP;
  RETURN total;
END $$;

REVOKE ALL ON FUNCTION public.ai_reserve_points(text,uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_finalize_points(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_refund_expired_points(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve_points(text,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_finalize_points(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_refund_expired_points(integer) TO service_role;

COMMENT ON COLUMN public.point_transactions.request_id IS 'AI request idempotency key, scoped to user; NULL for historical and non-AI transactions';
COMMENT ON COLUMN public.point_transactions.request_hash IS 'Backend SHA-256 of canonical request; no conversation plaintext stored';
COMMENT ON COLUMN public.point_transactions.settlement_status IS 'AI debit: pending/settled/refunded; refund: refunded; NULL for legacy transactions';
NOTIFY pgrst, 'reload schema';
COMMIT;
