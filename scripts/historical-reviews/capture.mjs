import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { root, output, read } from './common.mjs';

// This script uses only public GET endpoints. Never log configuration keys.
const env = dotenv.parse(read(path.join(root, '.env.local')));
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) throw new Error('Missing public Supabase configuration');
const selects = {
  colleges: 'id,name,campus', courses: 'id,name,college_id', terms: 'id,year_term,is_current',
  teachers: 'id,name,college_id,rating_version,has_historical_data,review_count',
  reviews: 'id,teacher_id,course_id,status,is_historical_migrated,rating_version',
  course_offerings: 'id,teacher_id,course_id,term_id',
};
const snapshot = { capturedAt: new Date().toISOString(), host: new URL(base).hostname };
await Promise.all(Object.entries(selects).map(async ([table, select]) => {
  const rows = [];
  for (;;) {
    const url = new URL(`/rest/v1/${table}`, base);
    for (const [k,v] of Object.entries({select,order:'id.asc',offset:rows.length,limit:500})) url.searchParams.set(k,v);
    let response;
    try { response = await fetch(url, {headers:{apikey:key,Prefer:'count=exact'},signal:AbortSignal.timeout(25000)}); }
    catch(error) { throw new Error(`Read-only ${table} failed: ${error.cause?.code || error.name}`); }
    if (!response.ok) throw new Error(`Read-only ${table}: HTTP ${response.status}`);
    const page = await response.json(); rows.push(...page);
    const total = Number(response.headers.get('content-range')?.split('/')[1]);
    if (!page.length || (Number.isFinite(total) && rows.length >= total)) break;
  }
  snapshot[table] = rows;
  console.log(`${table}: ${rows.length}`);
}));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'catalog-snapshot.json'),JSON.stringify(snapshot,null,2)+'\n');
console.log('Public snapshot saved; remote writes: 0.');
