-- Migration: 教务通知 (bksy.swjtu.edu.cn) 表、读取策略、爬虫账号写入策略
-- 在 Supabase SQL 编辑器中整份粘贴并运行一次即可；重复运行不会报错。
--
-- 运行前提：已存在 public.admin_users、auth.users，以及 anon / authenticated 角色（Supabase 默认具备）。
-- 运行后还需手动做两件事（见文件末尾注释）：创建爬虫登录用户，并在 admin_users 里登记 role='crawler'。
BEGIN;

-- 1. 通知表（放在 public，供前端和 Node API 读取；写入权限由下面的 RLS 限制）
CREATE TABLE IF NOT EXISTS public.notices (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url                 TEXT        NOT NULL UNIQUE,                  -- 通知完整网址，用于去重
  title               TEXT        NOT NULL,
  published_on        DATE        NOT NULL,                         -- 发布日期
  categories          TEXT[]      NOT NULL DEFAULT '{}',            -- 所属分类（拼音缩写，如 jxyx、jsfz）；同一篇可属多个分类
  content             TEXT,                                         -- 正文：第一版不抓，先留空
  content_fetched_at  TIMESTAMPTZ,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notices_title_len  CHECK (char_length(title) BETWEEN 1 AND 500)
);

-- 只允许 https 且属于 swjtu.edu.cn 的链接（通知可能指向学院网站或 PDF 附件）。
-- 单独写成 DROP + ADD，这样已经建过表的库重新运行本文件也会更新这条限制。
ALTER TABLE public.notices DROP CONSTRAINT IF EXISTS notices_url_origin;
ALTER TABLE public.notices ADD CONSTRAINT notices_url_origin
  CHECK (url ~* '^https://([a-z0-9-]+\.)*swjtu\.edu\.cn/');

CREATE INDEX IF NOT EXISTS notices_published_idx  ON public.notices (published_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS notices_categories_idx ON public.notices USING GIN (categories);

-- 2. 判断“当前登录用户是不是爬虫账号”
--    只认 admin_users 里 role='crawler' 的账号；现有的 swjtu_admin_role() 只认
--    super_admin / admin / moderator，所以爬虫账号不会获得审核评价等管理员权限。
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.swjtu_is_crawler() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a
    JOIN auth.users u ON lower(u.email) = lower(a.email)
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
      AND a.is_active AND a.role = 'crawler')
$$;
REVOKE ALL ON FUNCTION private.swjtu_is_crawler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.swjtu_is_crawler() TO authenticated;

-- 3. 权限：先收回全部，再逐项授权（与现有表保持一致的写法）
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notices FROM PUBLIC, anon, authenticated;

-- 所有人可读
GRANT SELECT ON public.notices TO anon, authenticated;
DROP POLICY IF EXISTS notices_public_read ON public.notices;
CREATE POLICY notices_public_read ON public.notices FOR SELECT USING (true);

-- 只有爬虫账号可新增、更新；没有人可以删除
GRANT INSERT, UPDATE ON public.notices TO authenticated;
DROP POLICY IF EXISTS notices_crawler_insert ON public.notices;
CREATE POLICY notices_crawler_insert ON public.notices FOR INSERT TO authenticated
  WITH CHECK (private.swjtu_is_crawler());
DROP POLICY IF EXISTS notices_crawler_update ON public.notices;
CREATE POLICY notices_crawler_update ON public.notices FOR UPDATE TO authenticated
  USING (private.swjtu_is_crawler()) WITH CHECK (private.swjtu_is_crawler());

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ---------------------------------------------------------------------------
-- 运行本文件之后，还需要手动做（不放进迁移，因为含账号信息）：
--   1. Supabase 后台 Authentication -> Users -> Add user：
--      使用专用邮箱 + 强密码，并勾选“自动确认邮箱”。
--   2. 在 SQL 编辑器执行（把邮箱换成上一步的邮箱）：
--        INSERT INTO public.admin_users (email, role, nickname)
--        VALUES ('<爬虫账号邮箱>', 'crawler', '通知爬虫');
--   3. 把邮箱和密码交给部署者，放进服务器的环境变量文件（不进 Git、不放前端）。
-- ---------------------------------------------------------------------------
