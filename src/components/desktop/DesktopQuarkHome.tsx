import React, { useState } from 'react';
import { Teacher } from '../../types';
import { 
  Search, 
  Sparkles, 
  Volume2, 
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
  CheckCircle2, 
  TrendingUp,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface DesktopQuarkHomeProps {
  currentUser?: any | null;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
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

export const DesktopQuarkHome: React.FC<DesktopQuarkHomeProps> = ({
  currentUser,
  onOpenAuth,
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
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'ai' | 'search'>('ai');
  const isLoggedIn = Boolean(currentUser);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (searchMode === 'ai') {
      onOpenAiChat(query.trim());
    } else {
      onOpenSearch(query.trim());
    }
    setQuery('');
  };

  const handleQuickPromptClick = (prompt: string, mode: 'ai' | 'recommend' | 'search') => {
    if (mode === 'ai') {
      onOpenAiChat(prompt);
    } else if (mode === 'recommend') {
      onOpenRecommend(prompt);
    } else {
      onOpenSearch(prompt);
    }
  };

  const featuredTeachers = teachers.slice(0, 5);

  const popularCourses = [
    { name: '高等数学 (I)', tag: '数学院 · 必修' },
    { name: '数据结构与算法', tag: '计算机院 · 核心' },
    { name: '微积分 (B)', tag: '数学院 · 重点' },
    { name: '大学物理 (I)', tag: '物理院 · 必修' },
    { name: '理论力学', tag: '土木院 · 专业课' },
  ];

  return (
    <div id="desktop-quark-home" className="w-full max-w-5xl mx-auto pt-2 pb-16 flex flex-col items-center">
      {/* 1. Status Bar */}
      <div className="w-full flex items-center justify-between text-xs text-gray-400 mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium tracking-tight text-gray-600">西南交通大学 · 犀浦 / 九里校区</span>
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">
            数据已同步 2024-2025 学年
          </span>
        </div>
        
        {isLoggedIn ? (
          <div 
            onClick={onOpenPoints}
            className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200/80 cursor-pointer transition-colors shadow-2xs"
          >
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-bold">{userPoints}</span>
            <span className="text-[10px] text-amber-700">积分中心</span>
          </div>
        ) : (
          <button
            onClick={() => onOpenAuth?.('login')}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3.5 py-1.5 rounded-full border border-indigo-200/80 text-xs font-bold transition-all shadow-2xs"
          >
            <span>登录 / 注册享新人积分</span>
          </button>
        )}
      </div>

      {/* 2. Brand Title */}
      <div className="flex flex-col items-center justify-center my-6 select-none">
        <div className="flex items-center gap-2.5">
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-950 font-sans">
            交大活水
          </h1>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
            Agent
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-2 tracking-wide text-center">
          西南交通大学专属教师评价 · 校园智能助手 (PRD标准六维打分 · 选课偏好推荐)
        </p>
      </div>

      {/* 3. Center Search Card (Desktop Quark Input) */}
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-gray-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-5 mb-8 transition-all hover:shadow-[0_10px_35px_rgb(0,0,0,0.09)]">
        <form onSubmit={handleInputSubmit} className="space-y-3.5">
          <div className="relative">
            <input
              id="desktop-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="把问题和任务告诉我（如：高数哪个老师给分松？求不点名且干货多的老师）"
              className="w-full px-2 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-hidden bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100/80">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchMode('ai')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  searchMode === 'ai'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI 问答
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('search')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  searchMode === 'search'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                搜老师 (免费)
              </button>
            </div>

            <div className="flex items-center gap-2 text-gray-400">
              <button
                type="button"
                onClick={() => onOpenRecommend()}
                title="智能选课推荐"
                className="p-2 rounded-xl hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <Sliders className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenAiChat('有哪些平时很少点名、给分还好的神仙老师？')}
                title="快捷提问"
                className="p-2 rounded-xl hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Search className="w-3.5 h-3.5" />
                <span>搜索</span>
              </button>
            </div>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 pt-3 mt-2 border-t border-gray-50">
          <span className="text-[11px] text-gray-400 flex items-center py-1">热门热搜：</span>
          <button
            onClick={() => handleQuickPromptClick('高等数学哪位老师给分松？', 'ai')}
            className="text-xs px-3 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
          >
            高数哪位老师给分松？
          </button>
          <button
            onClick={() => handleQuickPromptClick('高等数学 (I)', 'recommend')}
            className="text-xs px-3 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
          >
            高数偏好推荐
          </button>
          <button
            onClick={() => handleQuickPromptClick('不点名', 'search')}
            className="text-xs px-3 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
          >
            从不点名神仙老师
          </button>
          <button
            onClick={() => handleQuickPromptClick('计算机学院讲课最好的老师是谁？', 'ai')}
            className="text-xs px-3 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
          >
            计算机院讲课口碑
          </button>
        </div>
      </div>

      {/* 4. Row 1: 5 Core Feature Cards (Desktop 5-Column Grid) */}
      <div className="w-full grid grid-cols-5 gap-3.5 mb-4">
        {/* 1. 找老师 */}
        <button
          onClick={() => onOpenSearch()}
          className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <Search className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-600 block">找老师</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">结构化精准检索</span>
          </div>
        </button>

        {/* 2. 智能选课 */}
        <button
          onClick={() => onOpenRecommend()}
          className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-amber-200 hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Sliders className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-amber-600 block">智能选课</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">六维加权动态匹配</span>
          </div>
        </button>

        {/* 3. AI 问答 */}
        <button
          onClick={() => onOpenAiChat()}
          className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <Bot className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-600 block">AI 问答</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">RAG 校园大模型</span>
          </div>
        </button>

        {/* 4. 写评价 */}
        <button
          onClick={() => onOpenReview()}
          className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <PenLine className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-emerald-600 block">写评价</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">打分赚 +20 积分</span>
          </div>
        </button>

        {/* 5. 院系库 */}
        <button
          onClick={onOpenCollegeList}
          className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-purple-200 hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <LayoutGrid className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-purple-600 block">院系库</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">全校11大院系</span>
          </div>
        </button>
      </div>

      {/* 5. Row 2: 4 Colorful App Badges (Desktop 4-Column Grid) */}
      <div className="w-full grid grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => onOpenExperienceModal('history')}
          className="flex items-center gap-3.5 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-blue-200 shadow-2xs hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
            <History className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-blue-600 block">历史库</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">2024前沉淀数据迁移</span>
          </div>
        </button>

        <button
          onClick={onOpenPoints}
          className="flex items-center gap-3.5 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-rose-200 shadow-2xs hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/20 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-rose-600 block">积分中心</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">每日签到 · 流水明细</span>
          </div>
        </button>

        <button
          onClick={() => onOpenExperienceModal('guides')}
          className="flex items-center gap-3.5 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-amber-200 shadow-2xs hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20 flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-amber-600 block">经验攻略</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">保研综测 · 转专业指南</span>
          </div>
        </button>

        <button
          onClick={() => onOpenExperienceModal('notices')}
          className="flex items-center gap-3.5 p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-emerald-200 shadow-2xs hover:shadow-xs active:scale-98 transition-all group text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800 group-hover:text-emerald-600 block">教务通知</span>
            <span className="text-[11px] text-gray-400 mt-0.5 block">选课排期 · 免修免试</span>
          </div>
        </button>
      </div>

      {/* 6. Lower Section: Desktop 2-Column Dashboard */}
      <div className="w-full grid grid-cols-12 gap-6">
        {/* Left Column: Featured Teachers */}
        <div className="col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 tracking-tight">本学期热门好评教师</h3>
            </div>
            <button
              onClick={() => onOpenSearch()}
              className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-0.5 transition-colors font-medium"
            >
              进入完整教师库 ({teachers.length}) <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {featuredTeachers.map((teacher) => (
              <div
                key={teacher.id}
                onClick={() => onSelectTeacher(teacher)}
                className="p-4 bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                    {teacher.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base group-hover:text-indigo-600 transition-colors">
                        {teacher.name}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">{teacher.title}</span>
                      <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">
                        {teacher.college.replace('学院', '')}
                      </span>
                      {teacher.isTeachingThisTerm && (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                          本学期在教
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span className="text-gray-700 font-medium">{teacher.courses[0]}</span>
                      <span>·</span>
                      <span className="text-emerald-600 font-medium">给分宽松 {teacher.dimensions.gradingLeniency}分</span>
                      <span>·</span>
                      <span>考勤宽松度 {teacher.dimensions.attendanceStrictness}分</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 font-bold text-amber-600 text-base">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{teacher.overallScore.toFixed(1)}</span>
                  </div>
                  <span className="text-[11px] text-gray-400">{teacher.reviewCount} 条评价</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Quick Guidance Panels */}
        <div className="col-span-5 space-y-4">
          {/* Quick Recommend card */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-bold text-gray-900">重点公共课智能选课</h4>
              </div>
              <button
                onClick={() => onOpenRecommend()}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5 font-medium"
              >
                偏好加权 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              一键直达，依据不点名偏好、给分大方程度与讲课质量加权排序：
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {popularCourses.map((c) => (
                <button
                  key={c.name}
                  onClick={() => onOpenRecommend(c.name)}
                  className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-xs text-gray-700 border border-gray-100 hover:border-indigo-200 transition-all font-medium flex items-center gap-1.5"
                >
                  <span>{c.name}</span>
                  <span className="text-[10px] text-gray-400">{c.tag}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI Assistant Quick Questions */}
          <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/50 p-5 rounded-3xl border border-indigo-100/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-gray-900">AI 选课顾问速问</h4>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                2积分 / 次
              </span>
            </div>
            <div className="space-y-2">
              {[
                '哪位高等数学老师从不随机点名？',
                '大一想保研刷90+绩点，物理课怎么选？',
                '计算机学院数据结构哪位老师讲得最好？',
                '土木力学课陈宇宏老师给分风格怎么样？'
              ].map((q, idx) => (
                <div
                  key={idx}
                  onClick={() => onOpenAiChat(q)}
                  className="p-2.5 bg-white/90 hover:bg-white rounded-xl border border-indigo-100/60 hover:border-indigo-300 text-xs text-gray-700 cursor-pointer transition-all flex items-center justify-between group"
                >
                  <span className="line-clamp-1">{q}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-600 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Community Standards & Points Banner */}
          <div className="p-4 bg-white rounded-3xl border border-gray-100 text-xs text-gray-500 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-gray-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>交大公益社区共建公约 (PRD 5.0 / 8.0)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-600">
              结构化查询全校教师永久免费。提交真实上课评价通过审核可获 <strong className="text-amber-600">+20 积分</strong>。严禁注水与人身攻击，真实互助让选课不再踩坑！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
