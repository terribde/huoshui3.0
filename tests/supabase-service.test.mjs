import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Compile the real service while substituting only its network/storage boundary.
const source = fs.readFileSync(new URL('../src/services/supabaseService.ts',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export const supabaseService =','globalThis.service =');
const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const ratingsSource=fs.readFileSync(new URL('../src/lib/ratings.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const ratingsCompiled=ts.transpileModule(ratingsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup({points=37,rpcData=null,rpcError=null,readError=null,configured=true,likedIds=[]}={}) {
  const storage=new Map(); const writes=[]; const calls=[];
  const supabase={
    auth:{getUser:async()=>({data:{user:{id:'student'}},error:null})},
    rpc:async(name,args)=>{calls.push({name,args});return{data:rpcData,error:rpcError};},
    from(table){
      let method='select', start=0, end=999;
      const q={};
      for(const key of ['select','eq','order','limit']) q[key]=()=>q;
      q.range=(from,to)=>{start=from;end=to;return q;};
      for(const key of ['insert','update','upsert','delete']) q[key]=(payload)=>{method=key;writes.push({table,method,payload});return q;};
      const result=()=>({data:method==='select'?(table==='user_profiles'?{points,last_checkin_date:null}:table==='review_likes'?likedIds.slice(start,end+1).map(review_id=>({review_id})):[]):null,error:readError});
      q.maybeSingle=async()=>result();q.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return q;
    },
  };
  const context={supabase,isSupabaseConfigured:configured,POPULAR_COURSES:[],window:{},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    console:{warn(){},error(){}},setTimeout};
  vm.createContext(context);vm.runInContext(ratingsCompiled,context);vm.runInContext(compiled,context);
  return {service:context.service,writes,calls};
}

test('remote balance including zero replaces a higher local cache and old ledger',async()=>{
  for(const points of [37,0]) {
    const {service}=setup({points});
    service.saveLocalUserPoints('student',100,[{id:'stale'}]);
    const result=await service.getUserPoints('student');
    assert.equal(result.points,points);assert.equal(result.transactions.length,0);
    assert.equal(service.getLocalUserPoints('student').points,points);
  }
});
test('read failure does not report cached or invented welcome points as authoritative',async()=>{
  const {service}=setup({readError:{message:'read denied'}});
  service.saveLocalUserPoints('student',100,[]);
  await assert.rejects(service.getUserPoints('student'),/read denied/);
});
test('failed or malformed spend RPC never falls back to direct writes or local success',async()=>{
  for(const response of [{rpcError:{message:'permission denied'}},{rpcError:{message:'timeout'}},{rpcData:null},{rpcData:'98'}]) {
    const {service,writes}=setup(response);service.saveLocalUserPoints('student',100,[]);
    assert.equal((await service.spendPoints('ai_question')).success,false);
    assert.equal(writes.length,0);assert.equal(service.getLocalUserPoints('student').points,100);
  }
});
test('successful deduction updates cache with server balance',async()=>{
  const {service,writes}=setup({rpcData:98});service.saveLocalUserPoints('student',100,[]);
  assert.equal((await service.spendPoints('ai_question')).newBalance,98);
  assert.equal(service.getLocalUserPoints('student').points,98);assert.equal(writes.length,0);
});
test('check-in relies on RPC even when device cache says already checked in',async()=>{
  const {service,writes,calls}=setup({rpcData:[{points:42,already_checked_in:true}]});
  service.saveLocalUserPoints('student',100,[]);
  service.saveLocalCheckInDate('student',service.getLocalDateString());
  const result=await service.handleDailyCheckin('student');
  assert.equal(result.points,42);assert.equal(calls.length,1);assert.equal(writes.length,0);
  assert.equal(service.getLocalUserPoints('student').points,42);
});
test('failed check-in neither issues points nor marks the day complete',async()=>{
  const {service,writes}=setup({rpcError:{message:'function missing'}});
  assert.equal((await service.handleDailyCheckin('student')).success,false);
  assert.equal(service.getLocalUserPoints('student'),null);
  assert.equal(service.getLocalCheckInDate('student'),null);assert.equal(writes.length,0);
});
test('moderation denied by RPC cannot be bypassed using a direct table update',async()=>{
  for(const config of [{rpcError:{message:'permission denied'}},{rpcData:{success:false,message:'missing review'}}]) {
    const {service,writes}=setup(config);
    service.saveLocalReview({id:'review',status:'pending'});
    assert.equal((await service.approveReview('review')).success,false);
    assert.equal((await service.rejectReview('review','reason')).success,false);
    assert.equal(service.getLocalReviews()[0].status,'pending');assert.equal(writes.length,0);
  }
});
test('admin email and editable metadata cannot grant privileges when server denies',async()=>{
  const {service,calls}=setup({rpcData:{is_admin:false}});
  assert.equal((await service.checkIsAdmin('admin@swjtu.edu.cn',{role:'super_admin'})).isAdmin,false);
  assert.equal(calls[0].name,'get_my_admin_status');assert.equal(calls[0].args,undefined);
});
test('unconfigured database fails closed for privileged operations',async()=>{
  const {service}=setup({configured:false});
  assert.equal((await service.spendPoints('ai_question')).success,false);
  assert.equal((await service.approveReview('review')).success,false);
  assert.equal((await service.checkIsAdmin('admin@example.test')).isAdmin,false);
});

test('likes use explicit desired state via RPC, never direct count writes',async()=>{
  const {service,calls,writes}=setup({rpcData:{likes:7,liked:true}});
  assert.equal((await service.setReviewLike('review',true)).likes,7);
  assert.equal(calls[0].name,'set_review_like');
  assert.equal(calls[0].args.p_liked,true);
  assert.equal(writes.length,0);
  for(const config of [{rpcError:{message:'denied'}},{rpcData:{likes:-1,liked:true}},{rpcData:null}]) {
    const {service,writes}=setup(config);
    await assert.rejects(service.setReviewLike('review',false));assert.equal(writes.length,0);
  }
});

test('legacy rating conversion preserves missing scores and is idempotent',()=>{
  const context={}; vm.createContext(context);vm.runInContext(ratingsCompiled,context);
  const record={dimensions:{attendanceStrictness:1,workloadDifficulty:2,gradingLeniency:4,approachability:null}};
  const converted=context.normalizeRatingRecord(record);
  assert.equal(converted.dimensions.attendanceStrictness,5);
  assert.equal(converted.dimensions.workloadDifficulty,4);
  assert.equal(converted.dimensions.approachability,null);
  assert.equal(context.normalizeRatingRecord(converted).dimensions.attendanceStrictness,5);
});

test('own likes load across server pages and fail on read errors',async()=>{
  const likedIds=Array.from({length:1200},(_,i)=>`review-${String(i).padStart(4,'0')}`);
  const {service}=setup({likedIds});
  assert.deepEqual(Array.from(await service.getMyLikedReviewIds()),likedIds);
  await assert.rejects(setup({readError:{message:'denied'}}).service.getMyLikedReviewIds(),/点赞状态读取失败/);
});

test('new reviews send the explicit v2 score version and never send fake like counts',async()=>{
  const {service,writes}=setup();
  const result=await service.submitReview({id:'review',teacherId:'teacher',courseId:'course',yearTerm:'2026',
    userId:'student',dimensions:{attendanceStrictness:5,workloadDifficulty:5},likes:99});
  assert.equal(result.success,true);
  assert.equal(writes[0].payload.rating_version,2);
  assert.equal(writes[0].payload.attendance_strictness,5);
  assert.equal(writes[0].payload.likes,0);
});
