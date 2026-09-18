-- ============================================================================
-- 西南交通大学专属教师评价系统 (SWJTU Teacher Evaluation)
-- Supabase Database Schema & Initial Tables
-- ============================================================================

-- 1. 教师表 (teachers)
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '讲师',
    college TEXT NOT NULL,
    campus TEXT NOT NULL DEFAULT '犀浦校区',
    courses JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_teaching_this_term BOOLEAN NOT NULL DEFAULT true,
    overall_score NUMERIC(3, 1) NOT NULL DEFAULT 4.5,
    review_count INTEGER NOT NULL DEFAULT 0,
    attendance_strictness NUMERIC(3, 1) NOT NULL DEFAULT 3.0,
    grading_leniency NUMERIC(3, 1) NOT NULL DEFAULT 4.0,
    effort_matters NUMERIC(3, 1) NOT NULL DEFAULT 4.0,
    workload_difficulty NUMERIC(3, 1) NOT NULL DEFAULT 3.0,
    approachability NUMERIC(3, 1) NOT NULL DEFAULT 4.0,
    teaching_quality NUMERIC(3, 1) NOT NULL DEFAULT 4.5,
    has_historical_data BOOLEAN NOT NULL DEFAULT false,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 评价记录表 (reviews)
CREATE TABLE IF NOT EXISTS public.reviews (
    id TEXT PRIMARY KEY,
    teacher_id TEXT REFERENCES public.teachers(id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    year_term TEXT NOT NULL,
    attendance_strictness NUMERIC(3, 1),
    grading_leniency NUMERIC(3, 1),
    effort_matters NUMERIC(3, 1),
    workload_difficulty NUMERIC(3, 1),
    approachability NUMERIC(3, 1),
    teaching_quality NUMERIC(3, 1),
    comment TEXT,
    author_nickname TEXT DEFAULT '匿名交大学子',
    user_id TEXT,
    user_email TEXT,
    is_historical_migrated BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'approved',
    rejection_reason TEXT,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 增量兼容更新 (如果已存在旧表，安全添加关联字段)
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_checkin_date DATE;

-- 3. 用户与积分表 (user_profiles)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 100,
    last_checkin_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. 积分变动记录表 (point_transactions)
CREATE TABLE IF NOT EXISTS public.point_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. 管理员动态配置表 (admin_users) - 存储审核管理员名单与权限
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin', -- 'super_admin' (超管) | 'admin' (审核员) | 'moderator' (学工助理)
    nickname TEXT DEFAULT '评教审核员',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 默认插入站长初始超管账号 (可自由新增或修改)
INSERT INTO public.admin_users (email, role, nickname, is_active)
VALUES 
    ('2502087135@qq.com', 'super_admin', '站长超管', true)
ON CONFLICT (email) DO UPDATE SET is_active = true, role = 'super_admin';

-- 启用 Row Level Security (RLS)
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 设定公开读取规则 (公共查询教师与过审评价永久免费)
CREATE POLICY "Public can view teachers" ON public.teachers FOR SELECT USING (true);
CREATE POLICY "Public can view approved reviews" ON public.reviews FOR SELECT USING (status = 'approved');
CREATE POLICY "Public can insert reviews" ON public.reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can view own profile" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Public can update own profile" ON public.user_profiles FOR ALL USING (true);
CREATE POLICY "Public can view transactions" ON public.point_transactions FOR SELECT USING (true);
CREATE POLICY "Public can insert transactions" ON public.point_transactions FOR INSERT WITH CHECK (true);

-- 管理员表 RLS: 允许客户端校验管理员身份状态
CREATE POLICY "Public can check active admin status" ON public.admin_users 
FOR SELECT USING (is_active = true);
CREATE POLICY "Public can manage admin users" ON public.admin_users 
FOR ALL USING (true);
