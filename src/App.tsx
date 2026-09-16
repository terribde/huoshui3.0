/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Teacher, Review, UserPointTransaction } from './types';
import { INITIAL_TEACHERS, INITIAL_REVIEWS } from './data/mockTeachers';

// Mobile Dedicated Views (Clean, pure Quark layout matching reference image)
import { MobileQuarkHome } from './components/mobile/MobileQuarkHome';
import { MobileUserProfile } from './components/mobile/MobileUserProfile';
import { MobileTeacherSearch } from './components/mobile/MobileTeacherSearch';
import { MobileServicesView } from './components/mobile/MobileServicesView';
import { BottomNav, NavTab } from './components/BottomNav';

// Desktop Dedicated Views (Spacious 2-column wide screen layout)
import { DesktopQuarkHome } from './components/desktop/DesktopQuarkHome';
import { DesktopUserProfile } from './components/desktop/DesktopUserProfile';
import { DesktopTeacherSearch } from './components/desktop/DesktopTeacherSearch';

// Shared Functional Components
import { CourseRecommend } from './components/CourseRecommend';
import { TeacherDetailModal } from './components/TeacherDetailModal';
import { AiAssistantModal } from './components/AiAssistantModal';
import { ReviewModal } from './components/ReviewModal';
import { UserPointsModal } from './components/UserPointsModal';
import { CollegeListModal } from './components/CollegeListModal';
import { ExperienceGuideModal } from './components/ExperienceGuideModal';

import { 
  Smartphone, 
  Monitor, 
  BookOpen, 
  Search, 
  Sliders, 
  User, 
  Coins, 
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Core application states
  const [teachers, setTeachers] = useState<Teacher[]>(INITIAL_TEACHERS);
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [userPoints, setUserPoints] = useState<number>(38);
  const [hasCheckedInToday, setHasCheckedInToday] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<UserPointTransaction[]>([
    {
      id: 'tx_init',
      action: '新用户注册欢迎礼',
      amount: 30,
      timestamp: '2025-02-01 10:00',
      balanceAfter: 30,
    },
    {
      id: 'tx_checkin_prev',
      action: '历史每日签到奖励',
      amount: 8,
      timestamp: '2025-02-02 08:30',
      balanceAfter: 38,
    }
  ]);

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [initialTeacherSearch, setInitialTeacherSearch] = useState<string>('');

  // Modals state
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string>('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [reviewTargetTeacher, setReviewTargetTeacher] = useState<Teacher | null>(null);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState<boolean>(false);
  const [isCollegesModalOpen, setIsCollegesModalOpen] = useState<boolean>(false);
  const [isExperienceModalOpen, setIsExperienceModalOpen] = useState<boolean>(false);
  const [experienceTab, setExperienceTab] = useState<'guides' | 'notices' | 'history'>('guides');

  // Device Mode: 'mobile' (Quark pure app) vs 'desktop' (wide screen dashboard)
  // Default to 'mobile' on mobile devices or 'mobile' view by default to match Quark image requested by user
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');

  // Auto detect screen on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      // User is on desktop browser, but allow toggling
    }
  }, []);

  // Points Deduction Handler (PRD 5.0)
  const handleDeductPoints = (amount: number, reason: string): boolean => {
    if (userPoints < amount) {
      alert(`积分不足！本次操作需消耗 ${amount} 积分，当前剩余 ${userPoints} 积分。请先签到或提交评价赚取积分。`);
      return false;
    }

    const newBalance = userPoints - amount;
    setUserPoints(newBalance);
    setTransactions((prev) => [
      {
        id: `tx_${Date.now()}`,
        action: reason,
        amount: -amount,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        balanceAfter: newBalance,
      },
      ...prev,
    ]);
    return true;
  };

  // Daily Check-in Handler
  const handleCheckIn = () => {
    if (hasCheckedInToday) return;
    const added = 5;
    const newBalance = userPoints + added;
    setUserPoints(newBalance);
    setHasCheckedInToday(true);
    setTransactions((prev) => [
      {
        id: `tx_${Date.now()}`,
        action: '每日签到奖励 (PRD 5.0)',
        amount: added,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        balanceAfter: newBalance,
      },
      ...prev,
    ]);
  };

  // Submit Review Handler
  const handleSubmitReview = (newReviewData: Omit<Review, 'id' | 'createdAt' | 'likes'>) => {
    const newReview: Review = {
      ...newReviewData,
      id: `rev_${Date.now()}`,
      createdAt: '刚刚',
      likes: 1,
    };

    setReviews((prev) => [newReview, ...prev]);

    // Update teacher review count
    setTeachers((prev) =>
      prev.map((t) => {
        if (t.id === newReview.teacherId) {
          return {
            ...t,
            reviewCount: t.reviewCount + 1,
          };
        }
        return t;
      })
    );

    // Award +20 points for review submission (PRD 5.0)
    const bonus = 20;
    const newBalance = userPoints + bonus;
    setUserPoints(newBalance);
    setTransactions((prev) => [
      {
        id: `tx_${Date.now()}`,
        action: `撰写教师评价通过审核 (+${bonus}分)`,
        amount: bonus,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        balanceAfter: newBalance,
      },
      ...prev,
    ]);
  };

  // Like review
  const handleLikeReview = (reviewId: string) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === reviewId ? { ...r, likes: r.likes + 1 } : r))
    );
  };

  // Lock background scroll when any modal is open to prevent scrollbar flicker & layout jump
  const isAnyModalOpen = Boolean(
    selectedTeacher ||
    isAiModalOpen ||
    isReviewModalOpen ||
    isPointsModalOpen ||
    isCollegesModalOpen ||
    isExperienceModalOpen
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyModalOpen]);

  return (
    <div className="min-h-screen bg-slate-100/90 text-gray-900 flex flex-col items-center">
      
      {/* 0. Top Mode Switcher Bar (Quick view toggle for desktop developers/users) */}
      <div className="w-full bg-slate-200/90 border-b border-slate-300/80 px-4 py-1.5 flex items-center justify-between text-xs text-slate-600 z-40">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">西南交大评教系统</span>
          <span className="text-slate-400 hidden sm:inline">|</span>
          <span className="text-slate-500 hidden sm:inline">已独立分离【手机夸克模式】与【电脑宽屏模式】</span>
        </div>

        <div className="flex items-center gap-1 bg-white/80 p-0.5 rounded-lg border border-slate-300">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setViewMode('mobile')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'mobile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>手机夸克模式</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setViewMode('desktop')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'desktop'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>电脑宽屏模式</span>
          </motion.button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. MOBILE MODE: Pure, 100% faithful Quark mobile layout   */}
      {/* ========================================================= */}
      {viewMode === 'mobile' && (
        <div className="w-full flex justify-center py-0 sm:py-4">
          <div className="w-full max-w-[430px] min-h-screen sm:min-h-[92vh] bg-white sm:rounded-3xl sm:shadow-[0_20px_60px_rgba(0,0,0,0.12)] sm:border sm:border-gray-200/80 relative overflow-x-hidden flex flex-col justify-between">
            
            {/* Mobile Tab Views with Smooth Fade Transition (Zero height jump) */}
            <div className="flex-1 w-full relative overflow-x-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="w-full"
                >
                  {currentTab === 'home' && (
                    <MobileQuarkHome
                      userPoints={userPoints}
                      onOpenSearch={(query) => {
                        setInitialTeacherSearch(query || '');
                        setCurrentTab('search');
                      }}
                      onOpenRecommend={(course) => {
                        setCurrentTab('recommend');
                      }}
                      onOpenAiChat={(prompt) => {
                        setAiInitialPrompt(prompt || '');
                        setIsAiModalOpen(true);
                      }}
                      onOpenPoints={() => setIsPointsModalOpen(true)}
                      onOpenReview={() => {
                        setReviewTargetTeacher(null);
                        setIsReviewModalOpen(true);
                      }}
                    />
                  )}

                  {currentTab === 'search' && (
                    <MobileTeacherSearch
                      teachers={teachers}
                      initialSearch={initialTeacherSearch}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onOpenReview={(teacher) => {
                        setReviewTargetTeacher(teacher || null);
                        setIsReviewModalOpen(true);
                      }}
                    />
                  )}

                  {currentTab === 'services' && (
                    <MobileServicesView
                      teachers={teachers}
                      userPoints={userPoints}
                      onOpenSearch={(query) => {
                        setInitialTeacherSearch(query || '');
                        setCurrentTab('search');
                      }}
                      onOpenRecommend={(course) => {
                        setCurrentTab('recommend');
                      }}
                      onOpenAiChat={(prompt) => {
                        setAiInitialPrompt(prompt || '');
                        setIsAiModalOpen(true);
                      }}
                      onOpenReview={(teacher) => {
                        setReviewTargetTeacher(teacher || null);
                        setIsReviewModalOpen(true);
                      }}
                      onOpenPoints={() => setIsPointsModalOpen(true)}
                      onOpenCollegeList={() => setIsCollegesModalOpen(true)}
                      onOpenExperienceModal={(tab) => {
                        setExperienceTab(tab || 'guides');
                        setIsExperienceModalOpen(true);
                      }}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                    />
                  )}

                  {currentTab === 'recommend' && (
                    <div className="pt-3 px-3 pb-24">
                      <CourseRecommend
                        teachers={teachers}
                        userPoints={userPoints}
                        onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                        onDeductPoints={handleDeductPoints}
                      />
                    </div>
                  )}

                  {currentTab === 'profile' && (
                    <MobileUserProfile
                      userPoints={userPoints}
                      transactions={transactions}
                      hasCheckedInToday={hasCheckedInToday}
                      onCheckIn={handleCheckIn}
                      onOpenPointsModal={() => setIsPointsModalOpen(true)}
                      onOpenReview={() => {
                        setReviewTargetTeacher(null);
                        setIsReviewModalOpen(true);
                      }}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      myReviews={reviews.filter((r) => r.authorNickname === '犀浦小火车')}
                      teachers={teachers}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Quark Mobile Bottom Navigation Dock */}
            <BottomNav
              currentTab={currentTab}
              onTabChange={(tab) => setCurrentTab(tab)}
              userPoints={userPoints}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. DESKTOP MODE: Spacious, full-featured wide screen view */}
      {/* ========================================================= */}
      {viewMode === 'desktop' && (
        <div className="w-full flex flex-col items-center">
          {/* Desktop Navigation Header */}
          <header className="w-full bg-white/95 backdrop-blur-md border-b border-gray-200/80 sticky top-0 z-30 shadow-2xs">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
              {/* Logo */}
              <div 
                onClick={() => setCurrentTab('home')}
                className="flex items-center gap-3 cursor-pointer select-none group"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs shadow-indigo-200 group-hover:scale-105 transition-transform">
                  交
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-base tracking-tight text-gray-950 font-sans">
                      交大评教
                    </span>
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                      Agent
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 -mt-0.5">
                    西南交通大学专属教师评价 · 校园智能助手
                  </p>
                </div>
              </div>

              {/* Desktop Nav Items */}
              <nav className="flex items-center gap-1.5 bg-gray-100/90 p-1.5 rounded-2xl border border-gray-200/60">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('home')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'home'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>首页推荐</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('search')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'search'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>教师库 (免费)</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('recommend')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'recommend'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>智能选课</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('profile')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
                    currentTab === 'profile'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>个人中心</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500 text-white font-extrabold ml-0.5">
                    {userPoints}
                  </span>
                </motion.button>
              </nav>

              {/* Points & AI Quick Buttons */}
              <div className="flex items-center gap-2.5">
                <motion.div 
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setIsPointsModalOpen(true)}
                  className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3.5 py-1.5 rounded-full border border-amber-200/80 cursor-pointer transition-all shadow-2xs"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-bold text-xs">{userPoints}</span>
                  <span className="text-[10px] text-amber-700">积分中心</span>
                </motion.div>

                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setIsAiModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 text-xs font-semibold transition-all shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AI 智能问答</span>
                </motion.button>
              </div>
            </div>
          </header>

          {/* Desktop Views with AnimatePresence */}
          <main className="w-full max-w-6xl mx-auto px-6 py-4 overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {currentTab === 'home' && (
                  <DesktopQuarkHome
                    teachers={teachers}
                    userPoints={userPoints}
                    onOpenSearch={(query) => {
                      setInitialTeacherSearch(query || '');
                      setCurrentTab('search');
                    }}
                    onOpenRecommend={(course) => {
                      setCurrentTab('recommend');
                    }}
                    onOpenAiChat={(prompt) => {
                      setAiInitialPrompt(prompt || '');
                      setIsAiModalOpen(true);
                    }}
                    onOpenReview={(teacher) => {
                      setReviewTargetTeacher(teacher || null);
                      setIsReviewModalOpen(true);
                    }}
                    onOpenPoints={() => setIsPointsModalOpen(true)}
                    onOpenCollegeList={() => setIsCollegesModalOpen(true)}
                    onOpenExperienceModal={(tab) => {
                      setExperienceTab(tab || 'guides');
                      setIsExperienceModalOpen(true);
                    }}
                    onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                  />
                )}

                {currentTab === 'search' && (
                  <div className="pt-2">
                    <DesktopTeacherSearch
                      teachers={teachers}
                      initialSearch={initialTeacherSearch}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onOpenReview={(teacher) => {
                        setReviewTargetTeacher(teacher || null);
                        setIsReviewModalOpen(true);
                      }}
                    />
                  </div>
                )}

                {currentTab === 'recommend' && (
                  <div className="pt-2">
                    <CourseRecommend
                      teachers={teachers}
                      userPoints={userPoints}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onDeductPoints={handleDeductPoints}
                    />
                  </div>
                )}

                {currentTab === 'profile' && (
                  <DesktopUserProfile
                    userPoints={userPoints}
                    transactions={transactions}
                    hasCheckedInToday={hasCheckedInToday}
                    onCheckIn={handleCheckIn}
                    onOpenPointsModal={() => setIsPointsModalOpen(true)}
                    onOpenReview={() => {
                      setReviewTargetTeacher(null);
                      setIsReviewModalOpen(true);
                    }}
                    onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                    myReviews={reviews.filter((r) => r.authorNickname === '犀浦小火车')}
                    teachers={teachers}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      )}

      {/* ========================================================= */}
      {/* Shared Modals                                             */}
      {/* ========================================================= */}
      
      {/* 1. 教师主页 / 详细六维评测 Modal */}
      <AnimatePresence>
        {selectedTeacher && (
          <TeacherDetailModal
            teacher={selectedTeacher}
            reviews={reviews}
            onClose={() => setSelectedTeacher(null)}
            onOpenReview={(t) => {
              setReviewTargetTeacher(t);
              setIsReviewModalOpen(true);
            }}
            onLikeReview={handleLikeReview}
          />
        )}
      </AnimatePresence>

      {/* 2. AI 问答 / Agent 问答 Modal (PRD 3.2 & 6) */}
      <AnimatePresence>
        {isAiModalOpen && (
          <AiAssistantModal
            isOpen={isAiModalOpen}
            onClose={() => setIsAiModalOpen(false)}
            teachers={teachers}
            userPoints={userPoints}
            onDeductPoints={handleDeductPoints}
            onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
            initialPrompt={aiInitialPrompt}
          />
        )}
      </AnimatePresence>

      {/* 3. 评价打分 Modal (PRD 4 & 8) */}
      <AnimatePresence>
        {isReviewModalOpen && (
          <ReviewModal
            isOpen={isReviewModalOpen}
            onClose={() => setIsReviewModalOpen(false)}
            teachers={teachers}
            preselectedTeacher={reviewTargetTeacher}
            onSubmitReview={handleSubmitReview}
          />
        )}
      </AnimatePresence>

      {/* 4. 积分中心 Modal (PRD 5) */}
      <AnimatePresence>
        {isPointsModalOpen && (
          <UserPointsModal
            isOpen={isPointsModalOpen}
            onClose={() => setIsPointsModalOpen(false)}
            points={userPoints}
            transactions={transactions}
            hasCheckedInToday={hasCheckedInToday}
            onCheckIn={handleCheckIn}
            onOpenReview={() => {
              setReviewTargetTeacher(null);
              setIsReviewModalOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* 5. 院系库 Modal */}
      <AnimatePresence>
        {isCollegesModalOpen && (
          <CollegeListModal
            isOpen={isCollegesModalOpen}
            onClose={() => setIsCollegesModalOpen(false)}
            onSelectCollege={(college) => {
              setInitialTeacherSearch('');
              setCurrentTab('search');
            }}
          />
        )}
      </AnimatePresence>

      {/* 6. 经验攻略 / 教务通知 / 历史迁移说明 Modal (PRD 3.4 & 4.1) */}
      <AnimatePresence>
        {isExperienceModalOpen && (
          <ExperienceGuideModal
            isOpen={isExperienceModalOpen}
            onClose={() => setIsExperienceModalOpen(false)}
            defaultTab={experienceTab}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
