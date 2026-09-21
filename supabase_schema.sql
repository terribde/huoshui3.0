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

-- 设定公开读取与审核规则 (公共查询教师与评价，支持管理员工作台审核、公示与驳回)
CREATE POLICY "Public can view teachers" ON public.teachers FOR SELECT USING (true);
CREATE POLICY "Public can view reviews" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Public can insert reviews" ON public.reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update reviews" ON public.reviews FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete reviews" ON public.reviews FOR DELETE USING (true);
CREATE POLICY "Public can view own profile" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Public can update own profile" ON public.user_profiles FOR ALL USING (true);
CREATE POLICY "Public can view transactions" ON public.point_transactions FOR SELECT USING (true);
CREATE POLICY "Public can insert transactions" ON public.point_transactions FOR INSERT WITH CHECK (true);

-- 管理员表 RLS: 允许客户端校验管理员身份状态
CREATE POLICY "Public can check active admin status" ON public.admin_users 
FOR SELECT USING (is_active = true);
CREATE POLICY "Public can manage admin users" ON public.admin_users 
FOR ALL USING (true);

-- ============================================================================
-- 6. 数据库 RPC 核心函数 (SECURITY DEFINER 规避 RLS 42501 权限异常)
-- ============================================================================

-- 6.1 每日签到函数 (handle_daily_checkin)
CREATE OR REPLACE FUNCTION public.handle_daily_checkin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id TEXT;
    v_current_points INT;
    v_last_checkin DATE;
    v_today DATE := CURRENT_DATE;
BEGIN
    -- 获取当前登录用户 ID (优先 auth.uid())
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be logged in to check in (未获取到登录身份)';
    END IF;

    -- 确保 user_profiles 行存在
    INSERT INTO public.user_profiles (id, points, last_checkin_date)
    VALUES (v_user_id, 100, NULL)
    ON CONFLICT (id) DO NOTHING;

    -- 读取当前积分与最后签到日期 (加行级排他锁)
    SELECT points, last_checkin_date INTO v_current_points, v_last_checkin
    FROM public.user_profiles
    WHERE id = v_user_id
    FOR UPDATE;

    -- 若今日已签到
    IF v_last_checkin = v_today THEN
        RETURN json_build_object(
            'points', v_current_points,
            'already_checked_in', true
        );
    END IF;

    -- 执行签到: +5 积分，更新签到日期
    v_current_points := v_current_points + 5;
    UPDATE public.user_profiles
    SET points = v_current_points,
        last_checkin_date = v_today
    WHERE id = v_user_id;

    -- 写入积分流水记录
    INSERT INTO public.point_transactions (id, user_id, action, amount, balance_after, timestamp)
    VALUES (
        'tx_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 4),
        v_user_id,
        '每日签到奖励 (PRD 5.0)',
        5,
        v_current_points,
        now()
    );

    RETURN json_build_object(
        'points', v_current_points,
        'already_checked_in', false
    );
END;
$$;

-- 6.2 消费积分函数 (spend_points)
CREATE OR REPLACE FUNCTION public.spend_points(
    p_action_code TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id TEXT;
    v_cost INT := 2;
    v_current_points INT;
    v_action_desc TEXT;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be logged in to spend points (未登录)';
    END IF;

    -- 确定消耗积分额度
    IF p_action_code = 'ai_question' THEN
        v_cost := 2;
        v_action_desc := COALESCE(p_note, '向交大学霸智囊提问消耗 (PRD 5.0)');
    ELSIF p_action_code = 'smart_filter' THEN
        v_cost := 2;
        v_action_desc := COALESCE(p_note, '智能选课偏好画像排序筛选消耗 (PRD 5.0)');
    ELSIF p_action_code = 'guide_unlock' THEN
        v_cost := 5;
        v_action_desc := COALESCE(p_note, '解锁交大高分选课避坑指南 (PRD 5.0)');
    ELSE
        v_cost := 2;
        v_action_desc := COALESCE(p_note, '消耗积分: ' || p_action_code);
    END IF;

    -- 读取并锁定当前积分
    SELECT points INTO v_current_points
    FROM public.user_profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_current_points IS NULL THEN
        v_current_points := 100;
        INSERT INTO public.user_profiles (id, points) VALUES (v_user_id, 100);
    END IF;

    IF v_current_points < v_cost THEN
        RAISE EXCEPTION 'insufficient points: 积分不足 (需要 % 分，当前 % 分)', v_cost, v_current_points;
    END IF;

    -- 扣减积分
    v_current_points := v_current_points - v_cost;
    UPDATE public.user_profiles
    SET points = v_current_points
    WHERE id = v_user_id;

    -- 记录流水
    INSERT INTO public.point_transactions (id, user_id, action, amount, balance_after, timestamp)
    VALUES (
        'tx_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 4),
        v_user_id,
        v_action_desc,
        -v_cost,
        v_current_points,
        now()
    );

    RETURN v_current_points;
END;
$$;

-- 授权匿名角色与已认证角色执行 RPC 函数
GRANT EXECUTE ON FUNCTION public.handle_daily_checkin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_points(TEXT, TEXT) TO anon, authenticated;
