// Development-only UI harness. No cloud calls or real credentials.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {AiAssistantModal} from '../../src/components/AiAssistantModal';
import {aiService} from '../../src/services/aiService';
let balance=100, lastStatus:any={status:'not_found',balance}, mode='normal';
aiService.config=async()=>({available:true,cost:7,balance,maxLength:1000});
aiService.status=async()=>lastStatus;
aiService.cancel=async()=>{lastStatus={status:'refunded',balance:100};return lastStatus;};
aiService.chat=async(_body,signal,event)=>{
  if(mode==='slow') { await new Promise<void>((resolve,reject)=>{if(signal.aborted)return reject(new Error('aborted'));signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}); return; }
  event({type:'status',status:'pending',balance:balance-7});
  const text='### 学习建议\n\n先明确目标，再安排复习。\n\n- 每周整理错题\n- 保留休息时间\n\n**当前不能查询教师数据。**\n<script>window.__unsafe=true</script>';
  for(const part of text.split(' ')){event({type:'delta',status:'pending',text:part+' '});await new Promise(r=>setTimeout(r,5));}
  balance-=7;lastStatus={status:'settled',balance,cost:7,reply:text};event({type:'done',...lastStatus});
};
function Harness(){
 const [open,setOpen]=useState(true),[user,setUser]=useState<string|null>('test-user'),[points,setPoints]=useState(100);
 return <><nav className="flex gap-4 p-4"><button onClick={()=>setOpen(true)}>打开聊天</button><button onClick={()=>{mode='slow';setOpen(true);}}>慢速测试</button><button onClick={()=>{setUser(user?null:'test-user');setOpen(true);}}>切换登录</button></nav><AiAssistantModal key={user||'guest'} isOpen={open} userId={user} userPoints={points} onBalance={setPoints} onClose={()=>setOpen(false)} onLogin={()=>setUser('test-user')}/></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
