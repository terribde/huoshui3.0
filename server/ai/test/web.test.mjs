import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createWebRouter } from '../web.mjs';

async function fixture(t, overrides = {}) {
  const ledger = new Map(), histories = new Map(), results = new Map(), cancellations = new Set();
  let balance = 100, calls = 0, inputs = [];
  const key = (u,r) => `${u}:${r}`;
  const billing = {
    config: async () => ({ available: true, cost: 7, balance }),
    settled: async (u, ids) => new Set(ids.filter(id => ledger.get(key(u,id))?.status === 'settled')),
    reserve: async (u,r,h,c) => {
      const old=ledger.get(key(u,r));
      if (old) { if(old.hash!==h)throw new Error('request_id_conflict'); return {...old,created:false}; }
      if(c!==7)throw new Error('price_changed');
      balance-=c; const tx={status:'pending',cost:c,balance,hash:h};ledger.set(key(u,r),tx);return {...tx,created:true};
    },
    status: async (u,r) => ({ ...ledger.get(key(u,r)),status:ledger.get(key(u,r))?.status||'not_found',balance }),
    finalize: async (u,r,status) => { const tx=ledger.get(key(u,r)); if(tx.status==='pending'){tx.status=status;if(status==='refunded')balance+=tx.cost;}return{...tx,balance}; },
  };
  const store = {
    history: async (u,c) => histories.get(key(u,c)) || [], save: async(u,c,p)=>histories.set(key(u,c),p),
    result: async(u,r)=>results.get(key(u,r)), saveResult: async(u,r,p)=>results.set(key(u,r),p),
    cancelled: async(u,r)=>cancellations.has(key(u,r)),cancel:async(u,r)=>cancellations.add(key(u,r)),rate:async()=>true,
  };
  const invoke = async (input,signal) => { calls++;inputs.push(input);return overrides.invoke ? overrides.invoke(input,signal) : {completed:Promise.resolve(),async *toTextStream(){yield '测试回答';}}; };
  const app=express();app.use(express.json());app.use('/api/ai',createWebRouter({authenticate:async token=>token==='user-a'?'a':token==='user-b'?'b':null,billing,store,invoke,logger:{error(){}},timeoutMs:overrides.timeoutMs||1000}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
  const base=`http://127.0.0.1:${server.address().port}/api/ai`;
  const request=(path,body,token='user-a',signal)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal});
  const body=(changes={})=>({prompt:'你好',requestId:randomUUID(),conversationId:randomUUID(),expectedCost:7,...changes});
  return { request,body,ledger,billing,store,get calls(){return calls;},inputs,get balance(){return balance;} };
}
test('web endpoints reject bad credentials and never accept debug token as login',async t=>{
  const f=await fixture(t); assert.equal((await f.request('/config',null,'debug-token')).status,401);assert.equal(f.calls,0);
});
test('dynamic cost, successful settlement and duplicate request do not repeat model or charge',async t=>{
  const f=await fixture(t);const b=f.body();
  assert.equal((await (await f.request('/config')).json()).cost,7);
  const text=await(await f.request('/chat',b)).text();assert.match(text,/"type":"done"/);assert.equal(f.balance,93);
  assert.equal((await f.request('/chat',b)).status,409);assert.equal(f.calls,1);assert.equal(f.balance,93);
  const s=await(await f.request(`/requests/${b.requestId}`)).json();assert.equal(s.reply,'测试回答');
});
test('wrong price never calls model or debits',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/chat',f.body({expectedCost:2}))).status,409);assert.equal(f.calls,0);assert.equal(f.balance,100);
});
test('failed or empty model response refunds exactly once',async t=>{
  const f=await fixture(t,{invoke:async()=>({completed:Promise.resolve(),async *toTextStream(){}})});
  const text=await(await f.request('/chat',f.body())).text();assert.match(text,/"status":"refunded"/);assert.equal(f.balance,100);
});
test('context includes only settled rounds and is isolated by account',async t=>{
  const f=await fixture(t);const conversationId=randomUUID();
  await(await f.request('/chat',f.body({conversationId,prompt:'第一轮'}))).text();
  await(await f.request('/chat',f.body({conversationId,prompt:'第二轮'}))).text();assert.equal(f.inputs[1].length,3);
  await(await f.request('/chat',f.body({conversationId}),'user-b')).text();assert.equal(f.inputs[2].length,1);
  const id=[...f.ledger.keys()][0].slice(2);assert.equal((await(await f.request(`/requests/${id}`,null,'user-b')).json()).status,'not_found');
});
test('cancel before reserve cannot incur a charge',async t=>{
  const f=await fixture(t);const b=f.body();await f.request(`/requests/${b.requestId}/cancel`,{});
  await(await f.request('/chat',b)).text();assert.equal(f.balance,100);assert.equal(f.calls,0);
});
test('concurrent sends are rejected and cancelling a live request refunds',async t=>{
  const f=await fixture(t,{invoke:async(_input,signal)=>({completed:new Promise(r=>signal.addEventListener('abort',r,{once:true})),async *toTextStream(){await new Promise(r=>signal.addEventListener('abort',r,{once:true}));}})});
  const b=f.body();const response=await f.request('/chat',b);
  assert.equal((await f.request('/chat',f.body())).status,429);
  await f.request(`/requests/${b.requestId}/cancel`,{});
  assert.match(await response.text(),/"status":"refunded"/);assert.equal(f.balance,100);
});
test('timeout refunds and releases request slot',async t=>{
  const f=await fixture(t,{timeoutMs:40,invoke:async(_input,signal)=>({completed:new Promise(r=>signal.addEventListener('abort',r,{once:true})),async *toTextStream(){await new Promise(r=>signal.addEventListener('abort',r,{once:true}));}})});
  const text=await(await f.request('/chat',f.body())).text();assert.match(text,/回答超时/);assert.equal(f.balance,100);
});
test('lost reserve response is reconciled and refunded',async t=>{
  const f=await fixture(t);const reserve=f.billing.reserve;
  f.billing.reserve=async(...args)=>{await reserve(...args);throw new Error('network lost');};
  const text=await(await f.request('/chat',f.body())).text();assert.match(text,/refunded/);assert.equal(f.balance,100);assert.equal(f.calls,0);
});
test('lost settlement response preserves paid answer and does not refund',async t=>{
  const f=await fixture(t);const finalize=f.billing.finalize;
  f.billing.finalize=async(...args)=>{const r=await finalize(...args);if(args[2]==='settled')throw new Error('network lost');return r;};
  const text=await(await f.request('/chat',f.body())).text();assert.match(text,/"type":"done"/);assert.equal(f.balance,93);
});
