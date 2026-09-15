import React, { useState } from 'react';
import { 
  Search, 
  Sparkles, 
  Volume2, 
  Sliders, 
  Coins, 
} from 'lucide-react';
import { motion } from 'motion/react';

interface MobileQuarkHomeProps {
  userPoints: number;
  onOpenSearch: (query?: string) => void;
  onOpenRecommend: (course?: string) => void;
  onOpenAiChat: (initialPrompt?: string) => void;
  onOpenPoints: () => void;
}

export const MobileQuarkHome: React.FC<MobileQuarkHomeProps> = ({
  userPoints,
  onOpenSearch,
  onOpenRecommend,
  onOpenAiChat,
  onOpenPoints,
}) => {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'ai' | 'search'>('ai');

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

  return (
    <motion.div 
      id="mobile-quark-home" 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="w-full min-h-[75vh] px-4 pt-4 pb-20 flex flex-col justify-between items-center"
    >
      {/* 1. Top status / campus indicator + Points badge */}
      <div className="w-full flex items-center justify-between text-xs text-gray-400 mb-6">
        <span className="font-medium tracking-tight text-gray-500">西南交通大学 · 犀浦 / 九里</span>
        <motion.div 
          onClick={onOpenPoints}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.03 }}
          className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200/80 cursor-pointer transition-colors shadow-2xs"
        >
          <Coins className="w-3.5 h-3.5 text-amber-500" />
          <span className="font-bold">{userPoints}</span>
          <span className="text-[10px] text-amber-700">积分</span>
        </motion.div>
      </div>

      {/* 2. Center Brand Title + Clean Quark AI Input Box */}
      <div className="w-full flex-1 flex flex-col items-center justify-center -mt-6">
        {/* Brand Title: Stylized Logo like Quark */}
        <motion.div 
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="flex flex-col items-center justify-center mb-6 select-none"
        >
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 font-sans">
              交大活水
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
              Agent
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 tracking-wide">
            西南交通大学专属教师评价 · 校园智能助手
          </p>
        </motion.div>

        {/* Center Search Card (The Quark AI Input Box) */}
        <motion.div 
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="w-full bg-white rounded-3xl border border-gray-200/80 shadow-[0_6px_25px_rgb(0,0,0,0.06)] p-3.5 transition-all"
        >
          <form onSubmit={handleInputSubmit} className="space-y-3">
            {/* Main Input */}
            <div className="relative">
              <input
                id="mobile-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="把问题和任务告诉我（如：高数老师选谁？）"
                className="w-full px-2 py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-hidden bg-transparent"
              />
            </div>

            {/* Bottom Row Inside Card */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100/80">
              {/* Mode toggles with fluid sliding pill */}
              <div className="flex items-center bg-gray-100/80 p-0.5 rounded-xl relative">
                <button
                  type="button"
                  onClick={() => setSearchMode('ai')}
                  className={`relative z-10 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                    searchMode === 'ai' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>AI 问答</span>
                  {searchMode === 'ai' && (
                    <motion.div
                      layoutId="searchModePill"
                      className="absolute inset-0 bg-indigo-600 rounded-lg -z-10 shadow-xs"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSearchMode('search')}
                  className={`relative z-10 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                    searchMode === 'search' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Search className="w-3 h-3" />
                  <span>搜老师</span>
                  {searchMode === 'search' && (
                    <motion.div
                      layoutId="searchModePill"
                      className="absolute inset-0 bg-indigo-600 rounded-lg -z-10 shadow-xs"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                </button>
              </div>

              {/* Right icons like Quark's sliders / volume / search */}
              <div className="flex items-center gap-1.5 text-gray-400">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={() => onOpenRecommend()}
                  title="智能选课推荐"
                  className="p-1.5 rounded-full hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <Sliders className="w-4 h-4" />
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={() => onOpenAiChat('有哪些平时很少点名、给分还好的神仙老师？')}
                  title="快捷提问"
                  className="p-1.5 rounded-full hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.05 }}
                  className="p-1.5 rounded-full bg-indigo-600 text-white shadow-xs"
                >
                  <Search className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </form>

          {/* Quick prompt suggestions chips underneath */}
          <div className="flex flex-wrap gap-1.5 pt-2.5 mt-2 border-t border-gray-50">
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => handleQuickPromptClick('高等数学哪位老师给分松？', 'ai')}
              className="text-[11px] px-2.5 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
            >
              高数哪位老师给分松？
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => handleQuickPromptClick('高等数学 (I)', 'recommend')}
              className="text-[11px] px-2.5 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
            >
              高数偏好推荐
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => handleQuickPromptClick('不点名', 'search')}
              className="text-[11px] px-2.5 py-1 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 rounded-full transition-colors"
            >
              从不点名神仙老师
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* 3. Subtle bottom hint */}
      <div className="text-[11px] text-gray-400 text-center pb-2 select-none">
        底部点击【服务】进入全校功能中心与专区
      </div>
    </motion.div>
  );
};
