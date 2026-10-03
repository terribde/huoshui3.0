-- Run in a transaction and always ROLLBACK. Synthetic profiles only.
BEGIN;
INSERT INTO public.user_profiles(id,points) VALUES ('ai-billing-verification-a',100),('ai-billing-verification-b',0);
SET LOCAL ROLE service_role;
DO $$
DECLARE a text := 'ai-billing-verification-a'; b text := 'ai-billing-verification-b';
  q uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); q3 uuid := gen_random_uuid();
  h text := repeat('a',64); r jsonb; cost integer; n integer;
BEGIN
  SELECT -points_delta INTO cost FROM public.point_rules WHERE action_code='ai_question';
  r := public.ai_reserve_points(a,q,h,cost);
  IF NOT (r->>'created')::boolean OR (r->>'balance')::int <> 100-cost THEN RAISE EXCEPTION 'reserve failed'; END IF;
  r := public.ai_reserve_points(a,q,h,cost);
  IF (r->>'created')::boolean OR (r->>'balance')::int <> 100-cost THEN RAISE EXCEPTION 'duplicate debit'; END IF;
  BEGIN
    PERFORM public.ai_reserve_points(a,q,repeat('b',64),cost);
    RAISE EXCEPTION 'hash conflict accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.ai_reserve_points(a,q2,h,cost);
    RAISE EXCEPTION 'concurrent pending accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    PERFORM public.ai_finalize_points(b,q,'refunded','failed');
    RAISE EXCEPTION 'cross user accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  -- Change the rule transactionally to prove refund uses original debit.
  UPDATE public.point_rules SET points_delta=-7 WHERE action_code='ai_question';
  r := public.ai_finalize_points(a,q,'refunded','failed');
  IF (r->>'balance')::int <> 100 THEN RAISE EXCEPTION 'refund amount mismatch'; END IF;
  r := public.ai_finalize_points(a,q,'refunded','failed');
  IF (r->>'changed')::boolean OR (r->>'balance')::int <> 100 THEN RAISE EXCEPTION 'double refund'; END IF;
  r := public.ai_finalize_points(a,q,'settled');
  IF r->>'status' <> 'refunded' THEN RAISE EXCEPTION 'refunded became settled'; END IF;
  BEGIN
    PERFORM public.ai_reserve_points(a,q2,h,6);
    RAISE EXCEPTION 'stale price accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.ai_reserve_points(b,q2,h,7);
    RAISE EXCEPTION 'insufficient balance accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  r := public.ai_reserve_points(a,q2,h,7);
  IF (r->>'cost')::int <> 7 OR (r->>'balance')::int <> 93 THEN RAISE EXCEPTION 'dynamic pricing failed'; END IF;
  r := public.ai_finalize_points(a,q2,'settled');
  r := public.ai_finalize_points(a,q2,'settled');
  IF (r->>'changed')::boolean THEN RAISE EXCEPTION 'double settlement'; END IF;
  r := public.ai_finalize_points(a,q2,'refunded','failed');
  IF r->>'status' <> 'settled' OR (r->>'balance')::int <> 93 THEN RAISE EXCEPTION 'settled refunded'; END IF;
  UPDATE public.point_rules SET is_active=false WHERE action_code='ai_question';
  BEGIN
    PERFORM public.ai_reserve_points(a,q3,h,7);
    RAISE EXCEPTION 'disabled rule accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.point_rules SET is_active=true WHERE action_code='ai_question';
  PERFORM public.ai_reserve_points(a,q3,h,7);
  UPDATE public.point_transactions SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=a AND request_id=q3;
  BEGIN
    PERFORM public.ai_finalize_points(a,q3,'settled');
    RAISE EXCEPTION 'expired settled';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  -- Refuse batch verification if it could touch a real expired reservation.
  IF EXISTS (SELECT 1 FROM public.point_transactions WHERE settlement_status='pending'
    AND expires_at<=clock_timestamp() AND user_id<>a) THEN RAISE EXCEPTION 'real expired reservations exist; run fixture in isolation'; END IF;
  n := public.ai_refund_expired_points(100);
  IF n <> 1 OR public.ai_refund_expired_points(100) <> 0 THEN RAISE EXCEPTION 'expiry recovery not idempotent'; END IF;
  r := public.ai_finalize_points(a,q3,'refunded','expired');
  IF (r->>'balance')::int <> 93 THEN RAISE EXCEPTION 'expiry refund failed'; END IF;
  SELECT count(*) INTO n FROM public.point_transactions WHERE user_id=a;
  IF n <> 5 THEN RAISE EXCEPTION 'unexpected ledger count: %', n; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.point_transactions WHERE user_id='ai-billing-verification-a') THEN RAISE EXCEPTION 'RLS leaked ledger'; END IF;
  BEGIN
    PERFORM public.ai_reserve_points('ai-billing-verification-a',gen_random_uuid(),repeat('a',64),7);
    RAISE EXCEPTION 'authenticated can reserve';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.ai_finalize_points('ai-billing-verification-a',gen_random_uuid(),'refunded','failed');
    RAISE EXCEPTION 'authenticated can refund';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT oid FROM pg_proc WHERE proname IN ('ai_reserve_points','ai_finalize_points','ai_refund_expired_points')
  LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE')
      OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'invalid function ACL'; END IF;
  END LOOP;
END $$;
ROLLBACK;
SELECT 'AI billing verification passed; all fixture changes rolled back' AS result;
