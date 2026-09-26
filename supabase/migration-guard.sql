-- Stop before making changes if the deployed schema differs from the supported baseline.
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('teachers','id','text'), ('reviews','id','text'), ('reviews','teacher_id','text'),
    ('reviews','user_id','text'), ('user_profiles','id','text'), ('user_profiles','points','int4'),
    ('point_transactions','id','text'), ('point_transactions','user_id','text'),
    ('admin_users','id','uuid'), ('courses','id','uuid'), ('terms','id','uuid'),
    ('colleges','id','uuid'), ('reviews','course_id','uuid')
  ) AS expected(tbl,col,typ)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=v.tbl AND c.column_name=v.col AND c.udt_name=v.typ) THEN
      RAISE EXCEPTION 'Unsupported type for %.%; run supabase/preflight.sql and adapt migration first',v.tbl,v.col;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
      AND ((n.nspname='auth' AND c.relname='users') OR
           (n.nspname='public' AND c.relname IN ('reviews','user_profiles','point_transactions')))
      AND NOT ((n.nspname='auth' AND c.relname='users' AND t.tgname='on_auth_user_created')
        OR (n.nspname='public' AND c.relname='reviews' AND t.tgname='trg_recalc_teacher_scores'))
  ) THEN
    RAISE EXCEPTION 'Existing business triggers need review before migration (avoid duplicate welcome/review rewards). Run preflight.';
  END IF;
END $$;
