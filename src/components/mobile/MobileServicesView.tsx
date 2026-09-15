import React from 'react';
import { Teacher } from '../../types';
import { 
  Search, 
  Sliders, 
  Bot, 
  PenLine, 
  LayoutGrid, 
  FileText, 
  GraduationCap, 
  Coins, 
  History, 
  ChevronRight, 
  Star, 
  TrendingUp,
  ShieldCheck
} from 'lucide-react';
import { motion } from 'motion/react';

interface MobileServicesViewProps {
  teachers: Teacher[];
  userPoints: number;
  onOpenSearch: (query?: string) => void;
  onOpenRecommend: (course?: string) => void;
  onOpenAiChat: (initialPrompt?: string) => void;
  onOpenReview: (teacher?: Teacher) => void;
  onOpenPoints: () => void;
  onOpenCollegeList: () => void;
  onOpenExperienceModal: (tab?: 'guides' | 'notices' | 'history') => void;
  onSelectTeacher: (teacher: Teacher) => void;
}

export const MobileServicesView: React.FC<MobileServicesViewProps> = ({
  teachers,
  userPoints,
  onOpenSearch,
  onOpenRecommend,
  onOpenAiChat,
  onOpenReview,
  onOpenPoints,
  onOpenCollegeList,
  onOpenExperienceModal,
  onSelectTeacher,
}) => {
  const featuredTeachers = teachers.slice(0, 4);

  return (
    <div 
      id="mobile-services-view" 
      className="w-full px-4 pt-3 pb-24 space-y-4"
    >
      {/* 1. Services Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-3xl shadow-sm space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">交大服务 · 功能中心</span>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold">
              百宝箱
            </span>
          </div>
          <motion.div 
            onClick={onOpenPoints}
            whileTap={{ scale: 0.9 }}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors"
          >
            <Coins className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-bold">{userPoints}</span>
            <span className="text-[10px]">分</span>
          </motion.div>
        </div>
        <p className="text-[11px] text-indigo-100">
          全校教师库检索 · 智能推荐偏好 · 经验攻略与教务通知
        </p>
      </div>

      {/* 2. Core 5 Function Buttons (Clean 5-Column layout) */}
      <div className="bg-white p-3.5 rounded-3xl border border-gray-100 shadow-2xs space-y-2">
        <span className="text-[11px] font-bold text-gray-400 px-1 uppercase tracking-wider block">
          核心功能
        </span>
        <div className="grid grid-cols-5 gap-1">
          {/* 1. 找老师 */}
          <motion.button
            onClick={() => onOpenSearch()}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center gap-1 p-1 rounded-2xl transition-all group cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-indigo-200 transition-all">
              <Search className="w-5 h-5 stroke-[1.8]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700">找老师</span>
          </motion.button>

          {/* 2. 智能选课 */}
          <motion.button
            onClick={() => onOpenRecommend()}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center gap-1 p-1 rounded-2xl transition-all group cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-amber-200 transition-all">
              <Sliders className="w-5 h-5 stroke-[1.8]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700">智能选课</span>
          </motion.button>

          {/* 3. AI 问答 */}
          <motion.button
            onClick={() => onOpenAiChat()}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center gap-1 p-1 rounded-2xl transition-all group cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-indigo-200 transition-all">
              <Bot className="w-5 h-5 stroke-[1.8]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700">AI 问答</span>
          </motion.button>

          {/* 4. 写评价 */}
          <motion.button
            onClick={() => onOpenReview()}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center gap-1 p-1 rounded-2xl transition-all group cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-emerald-200 transition-all">
              <PenLine className="w-5 h-5 stroke-[1.8]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700">写评价</span>
          </motion.button>

          {/* 5. 院系库 */}
          <motion.button
            onClick={onOpenCollegeList}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center gap-1 p-1 rounded-2xl transition-all group cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-purple-200 transition-all">
              <LayoutGrid className="w-5 h-5 stroke-[1.8]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700">院系库</span>
          </motion.button>
        </div>
      </div>

      {/* 3. Colorful App-Style Badges (Row of 4) */}
      <div className="bg-white p-3.5 rounded-3xl border border-gray-100 shadow-2xs space-y-2.5">
        <span className="text-[11px] font-bold text-gray-400 px-1 uppercase tracking-wider block">
          校园专区
        </span>
        <div className="grid grid-cols-4 gap-2">
          {/* 1. 历史库 */}
          <motion.button
            onClick={() => onOpenExperienceModal('history')}
            whileHover={{ scale: 1.06, y: -3 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1.5 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/25 group-hover:shadow-lg group-hover:shadow-blue-500/40 flex items-center justify-center transition-all">
              <History className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-indigo-600 transition-colors">历史库</span>
          </motion.button>

          {/* 2. 积分中心 */}
          <motion.button
            onClick={onOpenPoints}
            whileHover={{ scale: 1.06, y: -3 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1.5 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/25 group-hover:shadow-lg group-hover:shadow-rose-500/40 flex items-center justify-center transition-all">
              <Coins className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-rose-600 transition-colors">积分中心</span>
          </motion.button>

          {/* 3. 经验攻略 */}
          <motion.button
            onClick={() => onOpenExperienceModal('guides')}
            whileHover={{ scale: 1.06, y: -3 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1.5 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25 group-hover:shadow-lg group-hover:shadow-amber-500/40 flex items-center justify-center transition-all">
              <GraduationCap className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-amber-600 transition-colors">经验攻略</span>
          </motion.button>

          {/* 4. 教务通知 */}
          <motion.button
            onClick={() => onOpenExperienceModal('notices')}
            whileHover={{ scale: 1.06, y: -3 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1.5 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 group-hover:shadow-lg group-hover:shadow-emerald-500/40 flex items-center justify-center transition-all">
              <FileText className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-emerald-600 transition-colors">教务通知</span>
          </motion.button>
        </div>
      </div>

      {/* 4. Featured Teachers Section */}
      <div className="bg-white p-3.5 rounded-3xl border border-gray-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            <h3 className="text-xs font-bold text-gray-900 tracking-wider">本学期热门好评教师</h3>
          </div>
          <button
            onClick={() => onOpenSearch()}
            className="text-[11px] text-gray-400 hover:text-indigo-600 flex items-center gap-0.5 transition-colors font-medium"
          >
            查看全部 <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2">
          {featuredTeachers.map((teacher) => (
            <motion.div
              key={teacher.id}
              onClick={() => onSelectTeacher(teacher)}
              whileTap={{ scale: 0.98 }}
              className="p-3 bg-gray-50/70 hover:bg-gray-100/70 rounded-2xl border border-gray-100 shadow-2xs transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                  {teacher.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900 text-xs group-hover:text-indigo-600 transition-colors">
                      {teacher.name}
                    </span>
                    <span className="text-[10px] text-gray-500">{teacher.title}</span>
                    <span className="text-[9px] px-1 py-0.2 bg-gray-200 text-gray-600 rounded">
                      {teacher.college.replace('学院', '')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                    <span>{teacher.courses[0]}</span>
                    <span>·</span>
                    <span className="text-emerald-600 font-medium">给分 {teacher.dimensions.gradingLeniency}分</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 font-bold text-amber-600 text-xs">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{teacher.overallScore.toFixed(1)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 5. Community Guidelines banner */}
      <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 text-xs text-gray-500 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-gray-700">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>交大公益社区公约 (PRD 5.0)</span>
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500">
          写评价获赠 +20 积分奖励，结构化查老师永久免费。共建交大真实口碑选课社区！
        </p>
      </div>
    </div>
  );
};
