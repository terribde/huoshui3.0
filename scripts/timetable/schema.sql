-- Included inside the import transaction. Does not change rating triggers or old data.
DO $$ BEGIN
  IF to_regclass('public.course_offerings') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='teachers' AND column_name='rating_version') THEN
    RAISE EXCEPTION '需要现有业务表和 community v2 结构。不要为导入课表重复执行旧评分反转。';
  END IF;
END $$;

-- An unrated new teacher must not receive synthetic default scores.
ALTER TABLE public.teachers
  ALTER COLUMN overall_score DROP NOT NULL, ALTER COLUMN overall_score DROP DEFAULT,
  ALTER COLUMN attendance_strictness DROP NOT NULL, ALTER COLUMN attendance_strictness DROP DEFAULT,
  ALTER COLUMN grading_leniency DROP NOT NULL, ALTER COLUMN grading_leniency DROP DEFAULT,
  ALTER COLUMN effort_matters DROP NOT NULL, ALTER COLUMN effort_matters DROP DEFAULT,
  ALTER COLUMN workload_difficulty DROP NOT NULL, ALTER COLUMN workload_difficulty DROP DEFAULT,
  ALTER COLUMN approachability DROP NOT NULL, ALTER COLUMN approachability DROP DEFAULT,
  ALTER COLUMN teaching_quality DROP NOT NULL, ALTER COLUMN teaching_quality DROP DEFAULT;

CREATE TABLE IF NOT EXISTS public.timetable_teacher_links (
  source_key text PRIMARY KEY,
  source_name text NOT NULL,
  source_department text NOT NULL,
  teacher_id text REFERENCES public.teachers(id),
  match_status text NOT NULL CHECK (match_status IN ('matched','created','manual','pending')),
  candidate_ids text[] NOT NULL DEFAULT '{}',
  homepages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.timetable_course_keys (
  source_key text PRIMARY KEY,
  course_code text NOT NULL,
  source_department text NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  UNIQUE(source_department, course_code)
);
CREATE TABLE IF NOT EXISTS public.timetable_college_updates (
  source_digest text NOT NULL,
  config_digest text NOT NULL,
  teacher_id text NOT NULL REFERENCES public.teachers(id),
  old_college_id uuid REFERENCES public.colleges(id),
  new_college_id uuid NOT NULL REFERENCES public.colleges(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_digest, config_digest, teacher_id)
);
ALTER TABLE public.timetable_college_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.timetable_college_updates FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.timetable_classes (
  code text PRIMARY KEY,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.timetable_classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus text NOT NULL,
  name text NOT NULL,
  UNIQUE(campus, name)
);
CREATE TABLE IF NOT EXISTS public.timetable_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.terms(id),
  selection_code text NOT NULL,
  course_key text NOT NULL REFERENCES public.timetable_course_keys(source_key),
  primary_teacher_key text REFERENCES public.timetable_teacher_links(source_key),
  credits numeric(6,2) NOT NULL CHECK(credits >= 0),
  nature text NOT NULL,
  campus text NOT NULL,
  preferred text NOT NULL,
  enrolled integer NOT NULL CHECK(enrolled >= 0),
  capacity integer CHECK(capacity >= 0),
  source_row jsonb NOT NULL,
  source_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(term_id, selection_code)
);
CREATE TABLE IF NOT EXISTS public.timetable_section_classes (
  section_id uuid NOT NULL REFERENCES public.timetable_sections(id) ON DELETE CASCADE,
  class_code text NOT NULL REFERENCES public.timetable_classes(code),
  source_class_name text,
  PRIMARY KEY(section_id, class_code)
);
CREATE TABLE IF NOT EXISTS public.timetable_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.timetable_sections(id) ON DELETE CASCADE,
  source_index integer NOT NULL CHECK(source_index > 0),
  weeks integer[] NOT NULL CHECK(cardinality(weeks)>0 AND array_position(weeks,NULL) IS NULL AND 1 <= ALL(weeks) AND 53 >= ALL(weeks)),
  weekday integer CHECK(weekday BETWEEN 1 AND 7),
  period_start integer,
  period_end integer,
  classroom_id uuid REFERENCES public.timetable_classrooms(id),
  teacher_key text REFERENCES public.timetable_teacher_links(source_key),
  group_label text,
  raw_schedule text NOT NULL,
  raw_location text NOT NULL,
  CHECK((weekday IS NULL AND period_start IS NULL AND period_end IS NULL)
     OR (weekday IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL
         AND period_start BETWEEN 1 AND 24 AND period_end BETWEEN period_start AND 24)),
  UNIQUE(section_id, source_index)
);
CREATE INDEX IF NOT EXISTS timetable_meetings_weeks_idx ON public.timetable_meetings USING gin(weeks);
CREATE INDEX IF NOT EXISTS timetable_meetings_day_idx ON public.timetable_meetings(weekday, period_start);
CREATE INDEX IF NOT EXISTS timetable_meetings_room_idx ON public.timetable_meetings(classroom_id);
CREATE INDEX IF NOT EXISTS timetable_meetings_teacher_idx ON public.timetable_meetings(teacher_key);
CREATE INDEX IF NOT EXISTS timetable_sections_teacher_idx ON public.timetable_sections(primary_teacher_key);
CREATE INDEX IF NOT EXISTS timetable_classes_sections_idx ON public.timetable_section_classes(class_code, section_id);
CREATE INDEX IF NOT EXISTS timetable_teacher_id_idx ON public.timetable_teacher_links(teacher_id);

-- Public course data may be read; imports require the database owner/service role.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['timetable_teacher_links','timetable_course_keys','timetable_classes',
    'timetable_classrooms','timetable_sections','timetable_section_classes','timetable_meetings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',t);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='timetable_read') THEN
      EXECUTE format('CREATE POLICY timetable_read ON public.%I FOR SELECT TO anon,authenticated USING(true)',t);
    END IF;
  END LOOP;
END $$;

-- Explicit per-meeting teacher takes precedence. An unresolved explicit teacher
-- must not silently fall back to the primary teacher.
CREATE OR REPLACE VIEW public.timetable_schedule WITH (security_invoker=true) AS
SELECT s.id AS section_id, s.selection_code, s.term_id, tr.year_term,
       k.course_code, k.course_id, c.name AS course_name, k.source_department,
       p.teacher_id AS primary_teacher_id, p.source_name AS primary_teacher_name,
       mt.teacher_id AS meeting_teacher_id, mt.source_name AS meeting_teacher_name,
       CASE WHEN m.teacher_key IS NOT NULL THEN mt.teacher_id ELSE p.teacher_id END AS teacher_id,
       CASE WHEN m.teacher_key IS NOT NULL THEN mt.source_name ELSE p.source_name END AS teacher_name,
       CASE WHEN m.teacher_key IS NOT NULL THEN mt.match_status ELSE p.match_status END AS teacher_match_status,
       s.credits, s.nature, s.campus AS section_campus, s.preferred, s.enrolled, s.capacity,
       m.id AS meeting_id, m.source_index, m.weeks, m.weekday, m.period_start, m.period_end,
       r.campus AS classroom_campus, r.name AS classroom, m.group_label, m.raw_schedule, m.raw_location,
       CASE WHEN m.id IS NULL THEN 'unknown' WHEN m.weekday IS NULL THEN 'weeks_only' ELSE 'scheduled' END AS schedule_status
FROM public.timetable_sections s
JOIN public.terms tr ON tr.id=s.term_id
JOIN public.timetable_course_keys k ON k.source_key=s.course_key
JOIN public.courses c ON c.id=k.course_id
LEFT JOIN public.timetable_teacher_links p ON p.source_key=s.primary_teacher_key
LEFT JOIN public.timetable_meetings m ON m.section_id=s.id
LEFT JOIN public.timetable_teacher_links mt ON mt.source_key=m.teacher_key
LEFT JOIN public.timetable_classrooms r ON r.id=m.classroom_id;
REVOKE ALL ON public.timetable_schedule FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.timetable_schedule TO anon,authenticated;
