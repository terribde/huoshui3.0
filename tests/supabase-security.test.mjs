import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const student = '00000000-0000-0000-0000-000000000001';
const admin = '00000000-0000-0000-0000-000000000002';
const other = '00000000-0000-0000-0000-000000000003';
const college = '10000000-0000-0000-0000-000000000001';
const course = '20000000-0000-0000-0000-000000000001';
const schema = () => fs.readFileSync(new URL('../supabase_schema.sql', import.meta.url), 'utf8');
const migration = () => fs.readFileSync(new URL('../supabase/migrations/20260924_p1_security.sql', import.meta.url), 'utf8');
async function createDB({production=false}={}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,email_confirmed_at TIMESTAMPTZ);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
  `);
  if (production) {
    await db.exec(fs.readFileSync(new URL('../supabase/base-schema.sql',import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL('./fixtures/production-before-p1.sql',import.meta.url),'utf8'));
    // Preserve the same score trigger during the migration, too.
    const hooks=fs.readFileSync(new URL('../supabase/fresh-hooks.sql',import.meta.url),'utf8');
    await db.exec(hooks.slice(hooks.indexOf('CREATE FUNCTION public.recalc_teacher_scores')));
  } else {
    await db.exec(schema());
  }
  await db.exec(`
    INSERT INTO auth.users VALUES
      ('${student}','student@example.test',now()),('${admin}','owner@example.test',now()),
      ('${other}','admin-student@swjtu.edu.cn',now());
    INSERT INTO public.admin_users(email,role) VALUES('owner@example.test','super_admin');
    INSERT INTO public.colleges(id,name) VALUES('${college}','Test college');
    INSERT INTO public.courses(id,name,college_id) VALUES('${course}','Test course','${college}');
    INSERT INTO public.teachers(id,name,college_id) VALUES('teacher','Test teacher','${college}');
  `);
  return db;
}
async function asUser(db, uid, sql, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${uid || ''}',false);`);
  try { return await db.query(sql); }
  finally { await db.exec('RESET ROLE'); }
}
const reviewInsert = (id = 'review', status = 'pending', user = student) =>
  `INSERT INTO public.reviews(id,teacher_id,course_id,year_term,user_id,status)
   VALUES('${id}','teacher','${course}','2026-1','${user}','${status}')`;

test('fresh schema plus repeated migration preserves accounts, balances and admin revocation', async () => {
  const db = await createDB();
  try {
    await db.exec(`UPDATE public.user_profiles SET points=500 WHERE id='${student}'; UPDATE public.admin_users SET is_active=false;`);
    await db.exec(migration());
    await db.exec(migration());
    assert.equal((await db.query(`SELECT points FROM public.user_profiles WHERE id='${student}'`)).rows[0].points,500);
    assert.equal((await db.query('SELECT is_active FROM public.admin_users')).rows[0].is_active,false);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.point_transactions WHERE user_id='${student}'`)).rows[0].n,1);
  } finally { await db.close(); }
});

test('upgrade the reported production layout: repair missing action column and preserve triggers, grants and balances',async()=>{
  const db=await createDB({production:true});
  try {
    await db.exec(`UPDATE user_profiles SET points=500 WHERE id='${student}';`);
    await asUser(db,student,reviewInsert());
    await assert.rejects(asUser(db,student,"SELECT spend_points('ai_question')"),/action/);
    await assert.rejects(asUser(db,student,'SELECT * FROM handle_daily_checkin()'),/action/);
    const triggersBefore=await db.query("SELECT tgname,pg_get_functiondef(tgfoid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname");
    assert.equal((await db.query("SELECT to_regnamespace('private') AS schema")).rows[0].schema,null);
    await db.exec(fs.readFileSync(new URL('../supabase/dry-run-p1.sql',import.meta.url),'utf8'));
    assert.equal((await db.query("SELECT to_regnamespace('private') AS schema")).rows[0].schema,null);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM auth.users")).rows[0].n,3);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='point_transactions' AND column_name='action'")).rows[0].n,0);
    await db.exec(migration());
    await db.exec(migration());
    const triggersAfter=await db.query("SELECT tgname,pg_get_functiondef(tgfoid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname");
    assert.deepEqual(triggersAfter.rows,triggersBefore.rows);
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${student}'`)).rows[0].points,500);
    assert.equal((await asUser(db,student,'SELECT * FROM handle_daily_checkin()')).rows[0].points,505);
    assert.equal((await asUser(db,student,"SELECT spend_points('guide_unlock') AS points")).rows[0].points,495);
    await asUser(db,admin,"SELECT approve_review('review')");
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${student}'`)).rows[0].points,515);
    assert.equal((await db.query("SELECT review_count FROM teachers WHERE id='teacher'")).rows[0].review_count,1);
    // A previously rewarded review can be rejected before a subsequent migration.
    // Its existing ledger entry must prevent any re-award after migration.
    await asUser(db,admin,"SELECT reject_review('review','Revise')");
    await db.exec(migration());
    await asUser(db,admin,"SELECT approve_review('review')");
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${student}'`)).rows[0].points,515);
    assert.equal((await db.query("SELECT points_delta FROM point_rules WHERE action_code='smart_filter'")).rows[0].points_delta,-3);
    assert.equal((await db.query("SELECT has_table_privilege('anon','user_profiles','TRUNCATE') AS permitted")).rows[0].permitted,false);
    const newcomer='00000000-0000-0000-0000-000000000004';
    await db.exec(`INSERT INTO auth.users VALUES('${newcomer}','new@example.test',now())`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM point_transactions WHERE user_id='${newcomer}'`)).rows[0].n,1);
    await assert.rejects(asUser(db,student,`UPDATE user_profiles SET points=999 WHERE id='${student}'`));
  } finally {await db.close();}
});

test('dry-run failure reports stage and original SQLSTATE/context, and prior changes roll back',async()=>{
  const db=await createDB({production:true});
  try {
    // Valid under the legacy case-sensitive constraint, invalid under the new index.
    await db.exec("INSERT INTO admin_users(email,role) VALUES('OWNER@example.test','admin')");
    await assert.rejects(
      db.exec(fs.readFileSync(new URL('../supabase/dry-run-p1.sql',import.meta.url),'utf8')),
      error => {
        assert.equal(error.code,'23505');
        assert.match(error.message,/P1 dry-run stage: 03 compatibility \[23505\]/);
        assert.match(error.detail,/admin_users_email_normalized_idx/);
        assert.match(error.hint,/including DETAIL\/CONTEXT/);
        return true;
      }
    );
    // An aborted transaction must not leave any changes from earlier stages.
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regnamespace('private') AS schema")).rows[0].schema,null);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='point_transactions' AND column_name='action'")).rows[0].n,0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM auth.users")).rows[0].n,3);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM admin_users")).rows[0].n,2);
  } finally {await db.close();}
});

test('ordinary moderator may review but cannot manage administrators or set reviewer metadata directly',async()=>{
  const db=await createDB();
  try {
    await asUser(db,admin,"INSERT INTO admin_users(email,role) VALUES('admin-student@swjtu.edu.cn','moderator')");
    await asUser(db,student,reviewInsert());
    await asUser(db,other,"UPDATE reviews SET status='approved' WHERE id='review'");
    assert.equal((await db.query("SELECT status FROM reviews WHERE id='review'")).rows[0].status,'pending');
    await assert.rejects(asUser(db,student,"UPDATE reviews SET reviewed_at=now() WHERE id='review'"));
    await assert.rejects(asUser(db,other,"INSERT INTO admin_users(email,role) VALUES('attacker@example.test','super_admin')"));
    assert.equal((await asUser(db,other,"SELECT approve_review('review') AS result")).rows[0].result.success,true);
    assert.equal((await asUser(db,null,'SELECT * FROM reviews','anon')).rows.length,1);
  } finally {await db.close();}
});

test('anonymous and student callers cannot escalate roles or mutate balances/moderation', async () => {
  const db = await createDB();
  try {
    await assert.rejects(asUser(db,null,reviewInsert(), 'anon'));
    await assert.rejects(asUser(db,null,'SELECT public.handle_daily_checkin()', 'anon'));
    await assert.rejects(asUser(db,student,"INSERT INTO admin_users(email,role) VALUES('student@example.test','super_admin')"));
    await assert.rejects(asUser(db,student,`UPDATE user_profiles SET points=99999 WHERE id='${student}'`));
    await assert.rejects(asUser(db,student,"INSERT INTO point_transactions(user_id,action,amount,balance_after) VALUES('x','fake',100,100)"));
    await assert.rejects(asUser(db,student,reviewInsert('approved','approved')));
    await assert.rejects(asUser(db,student,reviewInsert('other','pending',other)));
    await asUser(db,student,reviewInsert());
    await assert.rejects(asUser(db,student,"UPDATE reviews SET status='approved' WHERE id='review'"));
    await assert.rejects(asUser(db,student,"SELECT public.approve_review('review')"));
    assert.equal((await asUser(db,other,'SELECT public.get_my_admin_status() AS value')).rows[0].value.is_admin,false);
    assert.equal((await asUser(db,other,'SELECT * FROM user_profiles')).rows.length,1);
    assert.equal((await asUser(db,other,'SELECT * FROM reviews')).rows.length,0);
    assert.equal((await asUser(db,null,'SELECT * FROM reviews','anon')).rows.length,0);
  } finally { await db.close(); }
});

test('review approval adds to remote balance exactly once across retries and reject/reapprove', async () => {
  const db = await createDB();
  try {
    await db.exec(`UPDATE public.user_profiles SET points=500 WHERE id='${student}'`);
    await asUser(db,student,reviewInsert());
    const first = await asUser(db,admin,"SELECT approve_review('review') AS result");
    assert.equal(first.rows[0].result.points_awarded,true);
    await asUser(db,admin,"SELECT approve_review('review')");
    await asUser(db,admin,"SELECT reject_review('review','Please revise')");
    await asUser(db,student,"UPDATE reviews SET status='pending',comment='Updated comment',reject_reason=NULL WHERE id='review'");
    await asUser(db,admin,"SELECT approve_review('review')");
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${student}'`)).rows[0].points,520);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM point_transactions WHERE related_review_id='review'")).rows[0].n,1);
    await db.exec("UPDATE admin_users SET is_active=false");
    assert.equal((await asUser(db,admin,'SELECT get_my_admin_status() AS result')).rows[0].result.is_admin,false);
    await assert.rejects(asUser(db,admin,"SELECT reject_review('review','No permission')"));
  } finally { await db.close(); }
});

test('reward failure rolls back moderation and points in the same transaction', async () => {
  const db = await createDB();
  try {
    await asUser(db,student,reviewInsert());
    await db.exec("ALTER TABLE point_transactions ADD CONSTRAINT fail_award CHECK (amount<>20)");
    await assert.rejects(asUser(db,admin,"SELECT approve_review('review')"));
    assert.equal((await db.query("SELECT status FROM reviews WHERE id='review'")).rows[0].status,'pending');
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${student}'`)).rows[0].points,100);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.swjtu_review_rewards')).rows[0].n,0);
  } finally { await db.close(); }
});

test('daily check-in is idempotent and spending cannot overdraft or accept arbitrary action codes', async () => {
  const db = await createDB();
  try {
    const first = await asUser(db,student,'SELECT * FROM handle_daily_checkin()');
    const second = await asUser(db,student,'SELECT * FROM handle_daily_checkin()');
    assert.equal(first.rows[0].points,105);
    assert.equal(second.rows[0].already_checked_in,true);
    assert.equal((await asUser(db,student,"SELECT spend_points('guide_unlock') AS balance")).rows[0].balance,95);
    assert.equal((await asUser(db,student,"SELECT spend_points('smart_filter') AS balance")).rows[0].balance,92);
    await assert.rejects(asUser(db,student,"SELECT spend_points('register_init')"));
    await db.exec(`UPDATE user_profiles SET points=1 WHERE id='${student}'`);
    await assert.rejects(asUser(db,student,"SELECT spend_points('ai_question')"));
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${student}'`)).rows[0].points,1);
  } finally { await db.close(); }
});
