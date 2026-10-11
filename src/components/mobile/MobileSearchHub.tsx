import React, { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronLeft, Search, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { Teacher, College } from '../../types';
import { MobileTeacherSearch } from './MobileTeacherSearch';

// AI 聊天较重，只在第一次切到「AI 问答」时才加载
const AiChat = lazy(() => import('../AiAssistantModal').then(m => ({ default: m.AiAssistantModal })));

export type HubMode = 'search' | 'ai';

interface MobileSearchHubProps {
  mode: HubMode;
  onModeChange: (mode: HubMode) => void;
  onBack: () => void;

  // 搜索
  teachers: Teacher[];
  colleges?: College[];
  initialSearch?: string;
  onSelectTeacher: (teacher: Teacher) => void;
  onOpenReview?: (teacher?: Teacher) => void;

  // AI 问答
  userId: string | null;
  userPoints: number;
  aiInitialPrompt?: string;
  onLogin: () => void;
  onBalance: (balance: number) => void;
}

/** 手机端：搜索与 AI 问答合并成一个页面，顶部一个开关切换。 */
export const MobileSearchHub: React.FC<MobileSearchHubProps> = ({
  mode,
  onModeChange,
  onBack,
  teachers,
  colleges,
  initialSearch = '',
  onSelectTeacher,
  onOpenReview,
  userId,
  userPoints,
  aiInitialPrompt,
  onLogin,
  onBalance,
}) => {
  const [aiVisited, setAiVisited] = useState(mode === 'ai');
  useEffect(() => { if (mode === 'ai') setAiVisited(true); }, [mode]);

  const tabs: { id: HubMode; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'search', label: '搜索', icon: Search },
    { id: 'ai', label: 'AI 问答', icon: Sparkles },
  ];

  return (
    <div
      id="mobile-search-hub"
      // 底部导航高度为 h-16，预留出来，避免输入框被挡住
      className="w-full flex flex-col h-[calc(100dvh-4rem)] bg-white"
    >
      {/* 顶部：返回 + 搜索 / AI 切换 */}
      <div className="shrink-0 px-3 pt-3 pb-2 flex items-center gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={onBack}
          aria-label="返回"
          className="p-1.5 -ml-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>

        <div role="tablist" aria-label="搜索或 AI 问答" className="flex-1 flex items-center bg-gray-100/80 p-0.5 rounded-xl">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => onModeChange(id)}
              className={`relative flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                mode === id ? 'text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5 relative z-10" />
              <span className="relative z-10">{label}</span>
              {mode === id && (
                <motion.div
                  layoutId="hubModePill"
                  className="absolute inset-0 bg-indigo-600 rounded-lg shadow-xs"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区：两个面板都保留挂载，切换时不丢失输入和聊天记录 */}
      <div className="flex-1 min-h-0 relative">
        <div className={mode === 'search' ? 'h-full overflow-y-auto overscroll-contain' : 'hidden'}>
          <MobileTeacherSearch
            teachers={teachers}
            colleges={colleges}
            initialSearch={initialSearch}
            onSelectTeacher={onSelectTeacher}
            onOpenReview={onOpenReview}
            autoFocus={mode === 'search'}
          />
        </div>

        {aiVisited && (
          <div className={mode === 'ai' ? 'h-full flex flex-col' : 'hidden'}>
            <Suspense fallback={<div className="p-6 text-center text-xs text-gray-400">正在加载…</div>}>
              <AiChat
                key={userId || 'guest'}
                embedded
                isOpen={mode === 'ai'}
                userId={userId}
                userPoints={userPoints}
                initialPrompt={aiInitialPrompt}
                onClose={onBack}
                onLogin={onLogin}
                onBalance={onBalance}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
};
