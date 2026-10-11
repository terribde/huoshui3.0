import React from 'react';
import { Search, Coins, PenLine } from 'lucide-react';
import { motion } from 'motion/react';

interface MobileQuarkHomeProps {
  currentUser?: any | null;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  userPoints: number;
  /** 点击首页搜索框：进入「搜索 / AI 问答」合并页 */
  onOpenSearchHub: () => void;
  onOpenPoints: () => void;
  onOpenReview: () => void;
}

export const MobileQuarkHome: React.FC<MobileQuarkHomeProps> = ({
  currentUser,
  onOpenAuth,
  userPoints,
  onOpenSearchHub,
  onOpenPoints,
  onOpenReview,
}) => {
  const isLoggedIn = Boolean(currentUser);

  return (
    <div
      id="mobile-quark-home"
      className="w-full min-h-[75vh] px-4 pt-4 pb-20 flex flex-col items-center"
    >
      {/* 1. Top status / campus indicator + Points badge */}
      <div className="w-full flex items-center justify-between text-xs text-gray-400">
        <span className="font-medium tracking-tight text-gray-500">西南交通大学 · 犀浦 / 九里</span>

        {isLoggedIn ? (
          <motion.div
            onClick={onOpenPoints}
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
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

      {/* 2. Brand + flat search bar, vertically centered */}
      <div className="w-full flex-1 flex flex-col items-center justify-center -mt-6">
        <div className="flex flex-col items-center justify-center mb-7 select-none">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 font-sans">
            交大活水
          </h1>
          <p className="text-xs text-gray-400 mt-1.5 tracking-wide">
            西南交通大学专属教师评价 · 校园智能助手
          </p>
        </div>

        {/* 只放搜索框：点击后进入搜索 / AI 问答页，首页不展示问题内容 */}
        <motion.button
          type="button"
          id="mobile-home-search-bar"
          onClick={onOpenSearchHub}
          whileTap={{ scale: 0.98 }}
          aria-label="搜索"
          className="w-full h-11 px-4 flex items-center gap-2.5 bg-white rounded-full border border-gray-200/80 shadow-[0_4px_18px_rgb(0,0,0,0.05)] text-left cursor-pointer transition-shadow hover:shadow-[0_6px_22px_rgb(0,0,0,0.08)]"
        >
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-sm text-gray-400 truncate">搜索</span>
        </motion.button>

        <div className="mt-5 flex justify-center">
          <motion.button
            type="button"
            id="home-quick-review-btn"
            whileTap={{ scale: 0.94 }}
            onClick={onOpenReview}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full shadow-md shadow-indigo-200/70 transition-all text-xs font-semibold"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>快速评价</span>
            <span className="text-3xs bg-white/20 px-1.5 py-0.5 rounded-full text-indigo-50 font-normal">
              +20积分
            </span>
          </motion.button>
        </div>
      </div>
    </div>
  );
};
