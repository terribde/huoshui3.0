/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Teacher, Review, UserPointTransaction } from './types';
import { INITIAL_TEACHERS, INITIAL_REVIEWS } from './data/mockTeachers';
import { supabaseService } from './services/supabaseService';
import { isSupabaseConfigured } from './lib/supabase';

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
import { AuthModal } from './components/AuthModal';

import { 
  BookOpen, 
  Search, 
  Sliders, 
  User, 
  Coins, 
  Sparkles,
  LogIn,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Current logged in user via Supabase Auth
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  // Core application states
  const [teachers, setTeachers] = useState<Teacher[]>(INITIAL_TEACHERS);
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [hasCheckedInToday, setHasCheckedInToday] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<UserPointTransaction[]>([]);

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

  // Automatic Device Detection: Accurately identifies mobile phone vs computer/desktop
  const [deviceInfo, setDeviceInfo] = useState<{ isMobile: boolean; screenWidth: number }>(() => {
    if (typeof window === 'undefined') return { isMobile: false, screenWidth: 1200 };
    const userAgent = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isSmallScreen = window.innerWidth < 768;
    return {
      isMobile: isMobileUA || isSmallScreen,
      screenWidth: window.innerWidth,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const userAgent = navigator.userAgent || '';
      const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isSmallScreen = window.innerWidth < 768;
      setDeviceInfo({
        isMobile: isMobileUA || isSmallScreen,
        screenWidth: window.innerWidth,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync Supabase Auth & User Data
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Load initial teachers from Supabase
    supabaseService.getTeachers().then((remoteTeachers) => {
      if (remoteTeachers && remoteTeachers.length > 0) {
        setTeachers(remoteTeachers);
      }
    });

    // Load reviews from Supabase
    supabaseService.getReviews().then((remoteReviews) => {
      if (remoteReviews && remoteReviews.length > 0) {
        setReviews(remoteReviews);
      }
    });

    // Check active auth session
    supabaseService.getCurrentUser().then((user) => {
      setCurrentUser(user);
      if (user) {
        loadUserPointsData(user.id);
      } else {
        setUserPoints(0);
        setTransactions([]);
      }
    });

    // Subscribe to auth state changes
    const { data: authListener } = supabaseService.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      setCurrentUser(user);
      if (user) {
        loadUserPointsData(user.id);
      } else {
        setUserPoints(0);
        setTransactions([]);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const loadUserPointsData = async (userId: string) => {
    const pointData = await supabaseService.getUserPoints(userId);
    if (pointData) {
      setUserPoints(pointData.points);
      setTransactions(pointData.transactions);
    } else {
      setUserPoints(100);
      setTransactions([
        {
          id: 'tx_init_' + Date.now(),
          action: '新用户注册欢迎礼 (PRD 5.0)',
          amount: 100,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          balanceAfter: 100,
        },
      ]);
    }
  };

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleLogout = async () => {
    await supabaseService.signOut();
    setCurrentUser(null);
    setUserPoints(0);
    setTransactions([]);
    setHasCheckedInToday(false);
  };

  const viewMode: 'mobile' | 'desktop' = deviceInfo.isMobile ? 'mobile' : 'desktop';

  // Points Deduction Handler (PRD 5.0)
  const handleDeductPoints = (amount: number, reason: string): boolean => {
    if (!currentUser) {
      handleOpenAuth('login');
      return false;
    }

    if (userPoints < amount) {
      alert(`积分不足！本次操作需消耗 ${amount} 积分，当前剩余 ${userPoints} 积分。请先每日签到或写评价赚取积分。`);
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

    if (isSupabaseConfigured) {
      supabaseService.savePointTransaction(currentUser.id, reason, -amount, newBalance);
    }
    return true;
  };

  // Daily Check-in Handler
  const handleCheckIn = async () => {
    if (!currentUser) {
      handleOpenAuth('login');
      return;
    }

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

    if (isSupabaseConfigured) {
      await supabaseService.savePointTransaction(currentUser.id, '每日签到奖励 (PRD 5.0)', added, newBalance);
    }
  };

  // Guarded Review Open: Requires User Login!
  const handleOpenReview = (teacher?: Teacher | null) => {
    if (!currentUser) {
      handleOpenAuth('login');
      return;
    }
    setReviewTargetTeacher(teacher || null);
    setIsReviewModalOpen(true);
  };

  // Submit Review Handler
  const handleSubmitReview = (newReviewData: Omit<Review, 'id' | 'createdAt' | 'likes'>) => {
    if (!currentUser) {
      handleOpenAuth('login');
      return;
    }

    const nickname = currentUser.user_metadata?.nickname || '西南交大学子';
    const newReview: Review = {
      ...newReviewData,
      authorNickname: nickname,
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

    // Persist to Supabase if configured
    if (isSupabaseConfigured) {
      supabaseService.submitReview(newReview);
      supabaseService.savePointTransaction(currentUser.id, `撰写教师评价通过审核 (+${bonus}分)`, bonus, newBalance);
    }
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
    isExperienceModalOpen ||
    isAuthModalOpen
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

  // Filter reviews written by current user
  const myUserNickname = currentUser?.user_metadata?.nickname;
  const myReviews = currentUser
    ? reviews.filter((r) => myUserNickname && r.authorNickname === myUserNickname)
    : [];

  return (
    <div className="min-h-screen bg-white sm:bg-slate-100/90 text-gray-900 flex flex-col items-center">
      {/* ========================================================= */}
      {/* 1. MOBILE MODE: Pure, 100% faithful Quark mobile layout   */}
      {/* ========================================================= */}
      {viewMode === 'mobile' && (
        <div className="w-full flex justify-center py-0 sm:py-4">
          <div className="w-full max-w-[430px] min-h-screen sm:min-h-[92vh] bg-white sm:rounded-3xl sm:shadow-[0_20px_60px_rgba(0,0,0,0.12)] sm:border sm:border-gray-200/80 relative overflow-x-hidden flex flex-col justify-between">
            
            {/* Mobile Tab Views with Smooth Fade Transition */}
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
                      currentUser={currentUser}
                      onOpenAuth={handleOpenAuth}
                      userPoints={userPoints}
                      onOpenSearch={(query) => {
                        setInitialTeacherSearch(query || '');
                        setCurrentTab('search');
                      }}
                      onOpenRecommend={() => {
                        setCurrentTab('recommend');
                      }}
                      onOpenAiChat={(prompt) => {
                        setAiInitialPrompt(prompt || '');
                        setIsAiModalOpen(true);
                      }}
                      onOpenPoints={() => {
                        if (!currentUser) {
                          handleOpenAuth('login');
                        } else {
                          setIsPointsModalOpen(true);
                        }
                      }}
                      onOpenReview={() => handleOpenReview()}
                    />
                  )}

                  {currentTab === 'search' && (
                    <MobileTeacherSearch
                      teachers={teachers}
                      initialSearch={initialTeacherSearch}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onOpenReview={(teacher) => handleOpenReview(teacher)}
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
                      onOpenRecommend={() => {
                        setCurrentTab('recommend');
                      }}
                      onOpenAiChat={(prompt) => {
                        setAiInitialPrompt(prompt || '');
                        setIsAiModalOpen(true);
                      }}
                      onOpenReview={(teacher) => handleOpenReview(teacher)}
                      onOpenPoints={() => {
                        if (!currentUser) {
                          handleOpenAuth('login');
                        } else {
                          setIsPointsModalOpen(true);
                        }
                      }}
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
                      currentUser={currentUser}
                      onOpenAuth={handleOpenAuth}
                      onLogout={handleLogout}
                      userPoints={userPoints}
                      transactions={transactions}
                      hasCheckedInToday={hasCheckedInToday}
                      onCheckIn={handleCheckIn}
                      onOpenPointsModal={() => {
                        if (!currentUser) {
                          handleOpenAuth('login');
                        } else {
                          setIsPointsModalOpen(true);
                        }
                      }}
                      onOpenReview={() => handleOpenReview()}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      myReviews={myReviews}
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
                  {currentUser && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500 text-white font-extrabold ml-0.5">
                      {userPoints}
                    </span>
                  )}
                </motion.button>
              </nav>

              {/* Auth, Points & AI Quick Buttons */}
              <div className="flex items-center gap-2.5">
                {currentUser ? (
                  <>
                    <motion.div 
                      whileTap={{ scale: 0.93 }}
                      onClick={() => setIsPointsModalOpen(true)}
                      className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200/80 cursor-pointer transition-all shadow-2xs"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-bold text-xs">{userPoints}</span>
                      <span className="text-[10px] text-amber-700">分</span>
                    </motion.div>

                    <div className="flex items-center gap-2 pl-1 border-l border-gray-200">
                      <div 
                        onClick={() => setCurrentTab('profile')}
                        className="flex items-center gap-1.5 cursor-pointer p-1 rounded-xl hover:bg-gray-100 transition-colors"
                        title="查看个人中心"
                      >
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                          {(currentUser.user_metadata?.nickname || '交').slice(0, 1)}
                        </div>
                        <span className="text-xs font-bold text-gray-800 max-w-[80px] truncate">
                          {currentUser.user_metadata?.nickname || '学子'}
                        </span>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="退出登录"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenAuth('login')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition-all shadow-2xs"
                    >
                      <LogIn className="w-3.5 h-3.5 text-gray-500" />
                      <span>登录</span>
                    </button>
                    <button
                      onClick={() => handleOpenAuth('register')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>注册 (+100积分)</span>
                    </button>
                  </div>
                )}

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
                    currentUser={currentUser}
                    onOpenAuth={handleOpenAuth}
                    teachers={teachers}
                    userPoints={userPoints}
                    onOpenSearch={(query) => {
                      setInitialTeacherSearch(query || '');
                      setCurrentTab('search');
                    }}
                    onOpenRecommend={() => {
                      setCurrentTab('recommend');
                    }}
                    onOpenAiChat={(prompt) => {
                      setAiInitialPrompt(prompt || '');
                      setIsAiModalOpen(true);
                    }}
                    onOpenReview={(teacher) => handleOpenReview(teacher)}
                    onOpenPoints={() => {
                      if (!currentUser) {
                        handleOpenAuth('login');
                      } else {
                        setIsPointsModalOpen(true);
                      }
                    }}
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
                      onOpenReview={(teacher) => handleOpenReview(teacher)}
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
                    currentUser={currentUser}
                    onOpenAuth={handleOpenAuth}
                    onLogout={handleLogout}
                    userPoints={userPoints}
                    transactions={transactions}
                    hasCheckedInToday={hasCheckedInToday}
                    onCheckIn={handleCheckIn}
                    onOpenPointsModal={() => {
                      if (!currentUser) {
                        handleOpenAuth('login');
                      } else {
                        setIsPointsModalOpen(true);
                      }
                    }}
                    onOpenReview={() => handleOpenReview()}
                    onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                    myReviews={myReviews}
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
            onOpenReview={(t) => handleOpenReview(t)}
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
            onOpenReview={() => handleOpenReview()}
          />
        )}
      </AnimatePresence>

      {/* 5. 院系库 Modal */}
      <AnimatePresence>
        {isCollegesModalOpen && (
          <CollegeListModal
            isOpen={isCollegesModalOpen}
            onClose={() => setIsCollegesModalOpen(false)}
            onSelectCollege={(_college) => {
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

      {/* 7. Supabase 用户认证 Modal (登录 / 注册) */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            initialMode={authModalMode}
            onAuthSuccess={(user) => {
              setCurrentUser(user);
              setIsAuthModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
