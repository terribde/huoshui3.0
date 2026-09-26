import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql = name => fs.readFileSync(new URL('../supabase/'+name,import.meta.url),'utf8');
const user='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const college='10000000-0000-0000-0000-000000000001';
const course='20000000-0000-0000-0000-000000000001';
async function setup() {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,email_confirmed_at TIMESTAMPTZ);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`);
  await db.exec(fs.readFileSync(new URL('../supabase_schema.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO auth.users VALUES('${user}','user@example.test',now()),('${other}','other@example.test',now());
    INSERT INTO colleges(id,name) VALUES('${college}','Test');
    INSERT INTO courses(id,name,college_id) VALUES('${course}','Course','${college}');
    INSERT INTO teachers(id,name,college_id,attendance_strictness,workload_difficulty) VALUES
      ('teacher','Teacher','${college}',1,2),('history','History','${college}',2,4);
    INSERT INTO reviews(id,teacher_id,course_id,year_term,user_id,status,attendance_strictness,grading_leniency,
      effort_matters,workload_difficulty,approachability,teaching_quality,likes)
    VALUES('review','teacher','${course}','test','${user}','approved',1,4,3,5,NULL,4,7),
      ('pending','teacher','${course}','test','${user}','pending',2,4,3,1,5,4,0);`);
  return db;
}
async function asUser(db, uid, query, role='authenticated') {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${uid??''}',false);`);
  try { return await db.query(query); } finally {await db.exec('RESET ROLE');}
}
test('v2 migration converts once, preserves NULL/history/points and dry-run rolls back',async()=>{
  const db=await setup();try {
    const before=(await db.query('SELECT * FROM teachers ORDER BY id')).rows;
    assert.equal((await db.query("SELECT to_regclass('private.swjtu_migrations') AS t")).rows[0].t,null);
    await db.exec(sql('dry-run-community.sql'));
    assert.deepEqual((await db.query('SELECT * FROM teachers ORDER BY id')).rows,before);
    assert.equal((await db.query("SELECT to_regclass('public.review_likes') AS t")).rows[0].t,null);
    assert.equal((await db.query("SELECT to_regclass('private.swjtu_migrations') AS t")).rows[0].t,null);
    await db.exec(sql('migrations/20260926_community_v2.sql'));
    await db.exec(sql('migrations/20260926_community_v2.sql'));
    const r=(await db.query("SELECT * FROM reviews WHERE id='review'")).rows[0];
    assert.equal(Number(r.attendance_strictness),5);assert.equal(Number(r.workload_difficulty),1);
    assert.equal(r.approachability,null);assert.equal(r.likes,7);assert.equal(r.rating_version,2);
    const t=(await db.query("SELECT * FROM teachers WHERE id='teacher'")).rows[0];
    assert.equal(Number(t.overall_score),3.4);assert.equal(t.review_count,1);
    const h=(await db.query("SELECT * FROM teachers WHERE id='history'")).rows[0];
    assert.equal(Number(h.attendance_strictness),4);assert.equal(Number(h.workload_difficulty),2);
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${user}'`)).rows[0].points,100);
    await db.exec(sql('verify-community.sql'));
  }finally{await db.close();}
});

test('a DDL hook missing-table failure preserves its stage, SQLSTATE and original context',async()=>{
  const db=await setup();try {
    // Simulate a hosted DDL hook failing before CREATE TABLE can complete.
    // This tests diagnosis of 42P01; it does not establish the production cause.
    await db.exec(`CREATE FUNCTION public.community_test_ddl_hook() RETURNS event_trigger
      LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM private.swjtu_migrations; END $$;
      CREATE EVENT TRIGGER community_test_ddl_hook ON ddl_command_start
      WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.community_test_ddl_hook();`);
    await assert.rejects(db.exec(sql('dry-run-community.sql')),error=>{
      assert.equal(error.code,'42P01');
      assert.match(error.message,/Community dry-run stage: 03 migration tables \[42P01\]/);
      assert.match(error.detail,/community_test_ddl_hook/);
      assert.match(error.hint,/including DETAIL\/CONTEXT/);
      return true;
    });
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('private.swjtu_migrations') AS t")).rows[0].t,null);
    assert.equal(Number((await db.query("SELECT attendance_strictness FROM reviews WHERE id='review'")).rows[0].attendance_strictness),1);
  }finally{await db.close();}
});

test('verification before migration explains that dry-run tables are rolled back',async()=>{
  const db=await setup();try {
    await db.exec(sql('dry-run-community.sql'));
    await assert.rejects(db.exec(sql('verify-community.sql')),error=>{
      assert.equal(error.code,'P0001');
      assert.match(error.message,/migration has not been applied/);
      assert.match(error.hint,/successful dry-run rolls back/);
      return true;
    });
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('private.swjtu_migrations') AS t")).rows[0].t,null);
  }finally{await db.close();}
});
test('likes are idempotent, private per user, support self-like/unlike and auth deletion',async()=>{
  const db=await setup();try {
    await db.exec(sql('migrations/20260926_community_v2.sql'));
    await assert.rejects(asUser(db,null,"SELECT set_review_like('review',true)",'anon'));
    await assert.rejects(asUser(db,user,"SELECT set_review_like('pending',true)"));
    await assert.rejects(asUser(db,user,"UPDATE reviews SET likes=99 WHERE id='review'"));
    await assert.rejects(asUser(db,user,`INSERT INTO review_likes VALUES('review','${other}',now())`));
    for(let i=0;i<3;i++) assert.equal((await asUser(db,user,"SELECT set_review_like('review',true) AS r")).rows[0].r.likes,8);
    assert.equal((await asUser(db,other,"SELECT set_review_like('review',true) AS r")).rows[0].r.likes,9);
    assert.equal((await asUser(db,user,'SELECT * FROM review_likes')).rows.length,1);
    await db.exec(sql('migrations/20260926_community_v2.sql'));
    for(let i=0;i<2;i++) assert.equal((await asUser(db,user,"SELECT set_review_like('review',false) AS r")).rows[0].r.likes,8);
    await db.exec(`DELETE FROM auth.users WHERE id='${other}'`);
    assert.equal((await db.query("SELECT likes FROM reviews WHERE id='review'")).rows[0].likes,7);
    assert.equal((await db.query(`SELECT points FROM user_profiles WHERE id='${user}'`)).rows[0].points,100);
  }finally{await db.close();}
});
test('old clients cannot submit or edit old-direction scores after migration',async()=>{
  const db=await setup();try {
    await db.exec(sql('migrations/20260926_community_v2.sql'));
    await assert.rejects(asUser(db,user,"UPDATE reviews SET attendance_strictness=1 WHERE id='pending'"),/刷新/);
    await db.exec(`SELECT set_config('request.headers','{"x-rating-version":"2"}',false)`);
    await asUser(db,user,"UPDATE reviews SET attendance_strictness=5,rating_version=2 WHERE id='pending'");
    await assert.rejects(asUser(db,user,"UPDATE reviews SET attendance_strictness=6 WHERE id='pending'"),/1 到 5/);
    await assert.rejects(asUser(db,user,`INSERT INTO reviews(id,teacher_id,course_id,year_term,user_id,status)
      VALUES('old','teacher','${course}','test','${user}','pending')`),/刷新/);
  }finally{await db.close();}
});

test('an invalid legacy score aborts the whole migration without partial conversion',async()=>{
  const db=await setup();try {
    await db.exec("UPDATE reviews SET attendance_strictness=0 WHERE id='pending'");
    await assert.rejects(db.exec(sql('migrations/20260926_community_v2.sql')),/Out-of-range/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('public.review_likes') AS t")).rows[0].t,null);
    assert.equal((await db.query("SELECT to_regclass('private.swjtu_rating_backup') AS t")).rows[0].t,null);
    assert.equal(Number((await db.query("SELECT attendance_strictness FROM reviews WHERE id='review'")).rows[0].attendance_strictness),1);
  }finally{await db.close();}
});
