import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildPayload, parseCSV } from './parse.mjs';
import { generateSQL, verificationSQL } from '../import-timetable.mjs';

export const uploadTable = 'timetable_upload_2026_2027_1';
const md5 = text => createHash('md5').update(text,'utf8').digest('hex');
const readme = `# 直接在 Supabase 网页导入

本文件夹是新的网页导入包。数据走 CSV 上传，SQL 不再包含全部课表数据，不需要本地执行任何命令。

1. 在 Supabase 的 SQL Editor 新建查询，以默认 postgres 角色运行 **00-create-upload-table.sql**。它只创建专用中转表，不更改教师或课程资料。
2. 转到 **Table Editor**，刷新列表并找到 **public.timetable_upload_2026_2027_1**。打开该表，通过 **Insert → Import data from CSV**（或界面上的 Import 按钮）选择本目录的 **01-upload-ascii.csv**。三个字段 record_type、record_no、payload_text 按同名列对应，按原文件导入。此版本把 JSON 内中文编码成 Unicode 转义，数据库解析后仍是原中文，避免分块读取时截断中文。确认上传全部完成后再继续。
3. 回到 **SQL Editor**，运行 **02-check-upload.sql**。必须显示 **READY**。v2 校验比较全部 JSON 字段、值和每条记录的编号，允许 JSON 排版空格及对象字段顺序不同，但不会忽略字段内容。raw_text_identical=false、json_content_identical=true 表示只是文本形式不同，仍可导入。若 NOT_READY，运行 **02a-diagnose-upload.sql** 查看哪些类型的内容不匹配；先不要删除或重新上传数据。
4. 运行 **03-dry-run.sql**。它检查上传完整性，再完整模拟导入，最后 ROLLBACK。教师去重、学院更新及课表写入都会回滚，中转表仍保留。不报错后继续。
5. 运行 **04-import.sql**。这一步才正式写入业务表，最后 COMMIT。失败时整笔业务导入回滚，中转数据仍保留；可修正问题后重试。
6. 运行 **05-verify.sql**。本次预期有 4,602 条选课记录、6,979 段上课安排，同时检查教师候选和学院改动。

每个 SQL 文件复制全文、单独运行。**CSV 是上传文件，不要把 CSV 内容粘贴进 SQL Editor，也不要导入 courses 表。** 上传的 10,064 条中转记录包含教师映射、课程、班级和课表，不等于课程数量。

已上传旧版 01-upload.csv 且检查报告为 1 条班级、15 条课表共 16 处乱码时：无需重新上传。运行 **02b-repair-encoding.sql**（若本目录已提供），它只修复报告中确认的字段，并在同一事务内核验全部 10,064 条数据；不完全匹配就回滚。返回 READY 后继续第 4 步。该 SQL 可重复运行。修复后或使用 ASCII 版本时 raw_text_identical=false 可以是正常现象，以 json_content_identical=true 和 READY 为准。

如果 CSV 上传中断：可以先运行 02-check-upload.sql，READY 表示已完整上传，不要再重复上传。若未完整且再次导入提示主键冲突，运行 **99-reset-upload-only.sql** 清空这张专用中转表，然后重新上传一次 CSV。它不删除教师、课程或正式课表。不要运行历史导入包中的清理 SQL。

教师去重、学院更新、按周上课以及“补充新增”规则与原方案一致。当前数据库里姓名唯一时复用教师 ID，多同名候选保留待核实；多个开课单位不会据此新建多个教师页。同一个教师只对应一个可明确映射的学院时更新，多学院或无明确学院时保留原值。重复执行正式导入不会重复新增；同一选课编号出现不同原始数据时会中止。

本包生成器与事务逻辑已在隔离 PostgreSQL 中验证；未替你执行线上导入。旧 import-output 目录中的约 9 MB SQL 不再用于网页导入。
`;

// Match the representation consumed by the import, not JSON presentation.
// Bind each checksum to its record identity as well as its structured content.
const semanticChecksum = `md5(string_agg(md5(record_type||chr(31)||record_no::text||chr(31)||payload_text::jsonb::text),'' ORDER BY record_type COLLATE "C",record_no))`;
export async function dashboardBundle(payload) {
  const kinds = ['teachers','courses','classes','sections'];
  const metadata = Object.fromEntries(Object.entries(payload).filter(([key])=>!kinds.includes(key) && key!=='issues'));
  const records = [{record_type:'meta',record_no:1,payload_text:JSON.stringify(metadata)}];
  for(const kind of kinds) payload[kind].forEach((item,index)=>records.push({record_type:kind,record_no:index+1,payload_text:JSON.stringify(item)}));
  const ordered = [...records].sort((a,b)=>a.record_type===b.record_type ? a.record_no-b.record_no : a.record_type<b.record_type?-1:1);
  const digest=md5(ordered.map(row=>md5(row.payload_text)).join(''));
  const csvField = value => '"'+String(value).replaceAll('"','""')+'"';
  const csv='record_type,record_no,payload_text\r\n'+records.map(row=>[row.record_type,row.record_no,csvField(row.payload_text)].join(',')).join('\r\n')+'\r\n';
  // Preserve the original upload for incident reproduction. New uploads use
  // ASCII JSON escapes so independent byte-chunk decoding cannot split UTF-8.
  const asciiCSV='record_type,record_no,payload_text\r\n'+records.map(row=>[
    row.record_type,row.record_no,csvField(row.payload_text.replace(/[^\x00-\x7f]/g,
      ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'))),
  ].join(',')).join('\r\n')+'\r\n';
  const canonicalDb = new PGlite();
  let semanticDigest, typeChecks;
  try {
    await canonicalDb.exec('CREATE TABLE upload(record_type text,record_no integer,payload_text text)');
    await canonicalDb.query(`COPY upload(record_type,record_no,payload_text) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`,[],{blob:new Blob([csv])});
    semanticDigest=(await canonicalDb.query(`SELECT ${semanticChecksum} AS digest FROM upload`)).rows[0].digest;
    typeChecks=(await canonicalDb.query(`SELECT record_type,count(*)::int AS n,${semanticChecksum} AS digest FROM upload GROUP BY record_type ORDER BY record_type`)).rows;
  } finally { await canonicalDb.close(); }
  const prepare=`-- Dedicated upload staging table only; existing business data is untouched.\nBEGIN;\n`
    + `CREATE TABLE IF NOT EXISTS public.${uploadTable}(\n`
    + `  record_type text NOT NULL CHECK(record_type IN ('meta','teachers','courses','classes','sections')),\n`
    + `  record_no integer NOT NULL CHECK(record_no>0),\n  payload_text text NOT NULL,\n  PRIMARY KEY(record_type,record_no)\n);\n`
    + `ALTER TABLE public.${uploadTable} ENABLE ROW LEVEL SECURITY;\n`
    + `REVOKE ALL ON public.${uploadTable} FROM PUBLIC,anon,authenticated;\nCOMMIT;\n`
    + `SELECT '${uploadTable}' AS upload_csv_to_this_table,${records.length} AS expected_upload_rows;\n`;
  const checksum=`md5(string_agg(md5(payload_text),'' ORDER BY record_type COLLATE "C",record_no))`;
  const check=`-- v2: read only; compare all JSON data plus record identities, allowing formatting/key-order changes.\n`
    + `SELECT CASE WHEN count(*)=${records.length} AND ${semanticChecksum}='${semanticDigest}' THEN 'READY' ELSE 'NOT_READY' END AS upload_status,\n`
    + `count(*) AS uploaded_rows,${records.length} AS expected_rows,\n`
    + `${checksum}='${digest}' AS raw_text_identical,\n`
    + `${semanticChecksum}='${semanticDigest}' AS json_content_identical\nFROM public.${uploadTable};\n`;
  const diagnose=`-- Read only: locate which record types differ from the generated source.\n`
    + `WITH expected(record_type,expected_rows,expected_digest) AS (VALUES\n`
    + typeChecks.map(t=>`('${t.record_type}',${t.n},'${t.digest}')`).join(',\n')+`\n), actual AS (\n`
    + `SELECT record_type,count(*) AS uploaded_rows,min(record_no) AS first_record,max(record_no) AS last_record,${semanticChecksum} AS actual_digest\n`
    + `FROM public.${uploadTable} GROUP BY record_type)\n`
    + `SELECT coalesce(e.record_type,a.record_type) AS record_type,e.expected_rows,a.uploaded_rows,a.first_record,a.last_record,\n`
    + `(e.expected_rows=a.uploaded_rows AND e.expected_digest=a.actual_digest) IS TRUE AS content_matches\n`
    + `FROM expected e FULL JOIN actual a USING(record_type) ORDER BY record_type;\n`;
  const preflight=`LOCK TABLE public.${uploadTable} IN SHARE MODE;\n`
    + `DO $tt_upload_check$ BEGIN\n`
    + `IF (SELECT count(*) FROM public.${uploadTable})<>${records.length}\n`
    + ` OR (SELECT ${semanticChecksum} FROM public.${uploadTable}) IS DISTINCT FROM '${semanticDigest}' THEN\n`
    + `RAISE EXCEPTION 'CSV 未完整上传、上传了错误文件或内容被改变。请先运行 02-check-upload.sql，必须显示 READY。';\n`
    + `END IF;\nEND $tt_upload_check$;\n`;
  const loader=`CREATE TEMP TABLE _tt_payload(data jsonb NOT NULL) ON COMMIT DROP;\n`
    + `INSERT INTO _tt_payload SELECT m.payload_text::jsonb || jsonb_build_object(\n`
    + kinds.map(kind=>`'${kind}',(SELECT jsonb_agg(payload_text::jsonb ORDER BY record_no) FROM public.${uploadTable} WHERE record_type='${kind}')`).join(',\n')
    + `\n) FROM public.${uploadTable} m WHERE m.record_type='meta' AND m.record_no=1;\n`;
  const files={
    '00-create-upload-table.sql':prepare,
    '01-upload.csv':csv,
    '01-upload-ascii.csv':asciiCSV,
    '02-check-upload.sql':check,
    '02a-diagnose-upload.sql':diagnose,
    '03-dry-run.sql':generateSQL(payload,true,{preflightSQL:preflight,payloadSetup:loader}),
    '04-import.sql':generateSQL(payload,false,{preflightSQL:preflight,payloadSetup:loader}),
    '05-verify.sql':verificationSQL(payload),
    '99-reset-upload-only.sql':`-- Only use if a CSV upload was incomplete or the wrong CSV was uploaded.\nBEGIN;\nTRUNCATE TABLE public.${uploadTable};\nCOMMIT;\nSELECT 'Upload staging cleared; teachers/courses/timetable data unchanged' AS result;\n`,
    '网页导入步骤.md':readme,
  };
  const sizes=Object.fromEntries(Object.entries(files).map(([name,text])=>[name,Buffer.byteLength(text)]));
  for(const [name,size] of Object.entries(sizes)) if(name.endsWith('.sql')) assert.ok(size<40*1024,`${name} exceeds SQL size budget`);
  assert.ok(Buffer.byteLength(csv)<50*1024*1024,'CSV exceeds conservative dashboard upload budget');
  assert.ok(Buffer.byteLength(asciiCSV)<50*1024*1024,'ASCII CSV exceeds dashboard upload budget');
  return {files,records,manifest:{uploadTable,uploadRows:records.length,checksumVersion:2,contentChecksum:digest,semanticChecksum:semanticDigest,fileBytes:sizes,
    expectedSections:payload.summary.sourceRows,expectedMeetings:payload.summary.meetings,remoteWrites:false}};
}

export async function main() {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const rows=parseCSV(fs.readFileSync(path.join(root,'schule2026-2027-1/courses.csv'),'utf8'));
  const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url),'utf8'));
  const bundle=await dashboardBundle(buildPayload(rows,config));
  const out=path.join(root,'schule2026-2027-1/supabase-web-import');fs.mkdirSync(out,{recursive:true});
  for(const [file,content] of Object.entries(bundle.files)) fs.writeFileSync(path.join(out,file),content,'utf8');
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(bundle.manifest,null,2)+'\n');
  console.log(JSON.stringify({out,...bundle.manifest},null,2));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
