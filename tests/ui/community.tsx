// Local development harness only; no auth or cloud writes, not part of the production entry.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { TeacherDetailModal } from '../../src/components/TeacherDetailModal';
import { ReviewModal } from '../../src/components/ReviewModal';
import { UserPointsModal } from '../../src/components/UserPointsModal';
import { AuthModal } from '../../src/components/AuthModal';
import { AdminAuditModal } from '../../src/components/AdminAuditModal';
import { INITIAL_TEACHERS } from '../../src/data/mockTeachers';
import { supabaseService } from '../../src/services/supabaseService';
const teacher={...INITIAL_TEACHERS[0],name:'张老师（很长的姓名测试）',college:'计算机与人工智能学院与信息科学技术联合教学中心'};
supabaseService.getCourses=async()=>[{id:'course-test',name:'测试课程'}];
supabaseService.checkIsAdmin=async()=>({isAdmin:true,role:'super_admin'});
supabaseService.getAdminList=async()=>[];
function Harness(){
  const [detail,setDetail]=useState(false),[review,setReview]=useState(false),[points,setPoints]=useState(false),[auth,setAuth]=useState(false);
  const [admin,setAdmin]=useState(false);
  const transactions=Array.from({length:50},(_,i)=>({id:String(i),action:'测试积分流水 '+i,amount:5,balanceAfter:100+i*5,timestamp:'12:00'}));
  return <main className="p-4 space-y-4"><h1>本地弹窗测试，所有数据为假数据</h1>
    <nav className="flex flex-wrap gap-3"><button onClick={()=>setDetail(true)}>教师详情测试</button><button onClick={()=>setReview(true)}>写评价测试</button><button onClick={()=>setPoints(true)}>积分窗口测试</button><button onClick={()=>setAuth(true)}>登录窗口测试</button><button onClick={()=>setAdmin(true)}>管理窗口测试</button></nav>
    <div style={{height:1200}}>用于测试页面滚动后打开窗口</div><button onClick={()=>setReview(true)}>底部打开评价</button>
    {detail&&<TeacherDetailModal teacher={teacher} reviews={[]} onClose={()=>setDetail(false)} onOpenReview={()=>setReview(true)} onLikeReview={()=>{}} likedReviewIds={new Set()} pendingLikeIds={new Set()} likesLoading={false}/>}
    {review&&<ReviewModal isOpen teachers={[teacher]} preselectedTeacher={teacher} onClose={()=>setReview(false)} onSubmitReview={async()=>({success:true})}/>}
    {points&&<UserPointsModal isOpen onClose={()=>setPoints(false)} points={125} transactions={transactions} hasCheckedInToday={false} onCheckIn={()=>{}} onOpenReview={()=>setReview(true)}/>}
    {auth&&<AuthModal isOpen onClose={()=>setAuth(false)}/>}
    {admin&&<AdminAuditModal isOpen onClose={()=>setAdmin(false)} reviews={[]} teachers={[]} onApproveReview={async()=>{}} onRejectReview={async()=>{}} onDeleteReview={async()=>{}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
