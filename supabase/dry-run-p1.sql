-- P1 DRY RUN v2: execute the WHOLE file, without selecting a fragment.
-- Migration and all synthetic test records are rolled back.
BEGIN;

DO $p1_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $p1_sql$-- Stop before making changes if the deployed schema differs from the supported baseline.
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('teachers','id','text'), ('reviews','id','text'), ('reviews','teacher_id','text'),
    ('reviews','user_id','text'), ('user_profiles','id','text'), ('user_profiles','points','int4'),
    ('point_transactions','id','text'), ('point_transactions','user_id','text'),
    ('admin_users','id','uuid'), ('courses','id','uuid'), ('terms','id','uuid'),
    ('colleges','id','uuid'), ('reviews','course_id','uuid')
  ) AS expected(tbl,col,typ)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=v.tbl AND c.column_name=v.col AND c.udt_name=v.typ) THEN
      RAISE EXCEPTION 'Unsupported type for %.%; run supabase/preflight.sql and adapt migration first',v.tbl,v.col;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
      AND ((n.nspname='auth' AND c.relname='users') OR
           (n.nspname='public' AND c.relname IN ('reviews','user_profiles','point_transactions')))
      AND NOT ((n.nspname='auth' AND c.relname='users' AND t.tgname='on_auth_user_created')
        OR (n.nspname='public' AND c.relname='reviews' AND t.tgname='trg_recalc_teacher_scores'))
  ) THEN
    RAISE EXCEPTION 'Existing business triggers need review before migration (avoid duplicate welcome/review rewards). Run preflight.';
  END IF;
END $$;
$p1_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'P1 dry-run stage: 01 schema check [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $p1_stage$;


DO $p1_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $p1_sql$CREATE SCHEMA IF NOT EXISTS private; REVOKE ALL ON SCHEMA private FROM PUBLIC;$p1_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'P1 dry-run stage: 02 private schema [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $p1_stage$;


DO $p1_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $p1_sql$-- Add only fields absent from the verified production schema.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES public.admin_users(id);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.reviews ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_checkin_date DATE;
ALTER TABLE public.point_transactions ADD COLUMN IF NOT EXISTS action_code TEXT;
ALTER TABLE public.point_transactions ADD COLUMN IF NOT EXISTS related_review_id TEXT;
-- The deployed spend/check-in functions referenced this missing column.
ALTER TABLE public.point_transactions ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.point_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS point_transactions_user_timestamp_idx ON public.point_transactions(user_id, timestamp DESC);
-- Duplicate normalized admin emails require manual reconciliation, never silent merging.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_normalized_idx ON public.admin_users(lower(email));
$p1_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'P1 dry-run stage: 03 compatibility [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $p1_stage$;


DO $p1_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $p1_sql$-- Only server functions can mutate balances, ledger entries and moderation status.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.swjtu_admin_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.role FROM public.admin_users a JOIN auth.users u ON lower(u.email)=lower(a.email)
  WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND a.is_active
    AND a.role IN ('super_admin','admin','moderator') LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.swjtu_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.swjtu_admin_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_admin_status() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT jsonb_build_object('is_admin',true,'role',a.role,'nickname',a.nickname)
    FROM public.admin_users a JOIN auth.users u ON lower(u.email)=lower(a.email)
    WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND a.is_active
      AND a.role IN ('super_admin','admin','moderator') LIMIT 1), jsonb_build_object('is_admin',false))
$$;

-- Replace ALL old policies on app tables: permissive policies combine with OR.
DO $$ DECLARE v RECORD; tbl TEXT; BEGIN
  FOR v IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('teachers','reviews','user_profiles','point_transactions','admin_users',
                      'courses','colleges','terms','course_offerings','point_rules')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',v.policyname,v.tablename); END LOOP;
  FOREACH tbl IN ARRAY ARRAY['teachers','reviews','user_profiles','point_transactions','admin_users',
                            'courses','colleges','terms','course_offerings','point_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',tbl);
  END LOOP;
  -- REVOKE table privileges does not remove historical column grants.
  FOR v IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('teachers','reviews','user_profiles','point_transactions','admin_users',
                      'courses','colleges','terms','course_offerings','point_rules') LOOP
    EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM PUBLIC, anon, authenticated',
      v.column_name,v.column_name,v.column_name,v.column_name,v.table_name);
  END LOOP;
END $$;

GRANT SELECT ON public.teachers,public.courses,public.colleges,public.terms,public.course_offerings,public.point_rules TO anon,authenticated;
CREATE POLICY catalog_read ON public.teachers FOR SELECT USING (true);
CREATE POLICY catalog_read ON public.courses FOR SELECT USING (true);
CREATE POLICY catalog_read ON public.colleges FOR SELECT USING (true);
CREATE POLICY catalog_read ON public.terms FOR SELECT USING (true);
CREATE POLICY catalog_read ON public.course_offerings FOR SELECT USING (true);
CREATE POLICY catalog_read ON public.point_rules FOR SELECT USING (true);

GRANT SELECT ON public.reviews TO anon,authenticated;
GRANT INSERT (id,teacher_id,course_id,year_term,attendance_strictness,grading_leniency,
  effort_matters,workload_difficulty,approachability,teaching_quality,comment,author_nickname,
  user_id,is_historical_migrated,status,created_at,likes) ON public.reviews TO authenticated;
GRANT UPDATE (course_id,year_term,attendance_strictness,grading_leniency,effort_matters,
  workload_difficulty,approachability,teaching_quality,comment,status,reject_reason) ON public.reviews TO authenticated;
GRANT DELETE ON public.reviews TO authenticated;
CREATE POLICY reviews_public_read ON public.reviews FOR SELECT USING (status='approved');
CREATE POLICY reviews_member_read ON public.reviews FOR SELECT TO authenticated
  USING (user_id=auth.uid()::text OR private.swjtu_admin_role() IS NOT NULL);
CREATE POLICY reviews_submit ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid()::text AND status='pending' AND NOT is_historical_migrated AND likes=0
    AND reviewer_id IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL);
CREATE POLICY reviews_author_edit ON public.reviews FOR UPDATE TO authenticated
  USING (user_id=auth.uid()::text AND status IN ('pending','rejected'))
  WITH CHECK (user_id=auth.uid()::text AND status='pending');
CREATE POLICY reviews_delete ON public.reviews FOR DELETE TO authenticated
  USING (private.swjtu_admin_role() IS NOT NULL OR (user_id=auth.uid()::text AND status IN ('pending','rejected')));

GRANT SELECT ON public.user_profiles,public.point_transactions TO authenticated;
CREATE POLICY points_owner_read ON public.user_profiles FOR SELECT TO authenticated USING (id=auth.uid()::text);
CREATE POLICY ledger_owner_read ON public.point_transactions FOR SELECT TO authenticated USING (user_id=auth.uid()::text);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_users TO authenticated;
CREATE POLICY admin_members_read ON public.admin_users FOR SELECT TO authenticated
  USING (private.swjtu_admin_role()='super_admin');
CREATE POLICY admin_members_manage ON public.admin_users FOR ALL TO authenticated
  USING (private.swjtu_admin_role()='super_admin')
  WITH CHECK (private.swjtu_admin_role()='super_admin' AND role IN ('super_admin','admin','moderator'));

-- Durable reward marker survives review deletion. It is never exposed through the API.
CREATE TABLE IF NOT EXISTS private.swjtu_review_rewards (
  review_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, awarded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.swjtu_review_rewards FROM PUBLIC,anon,authenticated;
-- Preserve known legacy awards, rather than issue them a second time.
INSERT INTO private.swjtu_review_rewards(review_id,user_id)
SELECT related_review_id,min(user_id) FROM public.point_transactions
WHERE related_review_id IS NOT NULL AND user_id IS NOT NULL AND amount>0
GROUP BY related_review_id ON CONFLICT DO NOTHING;
INSERT INTO private.swjtu_review_rewards(review_id,user_id)
SELECT id,user_id FROM public.reviews WHERE status='approved' AND user_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.swjtu_ensure_profile(p_user_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inserted_id TEXT; initial_points INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id=p_user_id) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id::text=p_user_id) THEN
    RAISE EXCEPTION 'Unknown authenticated user';
  END IF;
  SELECT points_delta INTO initial_points FROM public.point_rules WHERE action_code='new_user_welcome' AND is_active;
  IF initial_points IS NULL OR initial_points<0 THEN RAISE EXCEPTION '注册积分规则不可用'; END IF;
  INSERT INTO public.user_profiles(id,points) VALUES(p_user_id,initial_points)
    ON CONFLICT(id) DO NOTHING RETURNING id INTO inserted_id;
  IF inserted_id IS NOT NULL THEN
    INSERT INTO public.point_transactions(id,user_id,action,action_code,amount,balance_after)
    VALUES(gen_random_uuid()::text,p_user_id,'新用户注册赠送','new_user_welcome',initial_points,initial_points);
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.swjtu_ensure_profile(TEXT) FROM PUBLIC,anon,authenticated;

-- Keep the existing on_auth_user_created trigger. Adding another trigger would
-- duplicate the registration credit or interfere with its error handling.

DROP FUNCTION IF EXISTS public.handle_daily_checkin();
CREATE FUNCTION public.handle_daily_checkin()
RETURNS TABLE(points INTEGER,already_checked_in BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid TEXT:=auth.uid()::text; bal INTEGER; last_day DATE; reward INTEGER;
  today DATE:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  PERFORM private.swjtu_ensure_profile(uid);
  SELECT p.points,p.last_checkin_date INTO bal,last_day FROM public.user_profiles p WHERE p.id=uid FOR UPDATE;
  IF last_day=today THEN
    RETURN QUERY SELECT bal,true; RETURN;
  END IF;
  SELECT pr.points_delta INTO reward FROM public.point_rules pr WHERE pr.action_code='daily_checkin' AND pr.is_active;
  IF reward IS NULL OR reward<=0 THEN RAISE EXCEPTION '签到积分规则不可用'; END IF;
  UPDATE public.user_profiles p SET points=p.points+reward,last_checkin_date=today WHERE id=uid RETURNING p.points INTO bal;
  INSERT INTO public.point_transactions(id,user_id,action,action_code,amount,balance_after)
    VALUES(gen_random_uuid()::text,uid,'每日签到奖励','daily_checkin',reward,bal);
  RETURN QUERY SELECT bal,false;
END $$;

CREATE OR REPLACE FUNCTION public.spend_points(p_action_code TEXT,p_note TEXT DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid TEXT:=auth.uid()::text; bal INTEGER; cost INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_action_code NOT IN ('ai_question','smart_filter','guide_unlock') THEN RAISE EXCEPTION '不支持的积分消费类型'; END IF;
  SELECT pr.points_delta INTO cost FROM public.point_rules pr WHERE pr.action_code=p_action_code AND pr.is_active;
  IF cost IS NULL OR cost>=0 THEN RAISE EXCEPTION '积分消费规则不可用'; END IF;
  PERFORM private.swjtu_ensure_profile(uid);
  SELECT points INTO bal FROM public.user_profiles WHERE id=uid FOR UPDATE;
  IF bal+cost<0 THEN RAISE EXCEPTION 'insufficient points: 积分不足'; END IF;
  UPDATE public.user_profiles p SET points=p.points+cost WHERE id=uid RETURNING p.points INTO bal;
  INSERT INTO public.point_transactions(id,user_id,action,action_code,amount,balance_after)
    VALUES(gen_random_uuid()::text,uid,coalesce(p_note,'积分消费'),p_action_code,cost,bal);
  RETURN bal;
END $$;

-- Drop only these known signatures because older versions have incompatible return types.
DROP FUNCTION IF EXISTS public.approve_review(TEXT);
CREATE FUNCTION public.approve_review(p_review_id TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rev public.reviews%ROWTYPE; bal INTEGER; inserted_review TEXT; reviewer UUID; reward INTEGER;
BEGIN
  IF auth.uid() IS NULL OR private.swjtu_admin_role() IS NULL THEN RAISE EXCEPTION '无审核权限'; END IF;
  SELECT * INTO rev FROM public.reviews WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','评价不存在'); END IF;
  IF rev.status='approved' THEN RETURN jsonb_build_object('success',true,'points_awarded',false,'message','评价已审核通过'); END IF;
  IF rev.status NOT IN ('pending','rejected') OR rev.status IS NULL THEN RAISE EXCEPTION '无效的评价状态'; END IF;
  SELECT a.id INTO reviewer FROM public.admin_users a JOIN auth.users u ON lower(u.email)=lower(a.email) WHERE u.id=auth.uid() AND a.is_active;
  UPDATE public.reviews SET status='approved',reject_reason=NULL,reviewer_id=reviewer,reviewed_at=now() WHERE id=p_review_id;
  IF NOT coalesce(rev.is_historical_migrated,false) AND EXISTS (SELECT 1 FROM auth.users WHERE id::text=rev.user_id) THEN
    PERFORM private.swjtu_ensure_profile(rev.user_id);
    -- Serialize all balance changes to this author, including different reviews.
    PERFORM 1 FROM public.user_profiles WHERE id=rev.user_id FOR UPDATE;
    INSERT INTO private.swjtu_review_rewards(review_id,user_id) VALUES(rev.id,rev.user_id)
      ON CONFLICT DO NOTHING RETURNING review_id INTO inserted_review;
    IF inserted_review IS NOT NULL THEN
      SELECT pr.points_delta INTO reward FROM public.point_rules pr WHERE pr.action_code='review_approved' AND pr.is_active;
      IF reward IS NULL OR reward<=0 THEN RAISE EXCEPTION '评价奖励规则不可用'; END IF;
      UPDATE public.user_profiles p SET points=p.points+reward WHERE id=rev.user_id RETURNING p.points INTO bal;
      INSERT INTO public.point_transactions(id,user_id,action,action_code,amount,balance_after,related_review_id)
        VALUES(gen_random_uuid()::text,rev.user_id,'撰写教师评价审核通过','review_approved',reward,bal,rev.id);
    END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'points_awarded',inserted_review IS NOT NULL,'message','评价已通过审核');
END $$;

DROP FUNCTION IF EXISTS public.reject_review(TEXT,TEXT);
CREATE FUNCTION public.reject_review(p_review_id TEXT,p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE reviewer UUID;
BEGIN
  IF auth.uid() IS NULL OR private.swjtu_admin_role() IS NULL THEN RAISE EXCEPTION '无审核权限'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION '请填写驳回原因'; END IF;
  SELECT a.id INTO reviewer FROM public.admin_users a JOIN auth.users u ON lower(u.email)=lower(a.email) WHERE u.id=auth.uid() AND a.is_active;
  UPDATE public.reviews SET status='rejected',reject_reason=p_reason,reviewer_id=reviewer,reviewed_at=now() WHERE id=p_review_id;
  RETURN jsonb_build_object('success',FOUND,'message',CASE WHEN FOUND THEN '评价已被驳回' ELSE '评价不存在' END);
END $$;

-- Revoke default PUBLIC execution, including any old overloads of these RPCs.
DO $$ DECLARE v RECORD; BEGIN
  FOR v IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_my_admin_status','handle_daily_checkin','spend_points','approve_review','reject_review')
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',v.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_my_admin_status(),public.handle_daily_checkin(),
  public.spend_points(TEXT,TEXT),public.approve_review(TEXT),public.reject_review(TEXT,TEXT) TO authenticated;
-- Preserve Supabase's server role grant without making it a client credential.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.get_my_admin_status(),public.handle_daily_checkin(),
      public.spend_points(TEXT,TEXT),public.approve_review(TEXT),public.reject_review(TEXT,TEXT) TO service_role;
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
$p1_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'P1 dry-run stage: 04 permissions and RPCs [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $p1_stage$;


DO $p1_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $p1_sql$-- Synthetic users/data only. Must run inside a transaction ending in ROLLBACK.
-- Direct SQL inserts do not send authentication emails.
SELECT set_config('swjtu_test.student',gen_random_uuid()::text,true),
       set_config('swjtu_test.admin',gen_random_uuid()::text,true),
       set_config('swjtu_test.college',gen_random_uuid()::text,true),
       set_config('swjtu_test.course',gen_random_uuid()::text,true),
       set_config('swjtu_test.teacher','p1_test_'||gen_random_uuid()::text,true),
       set_config('swjtu_test.review','p1_test_'||gen_random_uuid()::text,true);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  (current_setting('swjtu_test.student')::uuid,'p1-student-'||current_setting('swjtu_test.student')||'@example.invalid',now()),
  (current_setting('swjtu_test.admin')::uuid,'p1-owner-'||current_setting('swjtu_test.admin')||'@example.invalid',now());
INSERT INTO public.admin_users(email,role) VALUES
  ('p1-owner-'||current_setting('swjtu_test.admin')||'@example.invalid','super_admin');
INSERT INTO public.colleges(id,name) VALUES(current_setting('swjtu_test.college')::uuid,'P1 test '||current_setting('swjtu_test.college'));
INSERT INTO public.courses(id,name,college_id) VALUES
  (current_setting('swjtu_test.course')::uuid,'P1 test course',current_setting('swjtu_test.college')::uuid);
INSERT INTO public.teachers(id,name,college_id) VALUES
  (current_setting('swjtu_test.teacher'),'P1 test teacher',current_setting('swjtu_test.college')::uuid);
UPDATE public.user_profiles SET points=500 WHERE id=current_setting('swjtu_test.student');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('swjtu_test.student'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('swjtu_test.student'),'role','authenticated')::text,true);
DO $$ BEGIN
  IF (public.get_my_admin_status()->>'is_admin')::boolean THEN RAISE EXCEPTION 'Student was granted administrator privileges'; END IF;
  BEGIN
    UPDATE public.user_profiles SET points=9999 WHERE id=auth.uid()::text;
    RAISE EXCEPTION 'Direct balance update unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.admin_users(email,role) VALUES('p1-escalation@example.invalid','super_admin');
    RAISE EXCEPTION 'Admin escalation unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.reviews(id,teacher_id,course_id,year_term,user_id,status,comment) VALUES
 (current_setting('swjtu_test.review'),current_setting('swjtu_test.teacher'),current_setting('swjtu_test.course')::uuid,
  '2026-2027第1学期',auth.uid()::text,'pending','P1 regression test; transaction will roll back');
DO $$ DECLARE result RECORD; configured_cost INTEGER; reward INTEGER; BEGIN
  SELECT points_delta INTO reward FROM public.point_rules WHERE action_code='daily_checkin';
  SELECT * INTO result FROM public.handle_daily_checkin();
  IF result.points<>500+reward OR result.already_checked_in THEN RAISE EXCEPTION 'First check-in failed'; END IF;
  SELECT * INTO result FROM public.handle_daily_checkin();
  IF result.points<>500+reward OR NOT result.already_checked_in THEN RAISE EXCEPTION 'Duplicate check-in credited twice'; END IF;
  SELECT points_delta INTO configured_cost FROM public.point_rules WHERE action_code='guide_unlock';
  IF public.spend_points('guide_unlock')<>500+reward+configured_cost THEN RAISE EXCEPTION 'Rule-based deduction failed'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub',current_setting('swjtu_test.admin'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('swjtu_test.admin'),'role','authenticated')::text,true);
DO $$ DECLARE result JSONB; BEGIN
  result:=public.approve_review(current_setting('swjtu_test.review'));
  IF (result->>'success')::boolean IS DISTINCT FROM true OR (result->>'points_awarded')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'First approval failed'; END IF;
  result:=public.approve_review(current_setting('swjtu_test.review'));
  IF (result->>'points_awarded')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Repeated approval awarded points'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE actual INTEGER; expected INTEGER; BEGIN
  SELECT 500+sum(points_delta) INTO expected FROM public.point_rules WHERE action_code IN ('daily_checkin','guide_unlock','review_approved');
  SELECT points INTO actual FROM public.user_profiles WHERE id=current_setting('swjtu_test.student');
  IF actual<>expected THEN RAISE EXCEPTION 'Incorrect final balance: %, expected %',actual,expected; END IF;
  IF (SELECT count(*) FROM public.point_transactions WHERE related_review_id=current_setting('swjtu_test.review'))<>1 THEN
    RAISE EXCEPTION 'Duplicate or missing review ledger record'; END IF;
  IF has_table_privilege('anon','public.user_profiles','TRUNCATE') THEN RAISE EXCEPTION 'Anonymous truncate grant remains'; END IF;
END $$;
$p1_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'P1 dry-run stage: 05 verification [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $p1_stage$;

ROLLBACK;
SELECT 'PASS: test data rolled back; no test users or balances retained' AS result;
