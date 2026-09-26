import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Compile the real service while substituting only its network/storage boundary.
const source = fs.readFileSync(new URL('../src/services/supabaseService.ts',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export const supabaseService =','globalThis.service =');
const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup({points=37,rpcData=null,rpcError=null,readError=null,configured=true}={}) {
  const storage=new Map(); const writes=[]; const calls=[];
  const supabase={
    auth:{getUser:async()=>({data:{user:{id:'student'}},error:null})},
    rpc:async(name,args)=>{calls.push({name,args});return{data:rpcData,error:rpcError};},
    from(table){
      let method='select';
      const q={};
      for(const key of ['select','eq','order','limit']) q[key]=()=>q;
      for(const key of ['insert','update','upsert','delete']) q[key]=(payload)=>{method=key;writes.push({table,method,payload});return q;};
      const result=()=>({data:method==='select'?(table==='user_profiles'?{points,last_checkin_date:null}:[]):null,error:readError});
      q.maybeSingle=async()=>result();q.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return q;
    },
  };
  const context={supabase,isSupabaseConfigured:configured,POPULAR_COURSES:[],window:{},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    console:{warn(){},error(){}},setTimeout};
  vm.createContext(context);vm.runInContext(compiled,context);
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
