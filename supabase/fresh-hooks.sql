-- New databases only. Production already has these triggers; migration preserves them.
CREATE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM private.swjtu_ensure_profile(NEW.id::text); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.recalc_teacher_scores() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_teacher_id TEXT;
BEGIN
  target_teacher_id:=coalesce(NEW.teacher_id,OLD.teacher_id);
  UPDATE public.teachers t SET review_count=a.review_count,
    attendance_strictness=coalesce(a.attendance_strictness,t.attendance_strictness),
    grading_leniency=coalesce(a.grading_leniency,t.grading_leniency),
    effort_matters=coalesce(a.effort_matters,t.effort_matters),
    workload_difficulty=coalesce(a.workload_difficulty,t.workload_difficulty),
    approachability=coalesce(a.approachability,t.approachability),
    teaching_quality=coalesce(a.teaching_quality,t.teaching_quality),
    overall_score=coalesce(a.overall_score,t.overall_score)
  FROM (
    SELECT count(*) AS review_count, avg(attendance_strictness) AS attendance_strictness,
      avg(grading_leniency) AS grading_leniency, avg(effort_matters) AS effort_matters,
      avg(workload_difficulty) AS workload_difficulty, avg(approachability) AS approachability,
      avg(teaching_quality) AS teaching_quality,
      avg((coalesce(attendance_strictness,0)+coalesce(grading_leniency,0)+coalesce(effort_matters,0)+
           coalesce(workload_difficulty,0)+coalesce(approachability,0)+coalesce(teaching_quality,0)) /
          nullif((attendance_strictness IS NOT NULL)::int+(grading_leniency IS NOT NULL)::int+
            (effort_matters IS NOT NULL)::int+(workload_difficulty IS NOT NULL)::int+
            (approachability IS NOT NULL)::int+(teaching_quality IS NOT NULL)::int,0)) AS overall_score
    FROM public.reviews WHERE teacher_id=target_teacher_id AND status='approved'
  ) a WHERE t.id=target_teacher_id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.recalc_teacher_scores() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_recalc_teacher_scores AFTER INSERT OR DELETE OR UPDATE OF status,
  attendance_strictness,grading_leniency,effort_matters,workload_difficulty,approachability,teaching_quality
  ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.recalc_teacher_scores();
