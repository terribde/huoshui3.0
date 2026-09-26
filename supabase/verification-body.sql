-- Synthetic users/data only. Must run inside a transaction ending in ROLLBACK.
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
