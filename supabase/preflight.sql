-- Read-only. One result cell contains the complete structural report.
SELECT jsonb_pretty(jsonb_build_object(
  'columns', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ('teachers','reviews','user_profiles','point_transactions','admin_users',
                        'courses','colleges','course_offerings','terms','point_rules')
    ORDER BY table_name,ordinal_position
  ) x),
  'policies', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'
  ) x),
  'triggers', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
      pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS function_definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth')
  ) x),
  'functions', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition,p.proacl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('handle_daily_checkin','spend_points','approve_review','reject_review','get_my_admin_status')
  ) x),
  'grants', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
  ) x),
  'constraints', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT c.relname AS table_name,k.conname AS constraint_name,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
  ) x),
  'point_rules', (SELECT jsonb_agg(to_jsonb(r)) FROM public.point_rules r)
)) AS schema_report;
