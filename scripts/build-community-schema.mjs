import fs from 'node:fs';
const read = name => fs.readFileSync(new URL('../supabase/'+name,import.meta.url),'utf8');
const write = (name,sql) => fs.writeFileSync(new URL('../supabase/'+name,import.meta.url),sql);
const source=read('community-v2.sql');
const verify=read('verification-community.sql');
const finish="\nROLLBACK;\nSELECT 'PASS: community v2 tests rolled back' AS result;\n";

// Match the P1 trial's staged execution. Each stage parses dependent SQL only
// after its prerequisites run and retains hosted PostgreSQL/DDL-hook diagnostics.
const parts=source.split(/^-- @stage ([^\r\n]+)\r?$/m);
if (parts.length !== 15) throw new Error('Expected seven community migration stages');
const stages=[];
for(let i=1;i<parts.length;i+=2) stages.push([parts[i],parts[i+1]]);
function stage(mode,name,body) {
  if(body.includes('$community_sql$') || body.includes('$community_stage$')) throw new Error('Reserved SQL delimiter');
  return `\nDO $community_stage$
DECLARE error_context TEXT; error_detail TEXT; error_hint TEXT;
BEGIN
  EXECUTE $community_sql$${body}$community_sql$;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT,
    error_detail = PG_EXCEPTION_DETAIL, error_hint = PG_EXCEPTION_HINT;
  RAISE EXCEPTION USING ERRCODE = SQLSTATE,
    MESSAGE = 'Community ${mode} stage: ${name} [' || SQLSTATE || '] ' || SQLERRM,
    DETAIL = coalesce(error_detail,'') || E'\\n' || coalesce(error_context,''),
    HINT = 'Copy this complete error (including DETAIL/CONTEXT). ' || coalesce(error_hint,'');
END $community_stage$;\n`;
}
const migration=mode=>stages.map(([name,body])=>stage(mode,name,body)).join('\n');
write('migrations/20260926_community_v2.sql','-- COMMUNITY MIGRATION v2: run this WHOLE file AFTER P1; changes commit.\nBEGIN;\n'+migration('migration')+'\nCOMMIT;\n');
write('dry-run-community.sql','-- COMMUNITY DRY RUN v2: run this WHOLE file; all changes roll back.\nBEGIN;\n'+migration('dry-run')+stage('dry-run','08 verification',verify)+finish);
write('verify-community.sql','-- COMMUNITY VERIFY v2: only AFTER the formal migration; test data rolls back.\nBEGIN;\n'+stage('verify','08 verification',verify)+finish);
