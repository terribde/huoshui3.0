-- COMMUNITY VERIFY v2: only AFTER the formal migration; test data rolls back.
BEGIN;

DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$-- Synthetic records only, inside the caller's rollback transaction.
DO $$ BEGIN
  IF to_regclass('private.swjtu_migrations') IS NULL THEN
    RAISE EXCEPTION 'Community v2 migration has not been applied: private.swjtu_migrations is missing'
      USING HINT = 'A successful dry-run rolls back the new tables. Run the formal migration before verify-community.sql; for a trial, run the WHOLE dry-run-community.sql.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.swjtu_migrations WHERE name='positive_ratings_v2') OR
     EXISTS(SELECT 1 FROM public.reviews WHERE rating_version<>2) THEN
    RAISE EXCEPTION 'Rating migration incomplete';
  END IF;
END $$;
SELECT set_config('swjtu_test.user',gen_random_uuid()::text,true),
  set_config('swjtu_test.college',gen_random_uuid()::text,true),
  set_config('swjtu_test.course',gen_random_uuid()::text,true),
  set_config('swjtu_test.teacher','test_'||gen_random_uuid()::text,true),
  set_config('swjtu_test.review','test_'||gen_random_uuid()::text,true);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(current_setting('swjtu_test.user')::uuid,
  'community-'||current_setting('swjtu_test.user')||'@example.invalid',now());
INSERT INTO public.colleges(id,name) VALUES(current_setting('swjtu_test.college')::uuid,current_setting('swjtu_test.college'));
INSERT INTO public.courses(id,name,college_id) VALUES(current_setting('swjtu_test.course')::uuid,'Test',current_setting('swjtu_test.college')::uuid);
INSERT INTO public.teachers(id,name,college_id) VALUES(current_setting('swjtu_test.teacher'),'Test',current_setting('swjtu_test.college')::uuid);
INSERT INTO public.reviews(id,teacher_id,course_id,year_term,user_id,status,rating_version,attendance_strictness,workload_difficulty)
 VALUES(current_setting('swjtu_test.review'),current_setting('swjtu_test.teacher'),current_setting('swjtu_test.course')::uuid,
 'test',current_setting('swjtu_test.user'),'approved',2,5,5);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('swjtu_test.user'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('swjtu_test.user'),'role','authenticated')::text,true);
DO $$ DECLARE r JSONB; BEGIN
  r:=public.set_review_like(current_setting('swjtu_test.review'),true);
  r:=public.set_review_like(current_setting('swjtu_test.review'),true);
  IF (r->>'likes')::int<>1 THEN RAISE EXCEPTION 'Duplicate like / self-like failure'; END IF;
  r:=public.set_review_like(current_setting('swjtu_test.review'),false);
  IF (r->>'likes')::int<>0 THEN RAISE EXCEPTION 'Unlike failure'; END IF;
  BEGIN
    UPDATE public.reviews SET likes=100 WHERE id=current_setting('swjtu_test.review');
    RAISE EXCEPTION 'Direct count update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community verify stage: 08 verification [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;

ROLLBACK;
SELECT 'PASS: community v2 tests rolled back' AS result;
