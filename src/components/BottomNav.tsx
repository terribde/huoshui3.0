import React from 'react';
import { Search, Sliders, User, BookOpen, LayoutGrid } from 'lucide-react';
import { motion } from 'motion/react';

export type NavTab = 'home' | 'search' | 'services' | 'recommend' | 'profile';

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userPoints: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  userPoints,
}) => {
  const tabs: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', label: '首页', icon: BookOpen },
    { id: 'search', label: '教师库', icon: Search },
    { id: 'services', label: '服务', icon: LayoutGrid },
    { id: 'recommend', label: '智能选课', icon: Sliders },
    { id: 'profile', label: '我的', icon: User },
  ];

  return (
    <div 
      id="quark-bottom-nav" 
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/70 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
    >
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const IconComponent = tab.icon;

          return (
            <motion.button
              key={tab.id}
              id={`bottom-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              whileTap={{ scale: 0.86 }}
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className={`flex flex-col items-center justify-center gap-1 transition-colors relative py-1 px-2.5 rounded-xl ${
                isActive ? 'text-gray-950 font-bold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="relative">
                <IconComponent className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'stroke-[2.2] scale-110 text-indigo-600' : 'stroke-[1.8]'}`} />
                
                {tab.id === 'services' && !isActive && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                )}

                {tab.id === 'profile' && (
                  <span className="absolute -top-1 -right-3 px-1 py-0.2 bg-amber-500 text-white rounded-full text-[9px] font-bold leading-none scale-90">
                    {userPoints}
                  </span>
                )}
              </div>

              <span className={`text-[10px] transition-colors ${isActive ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
                {tab.label}
              </span>

              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute -bottom-0.5 w-4 h-0.5 bg-indigo-600 rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
