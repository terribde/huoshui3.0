-- COMMUNITY DRY RUN v2: run this WHOLE file; all changes roll back.
BEGIN;

DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
DO $$ BEGIN
  IF to_regprocedure('public.get_my_admin_status()') IS NULL THEN
    RAISE EXCEPTION 'Apply the P1 migration first';
  END IF;
END $$;
LOCK TABLE public.reviews, public.teachers IN ACCESS EXCLUSIVE MODE;
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 01 P1 check [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;


DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 02 private schema [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;


DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
CREATE TABLE IF NOT EXISTS private.swjtu_migrations (
  name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.swjtu_rating_backup (
  table_name TEXT NOT NULL, record_id TEXT NOT NULL, payload JSONB NOT NULL,
  PRIMARY KEY(table_name,record_id)
);
REVOKE ALL ON private.swjtu_migrations,private.swjtu_rating_backup FROM PUBLIC,anon,authenticated;
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 03 migration tables [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;


DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS rating_version INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.swjtu_migrations WHERE name='positive_ratings_v2') THEN
    IF EXISTS (SELECT 1 FROM public.reviews r CROSS JOIN LATERAL
      unnest(ARRAY[r.attendance_strictness,r.workload_difficulty]) AS s(value)
      WHERE value IS NOT NULL AND NOT (value BETWEEN 1 AND 5))
      OR EXISTS (SELECT 1 FROM public.teachers t CROSS JOIN LATERAL
      unnest(ARRAY[t.attendance_strictness,t.workload_difficulty]) AS s(value)
      WHERE value IS NOT NULL AND NOT (value BETWEEN 1 AND 5)) THEN
      RAISE EXCEPTION 'Out-of-range legacy attendance/workload scores; inspect before conversion';
    END IF;
    INSERT INTO private.swjtu_rating_backup SELECT 'reviews',id,to_jsonb(r) FROM public.reviews r;
    INSERT INTO private.swjtu_rating_backup SELECT 'teachers',id,to_jsonb(t) FROM public.teachers t;
    -- Avoid repeated aggregation and double reversal of teacher caches during conversion.
    ALTER TABLE public.reviews DISABLE TRIGGER trg_recalc_teacher_scores;
    UPDATE public.reviews SET attendance_strictness=6-attendance_strictness,
      workload_difficulty=6-workload_difficulty,rating_version=2;
    UPDATE public.teachers SET attendance_strictness=6-attendance_strictness,
      workload_difficulty=6-workload_difficulty,rating_version=2;
    -- Teachers with no approved raw reviews retain their converted historical dimensions.
    UPDATE public.teachers SET overall_score=(attendance_strictness+grading_leniency+effort_matters+
      workload_difficulty+approachability+teaching_quality)/6;
    UPDATE public.teachers t SET review_count=a.n,
      attendance_strictness=coalesce(a.attendance,t.attendance_strictness),
      grading_leniency=coalesce(a.grading,t.grading_leniency),
      effort_matters=coalesce(a.effort,t.effort_matters),
      workload_difficulty=coalesce(a.workload,t.workload_difficulty),
      approachability=coalesce(a.approach,t.approachability),
      teaching_quality=coalesce(a.quality,t.teaching_quality),
      overall_score=coalesce(a.overall,t.overall_score)
    FROM (SELECT r.teacher_id,count(*) AS n,avg(r.attendance_strictness) AS attendance,
      avg(r.grading_leniency) AS grading,avg(r.effort_matters) AS effort,
      avg(r.workload_difficulty) AS workload,avg(r.approachability) AS approach,
      avg(r.teaching_quality) AS quality,
      avg((SELECT avg(v) FROM unnest(ARRAY[r.attendance_strictness,r.grading_leniency,
        r.effort_matters,r.workload_difficulty,r.approachability,r.teaching_quality]) v)) AS overall
      FROM public.reviews r WHERE status='approved' GROUP BY teacher_id) a WHERE t.id=a.teacher_id;
    ALTER TABLE public.reviews ENABLE TRIGGER trg_recalc_teacher_scores;
    INSERT INTO private.swjtu_migrations(name) VALUES('positive_ratings_v2');
  END IF;
END $$;
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 04 ratings conversion [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;


DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
ALTER TABLE public.teachers ALTER COLUMN rating_version SET DEFAULT 2;
COMMENT ON COLUMN public.teachers.attendance_strictness IS 'v2 考勤宽松度：1 每节必点，5 几乎不点名';
COMMENT ON COLUMN public.reviews.attendance_strictness IS 'v2 考勤宽松度：1 每节必点，5 几乎不点名';
COMMENT ON COLUMN public.teachers.workload_difficulty IS 'v2 作业轻松度：1 作业繁重，5 作业少负担轻';
COMMENT ON COLUMN public.reviews.workload_difficulty IS 'v2 作业轻松度：1 作业繁重，5 作业少负担轻';
-- Keep reviews default 1: an old client omitting the version must fail, not mislabel data.
GRANT INSERT(rating_version),UPDATE(rating_version) ON public.reviews TO authenticated;
CREATE OR REPLACE FUNCTION private.swjtu_check_rating_version() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.rating_version<>2 THEN RAISE EXCEPTION '评分规则已更新，请刷新页面后重试'; END IF;
  IF current_user IN ('authenticated','anon') AND
    coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-rating-version','')<>'2' THEN
    RAISE EXCEPTION '评分规则已更新，请刷新页面后重试';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[NEW.attendance_strictness,NEW.grading_leniency,NEW.effort_matters,
    NEW.workload_difficulty,NEW.approachability,NEW.teaching_quality]) s WHERE s IS NOT NULL AND NOT(s BETWEEN 1 AND 5)) THEN
    RAISE EXCEPTION '评分必须在 1 到 5 分之间';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.swjtu_check_rating_version() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS swjtu_check_rating_version ON public.reviews;
CREATE TRIGGER swjtu_check_rating_version BEFORE INSERT OR UPDATE OF rating_version,
  attendance_strictness,grading_leniency,effort_matters,workload_difficulty,approachability,teaching_quality
  ON public.reviews FOR EACH ROW EXECUTE FUNCTION private.swjtu_check_rating_version();

$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 05 rating guard [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;


DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS legacy_likes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.review_likes (
  review_id TEXT NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(review_id,user_id)
);
CREATE INDEX IF NOT EXISTS review_likes_user_idx ON public.review_likes(user_id);
COMMENT ON TABLE public.review_likes IS '登录用户的评价点赞明细，允许自赞，每用户每评价最多一条，可取消';
COMMENT ON COLUMN public.reviews.legacy_likes IS '迁移前没有用户明细的历史点赞基数';
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_likes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.review_likes TO authenticated;
DROP POLICY IF EXISTS likes_read_own ON public.review_likes;
CREATE POLICY likes_read_own ON public.review_likes FOR SELECT TO authenticated USING(user_id=auth.uid());
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.swjtu_migrations WHERE name='review_likes_v1') THEN
    UPDATE public.reviews SET likes=greatest(coalesce(likes,0),0),legacy_likes=greatest(coalesce(likes,0),0);
    INSERT INTO private.swjtu_migrations(name) VALUES('review_likes_v1');
  END IF;
END $$;
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 06 likes storage [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;


DO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$
-- Keep counts correct even when a user is deleted (FK cascades remove their likes).
CREATE OR REPLACE FUNCTION private.swjtu_count_review_like() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.reviews SET likes=coalesce(likes,0)+1 WHERE id=NEW.review_id;
  ELSE
    UPDATE public.reviews SET likes=greatest(legacy_likes,coalesce(likes,0)-1) WHERE id=OLD.review_id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.swjtu_count_review_like() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS swjtu_count_review_like ON public.review_likes;
CREATE TRIGGER swjtu_count_review_like AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW EXECUTE FUNCTION private.swjtu_count_review_like();
CREATE OR REPLACE FUNCTION public.set_review_like(p_review_id TEXT,p_liked BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid UUID:=auth.uid(); review_status TEXT; total INTEGER;
BEGIN
  IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=uid) THEN RAISE EXCEPTION '请先登录后点赞'; END IF;
  IF p_liked IS NULL THEN RAISE EXCEPTION '请明确点赞或取消点赞'; END IF;
  SELECT status INTO review_status FROM public.reviews WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '评价不存在'; END IF;
  IF p_liked AND review_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION '只能点赞已通过审核的评价'; END IF;
  IF p_liked THEN
    INSERT INTO public.review_likes(review_id,user_id) VALUES(p_review_id,uid) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.review_likes WHERE review_id=p_review_id AND user_id=uid;
  END IF;
  SELECT likes INTO total FROM public.reviews WHERE id=p_review_id;
  RETURN jsonb_build_object('likes',total,'liked',p_liked);
END $$;
REVOKE ALL ON FUNCTION public.set_review_like(TEXT,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_review_like(TEXT,BOOLEAN) TO authenticated;
NOTIFY pgrst,'reload schema';
$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community dry-run stage: 07 likes functions [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;

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
    MESSAGE = 'Community dry-run stage: 08 verification [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;

ROLLBACK;
SELECT 'PASS: community v2 tests rolled back' AS result;
