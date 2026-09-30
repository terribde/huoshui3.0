-- _tt_payload is loaded by the generator before this template runs.
CREATE TEMP TABLE _tt_sections ON COMMIT DROP AS
SELECT value AS data FROM _tt_payload, jsonb_array_elements(data->'sections');
CREATE TEMP TABLE _tt_report (metric text PRIMARY KEY, value bigint) ON COMMIT DROP;
-- Serialize against ordinary writes as well as a second instance of this importer.
-- In particular, another insertion cannot create a duplicate teacher between
-- name lookup and insert.
LOCK TABLE public.teachers,public.courses,public.colleges,public.terms,public.course_offerings IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO _tt_report
SELECT 'teachers_before',count(*) FROM public.teachers UNION ALL
SELECT 'courses_before',count(*) FROM public.courses UNION ALL
SELECT 'offerings_before',count(*) FROM public.course_offerings UNION ALL
SELECT 'sections_before',count(*) FROM public.timetable_sections;

DO $$
DECLARE payload jsonb; item jsonb; wanted_term uuid; college uuid; chosen uuid;
  teacher text; old_teacher text; candidate text[];
  old_status text; status text; course_ids uuid[]; pending_college uuid;
BEGIN
  SELECT data INTO STRICT payload FROM _tt_payload;
  INSERT INTO public.terms(year_term,is_current) VALUES(payload->>'term',false) ON CONFLICT(year_term) DO NOTHING;
  SELECT id INTO STRICT wanted_term FROM public.terms WHERE year_term=payload->>'term';
  IF (payload->>'set_current')::boolean THEN
    UPDATE public.terms SET is_current=(id=wanted_term) WHERE is_current IS DISTINCT FROM (id=wanted_term);
  END IF;

  -- Known aliases are explicit configuration. Unverified departments stay in
  -- source_department; they do not become invented college names.
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'courses') LOOP
    college:=NULL; chosen:=NULL;
    IF item->>'college' IS NOT NULL THEN
      INSERT INTO public.colleges(name,campus) VALUES(item->>'college','未知') ON CONFLICT(name) DO NOTHING;
      SELECT id INTO STRICT college FROM public.colleges WHERE name=item->>'college';
    END IF;
    SELECT course_id INTO chosen FROM public.timetable_course_keys WHERE source_key=item->>'key';
    IF item->>'override' IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=(item->>'override')::uuid) THEN
        RAISE EXCEPTION '课程映射目标不存在: %', item->>'key';
      END IF;
      IF chosen IS NOT NULL AND chosen<>(item->>'override')::uuid THEN
        RAISE EXCEPTION '已有课程映射不可被增量导入覆盖: %',item->>'key';
      END IF;
      chosen:=(item->>'override')::uuid;
    END IF;
    IF chosen IS NULL THEN
      -- Never attach an unknown-department course to an arbitrary legacy NULL college.
      SELECT array_agg(id) INTO course_ids FROM public.courses
      WHERE name=item->>'name' AND college_id=college AND college IS NOT NULL;
      IF cardinality(course_ids)>1 THEN RAISE EXCEPTION '课程存在多个候选，请配置 courseOverrides: %',item->>'key'; END IF;
      chosen:=course_ids[1];
      IF chosen IS NULL THEN
        INSERT INTO public.courses(name,college_id) VALUES(item->>'name',college) RETURNING id INTO chosen;
      END IF;
      INSERT INTO public.timetable_course_keys(source_key,course_code,source_department,course_id)
      VALUES(item->>'key',item->>'code',item->>'department',chosen);
    ELSE
      INSERT INTO public.timetable_course_keys(source_key,course_code,source_department,course_id)
      VALUES(item->>'key',item->>'code',item->>'department',chosen) ON CONFLICT(source_key) DO NOTHING;
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'teachers') LOOP
    teacher:=NULL; old_teacher:=NULL; old_status:=NULL; college:=NULL;
    SELECT teacher_id,match_status INTO old_teacher,old_status FROM public.timetable_teacher_links WHERE source_key=item->>'key';
    SELECT id INTO college FROM public.colleges WHERE name=item->>'college';
    SELECT array_agg(id ORDER BY id) INTO candidate FROM public.teachers
      WHERE lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=item->>'normalized_name';
    candidate:=coalesce(candidate,'{}');
    IF item->>'override' IS NOT NULL THEN
      teacher:=item->>'override'; status:='manual';
      IF NOT EXISTS(SELECT 1 FROM public.teachers WHERE id=teacher) THEN RAISE EXCEPTION '教师映射目标不存在: %',item->>'key'; END IF;
      IF old_teacher IS NOT NULL AND old_teacher<>teacher THEN RAISE EXCEPTION '已有教师关联不可被增量导入覆盖: %',item->>'key'; END IF;
    ELSIF old_teacher IS NOT NULL THEN
      teacher:=old_teacher; status:=old_status;
    ELSIF cardinality(candidate)=1 THEN
      -- College changes must not create a second page for the same teacher.
      teacher:=candidate[1]; status:='matched';
    ELSIF cardinality(candidate)=0 THEN
      -- Offering department is not proof of teacher affiliation.
      INSERT INTO public.colleges(name,campus) VALUES('课表教师院系待核实','未知') ON CONFLICT(name) DO NOTHING;
      SELECT id INTO STRICT pending_college FROM public.colleges WHERE name='课表教师院系待核实';
      teacher:=item->>'new_id'; status:='created';
      INSERT INTO public.teachers(id,name,title,college_id,campus,overall_score,review_count,
        attendance_strictness,grading_leniency,effort_matters,workload_difficulty,approachability,teaching_quality,
        has_historical_data,tags,rating_version)
      VALUES(teacher,item->>'name',item->>'new_title',pending_college,item->>'new_campus',
        NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,false,'[]',2);
    ELSE
      status:='pending';
    END IF;
    INSERT INTO public.timetable_teacher_links(source_key,source_name,source_department,teacher_id,match_status,candidate_ids,homepages)
    VALUES(item->>'key',item->>'name',item->>'department',teacher,status,candidate,item->'homepages')
    ON CONFLICT(source_key) DO UPDATE SET teacher_id=EXCLUDED.teacher_id,match_status=EXCLUDED.match_status,
      candidate_ids=EXCLUDED.candidate_ids
      WHERE timetable_teacher_links.teacher_id IS NULL;
  END LOOP;

  -- User-approved rule: one mapped college across this teacher's source rows
  -- updates affiliation, even if an older non-placeholder college differs.
  -- Several mapped colleges or none preserve the existing affiliation.
  CREATE TEMP TABLE _tt_college_proposals ON COMMIT DROP AS
    SELECT l.teacher_id,array_agg(DISTINCT c.id) FILTER(WHERE c.id IS NOT NULL) AS college_ids,
      array_agg(DISTINCT j.value->>'department') AS departments
    FROM jsonb_array_elements(payload->'teachers') j
    JOIN public.timetable_teacher_links l ON l.source_key=j.value->>'key'
    LEFT JOIN public.colleges c ON c.name=j.value->>'college'
    WHERE l.teacher_id IS NOT NULL GROUP BY l.teacher_id;
  INSERT INTO public.timetable_college_updates(source_digest,config_digest,teacher_id,old_college_id,new_college_id)
  SELECT payload->>'source_digest',payload->>'config_digest',t.id,t.college_id,p.college_ids[1]
    FROM _tt_college_proposals p JOIN public.teachers t ON t.id=p.teacher_id
    WHERE cardinality(p.college_ids)=1 AND t.college_id IS DISTINCT FROM p.college_ids[1]
    ON CONFLICT(source_digest,config_digest,teacher_id) DO NOTHING;
  WITH changed AS (
    UPDATE public.teachers t SET college_id=p.college_ids[1] FROM _tt_college_proposals p
    WHERE t.id=p.teacher_id AND cardinality(p.college_ids)=1 AND t.college_id IS DISTINCT FROM p.college_ids[1]
    RETURNING t.id
  ) INSERT INTO _tt_report SELECT 'teacher_colleges_updated',count(*) FROM changed;

  IF EXISTS(SELECT 1 FROM _tt_sections r JOIN public.timetable_sections s
      ON s.term_id=wanted_term AND s.selection_code=r.data->>'code'
      WHERE s.source_hash<>r.data->>'row_hash' OR s.source_row IS DISTINCT FROM r.data->'raw') THEN
    RAISE EXCEPTION '同学期同选课编号已有不同内容。本脚本仅补充新增，整批回滚，不覆盖旧课表。';
  END IF;
  INSERT INTO public.timetable_classes(code,name)
    SELECT value->>'code',value->>'name' FROM jsonb_array_elements(payload->'classes')
    ON CONFLICT(code) DO NOTHING;

  INSERT INTO public.timetable_sections(term_id,selection_code,course_key,primary_teacher_key,credits,nature,campus,
    preferred,enrolled,capacity,source_row,source_hash)
  SELECT wanted_term,data->>'code',data->>'course_key',data->>'teacher_key',(data->>'credits')::numeric,
    data->>'nature',data->>'campus',data->>'preferred',(data->>'enrolled')::integer,(data->>'capacity')::integer,
    data->'raw',data->>'row_hash' FROM _tt_sections
  ON CONFLICT(term_id,selection_code) DO NOTHING;

  INSERT INTO public.timetable_section_classes(section_id,class_code,source_class_name)
  SELECT s.id,c.value->>'code',c.value->>'name' FROM _tt_sections r
  JOIN public.timetable_sections s ON s.term_id=wanted_term AND s.selection_code=r.data->>'code'
  CROSS JOIN LATERAL jsonb_array_elements(r.data->'classes') c
  ON CONFLICT(section_id,class_code) DO NOTHING;

  INSERT INTO public.timetable_classrooms(campus,name)
  SELECT DISTINCT m.value->>'campus',m.value->>'room' FROM _tt_sections r,
    LATERAL jsonb_array_elements(r.data->'meetings') m WHERE m.value->>'room' IS NOT NULL
  ON CONFLICT(campus,name) DO NOTHING;

  INSERT INTO public.timetable_meetings(section_id,source_index,weeks,weekday,period_start,period_end,
    classroom_id,teacher_key,group_label,raw_schedule,raw_location)
  SELECT s.id,(m.value->>'index')::integer,ARRAY(SELECT jsonb_array_elements_text(m.value->'weeks')::integer),
    (m.value->>'weekday')::integer,(m.value->>'period_start')::integer,(m.value->>'period_end')::integer,
    room.id,m.value->>'teacher_key',m.value->>'group_label',m.value->>'raw_schedule',m.value->>'raw_location'
  FROM _tt_sections r JOIN public.timetable_sections s ON s.term_id=wanted_term AND s.selection_code=r.data->>'code'
  CROSS JOIN LATERAL jsonb_array_elements(r.data->'meetings') m
  LEFT JOIN public.timetable_classrooms room ON room.campus=m.value->>'campus' AND room.name=m.value->>'room'
  ON CONFLICT(section_id,source_index) DO NOTHING;

  -- Preserve the existing frontend's teacher/course/current-term query contract.
  INSERT INTO public.course_offerings(teacher_id,course_id,term_id)
  SELECT DISTINCT l.teacher_id,k.course_id,wanted_term FROM _tt_sections r
  JOIN public.timetable_sections s ON s.term_id=wanted_term AND s.selection_code=r.data->>'code'
  JOIN public.timetable_course_keys k ON k.source_key=s.course_key
  JOIN public.timetable_teacher_links l ON l.source_key=s.primary_teacher_key
  WHERE l.teacher_id IS NOT NULL
  UNION
  SELECT DISTINCT l.teacher_id,k.course_id,wanted_term FROM _tt_sections r
  JOIN public.timetable_sections s ON s.term_id=wanted_term AND s.selection_code=r.data->>'code'
  JOIN public.timetable_course_keys k ON k.source_key=s.course_key
  JOIN public.timetable_meetings m ON m.section_id=s.id
  JOIN public.timetable_teacher_links l ON l.source_key=m.teacher_key
  WHERE l.teacher_id IS NOT NULL
  ON CONFLICT(teacher_id,course_id,term_id) DO NOTHING;

  IF (SELECT count(*) FROM _tt_sections r JOIN public.timetable_sections s
      ON s.term_id=wanted_term AND s.selection_code=r.data->>'code') <> jsonb_array_length(payload->'sections') THEN
    RAISE EXCEPTION '导入选课记录数量不一致';
  END IF;
  IF (SELECT count(*) FROM _tt_sections r JOIN public.timetable_sections s
      ON s.term_id=wanted_term AND s.selection_code=r.data->>'code'
      JOIN public.timetable_meetings m ON m.section_id=s.id) <> (payload->'summary'->>'meetings')::bigint THEN
    RAISE EXCEPTION '导入时段数量不一致';
  END IF;
END $$;

INSERT INTO _tt_report
SELECT 'teachers_added',count(*)-(SELECT value FROM _tt_report WHERE metric='teachers_before') FROM public.teachers UNION ALL
SELECT 'courses_added',count(*)-(SELECT value FROM _tt_report WHERE metric='courses_before') FROM public.courses UNION ALL
SELECT 'offerings_added',count(*)-(SELECT value FROM _tt_report WHERE metric='offerings_before') FROM public.course_offerings UNION ALL
SELECT 'sections_added',count(*)-(SELECT value FROM _tt_report WHERE metric='sections_before') FROM public.timetable_sections;
SELECT * FROM _tt_report WHERE metric LIKE '%_added' OR metric='teacher_colleges_updated' ORDER BY metric;
SELECT t.id,t.name,old_c.name AS old_college,new_c.name AS new_college
FROM public.timetable_college_updates u JOIN public.teachers t ON t.id=u.teacher_id
LEFT JOIN public.colleges old_c ON old_c.id=u.old_college_id
JOIN public.colleges new_c ON new_c.id=u.new_college_id, _tt_payload p
WHERE u.source_digest=p.data->>'source_digest' AND u.config_digest=p.data->>'config_digest'
ORDER BY t.name;
SELECT l.source_key,l.source_name,l.source_department,l.match_status,l.candidate_ids
FROM public.timetable_teacher_links l, _tt_payload p
WHERE l.match_status='pending' AND l.source_key IN(SELECT value->>'key' FROM jsonb_array_elements(p.data->'teachers'))
ORDER BY l.source_department,l.source_name;
SELECT t.id,t.name,c.name AS current_college,p.departments,p.college_ids
FROM _tt_college_proposals p JOIN public.teachers t ON t.id=p.teacher_id
LEFT JOIN public.colleges c ON c.id=t.college_id
WHERE coalesce(cardinality(p.college_ids),0)<>1 ORDER BY t.name;
