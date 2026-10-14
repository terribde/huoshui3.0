import React, { useState } from 'react';
import { SiteNoticeBanner } from '../AgentNoticeModal';
import {
  Search,
  Sparkles,
  Sliders,
  Bot,
  Flame,
  PenLine,
  Coins,
  History,
  GraduationCap,
  FileText,
} from 'lucide-react';
import { motion } from 'motion/react';

type HubMode = 'search' | 'ai';

interface MobileQuarkHomeProps {
  onOpenNotice?: () => void;
  currentUser?: any | null;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  userPoints: number;
  /** 点击搜索卡片：进入「搜索 / AI 问答」合并页，并停在当前选中的标签 */
  onOpenSearchHub: (mode: HubMode) => void;
  /** 打开「本学期热门好评教师」全屏页面 */
  onOpenHotTeachers: () => void;
  onOpenRecommend: () => void;
  onOpenPoints: () => void;
  onOpenReview: () => void;
  onOpenExperienceModal: (tab?: 'guides' | 'notices' | 'history') => void;
}

export const MobileQuarkHome: React.FC<MobileQuarkHomeProps> = ({
  onOpenNotice,
  currentUser,
  onOpenAuth,
  userPoints,
  onOpenSearchHub,
  onOpenHotTeachers,
  onOpenRecommend,
  onOpenPoints,
  onOpenReview,
  onOpenExperienceModal,
}) => {
  const isLoggedIn = Boolean(currentUser);
  const [mode, setMode] = useState<HubMode>('search');

  // 第一排：线条图标（对标夸克「AI 生图 / AI 写作 …」）
  const mainActions = [
    { id: 'hot', label: '热门好评教师', icon: Flame, onClick: onOpenHotTeachers },
    { id: 'recommend', label: '智能选课', icon: Sliders, onClick: onOpenRecommend },
    { id: 'ai', label: 'AI 问答', icon: Bot, onClick: () => onOpenSearchHub('ai') },
    { id: 'review', label: '写评价', icon: PenLine, onClick: onOpenReview, badge: '+20' },
  ];

  // 第二排：彩色图标（对标夸克「扫描王 / 学习 / 日报 …」）
  const campusActions = [
    { id: 'history', label: '历史库', icon: History, gradient: 'from-blue-500 to-indigo-600', shadow: 'shadow-blue-500/25', onClick: () => onOpenExperienceModal('history') },
    { id: 'points', label: '积分中心', icon: Coins, gradient: 'from-rose-500 to-red-600', shadow: 'shadow-rose-500/25', onClick: onOpenPoints },
    { id: 'guides', label: '经验攻略', icon: GraduationCap, gradient: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/25', onClick: () => onOpenExperienceModal('guides') },
    { id: 'notices', label: '教务通知', icon: FileText, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', onClick: () => onOpenExperienceModal('notices') },
  ];

  return (
    <div id="mobile-quark-home" className="w-full min-h-[calc(100dvh-4rem)] px-4 pt-4 pb-24 flex flex-col items-center">
      {/* 1. 顶部：校区 + 积分 / 登录 */}
      <div className="w-full flex items-center justify-between text-xs text-gray-400">
        <span className="font-medium tracking-tight text-gray-500"> 犀浦 / 九里 / 东部 / 峨眉</span>

        {isLoggedIn ? (
          <motion.div
            onClick={onOpenPoints}
            whileTap={{ scale: 0.92 }}
            className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200/80 cursor-pointer transition-colors shadow-2xs"
          >
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-bold">{userPoints}</span>
            <span className="text-3xs text-amber-700">积分</span>
          </motion.div>
        ) : (
          <button
            onClick={() => onOpenAuth?.('login')}
            className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200/80 text-xs font-bold transition-colors shadow-2xs"
          >
            <span>登录 / 注册</span>
          </button>
        )}
      </div>

      {/* 2. 品牌 */}
      <div className="flex flex-col items-center justify-center mt-[17dvh] mb-8 select-none">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 font-sans">交大活水</h1>
        <p className="text-xs text-gray-400 mt-1.5 tracking-wide">西南交通大学专属教师评价 · 校园智能助手</p>
      </div>

      {onOpenNotice && <div className="w-full mb-4"><SiteNoticeBanner onOpen={onOpenNotice} /></div>}

      {/* 3. 夸克式大搜索卡片：点击进入搜索 / AI 问答页面 */}
      <div
        id="mobile-home-search-card"
        role="button"
        tabIndex={0}
        aria-label="搜索"
        onClick={() => onOpenSearchHub(mode)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSearchHub(mode); } }}
        className="w-full min-h-[8.5rem] p-4 flex flex-col justify-between bg-white rounded-[1.75rem] border border-gray-200/90 shadow-[0_6px_24px_rgb(0,0,0,0.05)] cursor-text active:scale-[0.99] transition-transform"
      >
        <p className="text-base text-gray-300 leading-snug">
          {mode === 'search' ? '搜索老师、课程或标签，如：高数、不点名' : '向 AI 提问选课、学习方法等问题'}
        </p>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {([
              { id: 'search', label: '搜索', icon: Search },
              { id: 'ai', label: 'AI 问答', icon: Sparkles },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={(e) => { e.stopPropagation(); setMode(id); }}
                className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === id
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-gray-50 text-gray-500 border border-transparent hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="开始搜索"
            onClick={(e) => { e.stopPropagation(); onOpenSearchHub(mode); }}
            className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs active:scale-90 transition-transform cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. 第一排：核心功能（线条图标） */}
      <div className="w-full grid grid-cols-4 gap-1 mt-8">
        {mainActions.map(({ id, label, icon: Icon, onClick, badge }) => (
          <motion.button
            key={id}
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-2.5 py-1 cursor-pointer"
          >
            <div className="relative">
              <Icon className="w-7 h-7 text-gray-800 stroke-[1.5]" />
              {badge && (
                <span className="absolute -top-1.5 -right-4 px-1 rounded-full bg-amber-100 text-amber-700 text-4xs font-bold leading-4">
                  {badge}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-700 text-center leading-tight">{label}</span>
          </motion.button>
        ))}
      </div>

      {/* 5. 第二排：校园专区（彩色图标） */}
      <div className="w-full grid grid-cols-4 gap-1 mt-6">
        {campusActions.map(({ id, label, icon: Icon, gradient, shadow, onClick }) => (
          <motion.button
            key={id}
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-2 py-1 cursor-pointer"
          >
            <div className={`w-12 h-12 rounded-full bg-gradient-to-b ${gradient} text-white shadow-md ${shadow} flex items-center justify-center`}>
              <Icon className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-xs text-gray-700">{label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
