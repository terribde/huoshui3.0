// Development-only fixture page; no database calls or real point deductions.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { INITIAL_TEACHERS } from '../../src/data/mockTeachers';
import { RATING_DIMENSIONS } from '../../src/lib/ratings';
import type { Teacher, TeacherRatingDimensions } from '../../src/types';
import { MobileTeacherSearch } from '../../src/components/mobile/MobileTeacherSearch';
import { DesktopTeacherSearch } from '../../src/components/desktop/DesktopTeacherSearch';
import { TeacherDetailModal } from '../../src/components/TeacherDetailModal';
import { CourseRecommend } from '../../src/components/CourseRecommend';

const base={...INITIAL_TEACHERS[0],courses:['高等数学 (I)'],tags:[],recentTermCourses:[],isTeachingThisTerm:true};
const empty=Object.fromEntries(RATING_DIMENSIONS.map(d=>[d.key,null])) as TeacherRatingDimensions;
const teachers: Teacher[]=[
  {...base,id:'missing',name:'暂无评分老师',reviewCount:0,hasHistoricalData:false,overallScore:null,dimensions:empty},
  {...base,id:'partial',name:'部分评分老师',overallScore:null,dimensions:{...base.dimensions,attendanceStrictness:null,teachingQuality:null}},
  {...base,id:'rated',name:'真实评分老师',overallScore:4.5},
];
function Harness(){
  const [view,setView]=useState('mobile');
  const [selected,setSelected]=useState<Teacher|null>(null);
  return <main className="p-3"><nav className="flex flex-wrap gap-4 mb-4">
    <button onClick={()=>setView('mobile')}>手机列表</button>
    <button onClick={()=>setView('desktop')}>桌面列表</button>
    <button onClick={()=>setView('recommend')}>推荐列表</button>
    <button onClick={()=>setSelected(teachers[0])}>无评分详情</button>
    <button onClick={()=>setSelected(teachers[1])}>部分评分详情</button>
  </nav>
    {view==='mobile'&&<MobileTeacherSearch teachers={teachers} onSelectTeacher={setSelected}/>}
    {view==='desktop'&&<DesktopTeacherSearch teachers={teachers} onSelectTeacher={setSelected}/>}
    {view==='recommend'&&<CourseRecommend teachers={teachers} userPoints={100} onSelectTeacher={setSelected} onDeductPoints={()=>true}/>}
    {selected&&<TeacherDetailModal teacher={selected} reviews={[]} onClose={()=>setSelected(null)} onOpenReview={()=>{}} onLikeReview={()=>{}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
