import React from 'react';
import { UserPointTransaction, Review, Teacher } from '../../types';
import { Coins, MessageSquare, Info, History, CheckCircle2, ArrowUpRight, Database, LogIn, LogOut, Lock, User, Sparkles } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';

interface MobileUserProfileProps {
  currentUser: any | null;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onLogout: () => void;
  userPoints: number;
  transactions: UserPointTransaction[];
  hasCheckedInToday: boolean;
  onCheckIn: () => void;
  onOpenPointsModal: () => void;
  onOpenReview: () => void;
  onSelectTeacher?: (teacher: Teacher) => void;
  myReviews: Review[];
  teachers: Teacher[];
}

export const MobileUserProfile: React.FC<MobileUserProfileProps> = ({
  currentUser,
  onOpenAuth,
  onLogout,
  userPoints,
  transactions,
  hasCheckedInToday,
  onCheckIn,
  onOpenPointsModal,
  onOpenReview,
  onSelectTeacher,
  myReviews,
  teachers,
}) => {
  const isLoggedIn = Boolean(currentUser);
  const userNickname = currentUser?.user_metadata?.nickname || '西南交大学子';
  const userCampus = currentUser?.user_metadata?.campus || '犀浦校区';

  return (
    <div id="mobile-user-profile" className="w-full px-4 pt-3 pb-24 space-y-4">
      {/* 1. Profile Header Card */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-xs ${
              isLoggedIn ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-gray-100 text-gray-400'
            }`}>
              {isLoggedIn ? (userNickname.slice(0, 1) || '交') : <User className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">
                  {isLoggedIn ? userNickname : '未登录学子'}
                </h3>
                {isLoggedIn ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    评教积极分子
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                    访客状态
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[11px] text-gray-500">
                  {isLoggedIn ? `${userCampus} · ${currentUser?.email}` : '登录后同步个人积分与评价档案'}
                </p>
                {isSupabaseConfigured && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    <Database className="w-2.5 h-2.5 text-emerald-600" />
                    Supabase
                  </span>
                )}
              </div>
            </div>
          </div>

          {isLoggedIn ? (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onOpenAuth('login')}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-xs hover:bg-indigo-700 transition-all flex items-center gap-1"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>登录</span>
            </button>
          )}
        </div>

        {/* Points Banner */}
        {isLoggedIn ? (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between shadow-md shadow-amber-500/10">
            <div>
              <span className="text-[10px] text-amber-100 font-medium">当前有效积分</span>
              <div className="text-2xl font-extrabold flex items-baseline gap-1 mt-0.5">
                <span>{userPoints}</span>
                <span className="text-xs font-normal text-amber-100">分</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onCheckIn}
                disabled={hasCheckedInToday}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                  hasCheckedInToday
                    ? 'bg-white/20 text-white cursor-not-allowed'
                    : 'bg-white text-orange-600 hover:bg-orange-50'
                }`}
              >
                {hasCheckedInToday ? '今日已签' : '签到 +5分'}
              </button>
              <button
                onClick={onOpenPointsModal}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-black/20 text-white"
              >
                明细
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800">登录开启积分激励与特权</p>
                <p className="text-[10px] text-gray-500">新人注册送 100 积分 · 撰写评价 +20 分</p>
              </div>
            </div>
            <button
              onClick={() => onOpenAuth('register')}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs hover:bg-indigo-700 flex items-center gap-1 shrink-0"
            >
              <Sparkles className="w-3 h-3" />
              <span>注册</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Quick Action Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            if (!isLoggedIn) {
              onOpenAuth('login');
            } else {
              onOpenReview();
            }
          }}
          className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-2xs active:scale-95 transition-all text-left space-y-1 group"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-gray-900 block group-hover:text-emerald-600">
            {isLoggedIn ? '评价打分 (+20分)' : '登录后写评价'}
          </span>
          <span className="text-[10px] text-gray-400 block">
            {isLoggedIn ? '六维标准打分，可只打分' : '登录后参与评教与加分'}
          </span>
        </button>

        <button
          onClick={() => {
            if (!isLoggedIn) {
              onOpenAuth('login');
            } else {
              onOpenPointsModal();
            }
          }}
          className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-2xs active:scale-95 transition-all text-left space-y-1 group"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Coins className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-gray-900 block group-hover:text-amber-600">
            积分规则 (PRD 5)
          </span>
          <span className="text-[10px] text-gray-400 block">永久有效 · 问答扣2分</span>
        </button>
      </div>

      {/* 3. My Submitted Reviews */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-gray-900">我的评价记录</h4>
          {isLoggedIn && <span className="text-[11px] text-gray-400">{myReviews.length} 条</span>}
        </div>

        {!isLoggedIn ? (
          <div className="py-6 px-4 text-center bg-gray-50/50 rounded-2xl border border-gray-100 space-y-2">
            <p className="text-xs text-gray-600 font-medium">登录后可查看您提交过的教师评价与审核进度</p>
            <button
              onClick={() => onOpenAuth('login')}
              className="px-4 py-1.5 bg-white border border-gray-200 hover:border-indigo-200 text-indigo-600 text-xs font-bold rounded-xl shadow-2xs"
            >
              立即登录账号
            </button>
          </div>
        ) : myReviews.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-xs">
            您尚未提交过教师评价。写一条评价并通过审核，即可获赠 20 积分！
          </div>
        ) : (
          <div className="space-y-2.5">
            {myReviews.map((rev) => {
              const teacher = teachers.find((t) => t.id === rev.teacherId);
              return (
                <div key={rev.id} className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">
                      {teacher?.name || '任课老师'} - {rev.courseName}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700">
                      已过审 (+20分)
                    </span>
                  </div>
                  {rev.comment && <p className="text-gray-600 text-[11px] line-clamp-2">“{rev.comment}”</p>}
                  {teacher && onSelectTeacher && (
                    <button
                      onClick={() => onSelectTeacher(teacher)}
                      className="text-indigo-600 text-[10px] hover:underline flex items-center gap-0.5"
                    >
                      查看该教师主页 <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. PRD Background Card */}
      <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 text-[11px] text-gray-500 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-gray-700">
          <Info className="w-3.5 h-3.5 text-indigo-600" />
          <span>西南交大教师评价翻新说明</span>
        </div>
        <p className="leading-relaxed">
          根据 PRD：原公益打分网站自 2024 年起停更两年。本项目定位为「西南交通大学专属 Agent」，包含智能选课推荐、AI 自然语言问答、积分激励机制。
        </p>
        <p className="text-[10px] text-gray-400">核心团队：2人（产品+技术协同）· 草案 v1</p>
      </div>
    </div>
  );
};
