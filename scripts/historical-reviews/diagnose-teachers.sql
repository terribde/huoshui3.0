-- Read only. Uses the already uploaded 2115 records; changes no data.
WITH expected AS (
  SELECT
    payload_text::jsonb->'review'->>'teacher_id' AS teacher_id,
    payload_text::jsonb->>'teacher_name' AS expected_name,
    max(/* REQUIRED_TEACHER_COLLEGE */) AS required_college_id,
    count(*) AS affected_reviews,
    count(*) FILTER (WHERE payload_text::jsonb->>'college_id_required' IS NOT NULL)
      AS reviews_requiring_college_match
  FROM public.legacy_review_upload_20261013
  GROUP BY 1,2
), checked AS (
  SELECT e.*,t.name AS current_name,t.rating_version AS current_rating_version,
    t.college_id AS current_college_id,
    t.id IS NULL AS teacher_missing,
    btrim(t.name,E' \t\r\n') IS DISTINCT FROM e.expected_name AS name_mismatch,
    t.rating_version IS DISTINCT FROM 2 AS rating_version_mismatch,
    (e.required_college_id IS NOT NULL
      AND t.college_id::text IS DISTINCT FROM e.required_college_id) AS college_mismatch
  FROM expected e LEFT JOIN public.teachers t ON t.id=e.teacher_id
)
SELECT teacher_id,
  concat_ws('；',
    CASE WHEN teacher_missing THEN '教师 ID 在线上不存在' END,
    CASE WHEN NOT teacher_missing AND name_mismatch THEN '姓名不一致' END,
    CASE WHEN NOT teacher_missing AND rating_version_mismatch THEN '评分版本不是 2' END,
    CASE WHEN NOT teacher_missing AND college_mismatch THEN '同名课程消歧所需学院不一致' END
  ) AS problem,
  affected_reviews,reviews_requiring_college_match,
  expected_name,current_name,
  to_json(current_name)::text AS current_name_with_escapes,
  2 AS expected_rating_version,current_rating_version,
  required_college_id,ec.name AS expected_college,
  current_college_id,cc.name AS current_college
FROM checked c
LEFT JOIN public.colleges ec ON ec.id::text=c.required_college_id
LEFT JOIN public.colleges cc ON cc.id=c.current_college_id
WHERE teacher_missing OR name_mismatch OR rating_version_mismatch OR college_mismatch
ORDER BY teacher_id;
