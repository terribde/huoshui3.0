-- Canonical empty-database schema. Existing databases use the guarded migration.
CREATE TABLE public.colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL, campus TEXT NOT NULL DEFAULT '犀浦校区',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, college_id UUID REFERENCES public.colleges(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(name,college_id)
);
CREATE TABLE public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), year_term TEXT NOT NULL UNIQUE, is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.teachers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL DEFAULT '讲师',
  college_id UUID NOT NULL REFERENCES public.colleges(id),
  campus TEXT NOT NULL DEFAULT '犀浦校区',
  overall_score NUMERIC(3,1) NOT NULL DEFAULT 4.5, review_count INTEGER NOT NULL DEFAULT 0,
  attendance_strictness NUMERIC(3,1) NOT NULL DEFAULT 3,
  grading_leniency NUMERIC(3,1) NOT NULL DEFAULT 4,
  effort_matters NUMERIC(3,1) NOT NULL DEFAULT 4,
  workload_difficulty NUMERIC(3,1) NOT NULL DEFAULT 3,
  approachability NUMERIC(3,1) NOT NULL DEFAULT 4,
  teaching_quality NUMERIC(3,1) NOT NULL DEFAULT 4.5,
  has_historical_data BOOLEAN NOT NULL DEFAULT false, tags JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.course_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE, term_id UUID NOT NULL REFERENCES public.terms(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, course_id, term_id)
);
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', nickname TEXT DEFAULT '评教审核员',
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.user_profiles (
  id TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 100, last_checkin_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.point_rules (
  action_code TEXT PRIMARY KEY, label TEXT NOT NULL, points_delta INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, description TEXT
);
INSERT INTO public.point_rules(action_code,label,points_delta,is_active) VALUES
('new_user_welcome','新用户注册欢迎礼',100,true),('system_init','系统初始化赠送积分',100,false),
('review_approved','撰写教师评价审核通过',20,true),('daily_checkin','每日签到奖励',5,true),
('ai_question','AI 智能问答提问',-2,true),('smart_filter','智能筛选推荐',-3,true),('guide_unlock','攻略类内容解锁',-10,true);
CREATE TABLE public.point_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  action_code TEXT REFERENCES public.point_rules(action_code), amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL, related_review_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.reviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id TEXT REFERENCES public.teachers(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id), year_term TEXT NOT NULL,
  attendance_strictness NUMERIC(3,1), grading_leniency NUMERIC(3,1), effort_matters NUMERIC(3,1),
  workload_difficulty NUMERIC(3,1), approachability NUMERIC(3,1), teaching_quality NUMERIC(3,1),
  comment TEXT, author_nickname TEXT DEFAULT '匿名交大学子', user_id TEXT,
  is_historical_migrated BOOLEAN DEFAULT false, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reject_reason TEXT, reviewer_id UUID REFERENCES public.admin_users(id),
  reviewed_at TIMESTAMPTZ, likes INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_related_review_id_fkey FOREIGN KEY(related_review_id) REFERENCES public.reviews(id);
