import React, { useState, useEffect } from 'react';
import { UserPointTransaction, Review, Teacher } from '../../types';
import { Coins, MessageSquare, Info, History, ArrowUpRight, CheckCircle2, ShieldAlert, Sparkles, User, Database, LogIn, LogOut, Lock, Clock, XCircle, ShieldCheck, Trash2, Edit3, AlertCircle, RotateCw } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';

interface DesktopUserProfileProps {
  currentUser: any | null;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onLogout: () => void;
  userPoints: number;
  transactions: UserPointTransaction[];
  hasCheckedInToday: boolean;
  isCheckingIn?: boolean;
  isCheckinStatusLoading?: boolean;
  onCheckIn: () => void;
  onOpenPointsModal: () => void;
  onOpenReview: () => void;
  onSelectTeacher?: (teacher: Teacher) => void;
  myReviews: Review[];
  teachers: Teacher[];
  onOpenAdminAudit?: () => void;
  onDeleteReview?: (reviewId: string) => void;
  onRefreshReviews?: () => Promise<void>;
  isUserAdmin?: boolean;
}

export const DesktopUserProfile: React.FC<DesktopUserProfileProps> = ({
  currentUser,
  onOpenAuth,
  onLogout,
  userPoints,
  transactions,
  hasCheckedInToday,
  isCheckingIn = false,
  isCheckinStatusLoading = false,
  onCheckIn,
  onOpenPointsModal,
  onOpenReview,
  onSelectTeacher,
  myReviews,
  teachers,
  onOpenAdminAudit,
  onDeleteReview,
  onRefreshReviews,
  isUserAdmin = false,
}) => {
  const isLoggedIn = Boolean(currentUser);
  const userNickname = currentUser?.user_metadata?.nickname || '西南交大学子';
  const userCampus = currentUser?.user_metadata?.campus || '犀浦校区';

  // Review status filter tab
  const [reviewFilterTab, setReviewFilterTab] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto refresh reviews when profile opens
  useEffect(() => {
    if (onRefreshReviews) {
      onRefreshReviews();
    }
  }, [onRefreshReviews]);

  const pendingCount = myReviews.filter((r) => r.status === 'pending').length;
  const approvedCount = myReviews.filter((r) => r.status === 'approved').length;
  const rejectedCount = myReviews.filter((r) => r.status === 'rejected').length;

  const filteredMyReviews = myReviews.filter((r) => {
    if (reviewFilterTab === 'all') return true;
    return r.status === reviewFilterTab;
  });

  return (
    <div id="desktop-user-profile" className="w-full max-w-5xl mx-auto pt-2 pb-16 space-y-6">
      {/* 2-Column Grid Layout */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Left Column (5 Cols): Identity, Wallet & Actions */}
        <div className="col-span-5 space-y-5">
          {/* Identity Card */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs shrink-0 ${
                  isLoggedIn ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-gray-100 text-gray-400'
                }`}>
                  {isLoggedIn ? (userNickname.slice(0, 1) || '交') : <User className="w-7 h-7" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-950">
                      {isLoggedIn ? userNickname : '未登录学子'}
                    </h3>
                    {isLoggedIn ? (
                      isUserAdmin ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white flex items-center gap-1 shadow-2xs">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                          审核管理员
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          评教积极分子
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                        访客身份
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-500">
                      {isLoggedIn ? `${userCampus} · ${currentUser?.email}` : '登录后同步个人评教积分与记录'}
                    </p>
                    {isSupabaseConfigured && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <Database className="w-3 h-3 text-emerald-600" />
                        Supabase 云端直连
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
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>登录</span>
                </button>
              )}
            </div>

            {/* Admin Audit Quick Entrance */}
            {onOpenAdminAudit && (
              <button
                onClick={onOpenAdminAudit}
                className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-100 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>评教审核管理后台</span>
                  {pendingCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-slate-900 rounded-full text-[10px] font-bold">
                      {pendingCount}待审
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-200">
                  进入后台 ➔
                </span>
              </button>
            )}

            {/* Big Points Wallet Banner */}
            {isLoggedIn ? (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-amber-100 font-medium">当前有效积分 (PRD 5.0)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                    永久有效
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black tracking-tight">{userPoints}</span>
                  <span className="text-sm font-medium text-amber-100">积分</span>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-white/20">
                  <button
                    onClick={onCheckIn}
                    disabled={hasCheckedInToday || isCheckingIn || isCheckinStatusLoading}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                      hasCheckedInToday
                        ? 'bg-white/20 text-white cursor-not-allowed opacity-90'
                        : isCheckingIn || isCheckinStatusLoading
                        ? 'bg-white/40 text-white cursor-wait animate-pulse'
                        : 'bg-white text-orange-600 hover:bg-orange-50 active:scale-98 cursor-pointer'
                    }`}
                  >
                    {isCheckinStatusLoading ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>同步中...</span>
                      </>
                    ) : isCheckingIn ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>签到中...</span>
                      </>
                    ) : hasCheckedInToday ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>今日已完成签到</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>每日签到 (+5分)</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={onOpenPointsModal}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-black/20 hover:bg-black/30 text-white transition-colors"
                  >
                    明细
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-gray-50 border border-dashed border-gray-200 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">登录开启学生积分与全部特权</h4>
                    <p className="text-xs text-gray-500 mt-0.5">新人注册即赠 100 初始积分 · 评价过审再领 20 分</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onOpenAuth('register')}
                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>立即注册 (赠送 100 积分)</span>
                  </button>
                  <button
                    onClick={() => onOpenAuth('login')}
                    className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold transition-all"
                  >
                    已有账号登录
                  </button>
                </div>
              </div>
            )}

            {/* Quick Action Grid */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => {
                  if (!isLoggedIn) {
                    onOpenAuth('login');
                  } else {
                    onOpenReview();
                  }
                }}
                className="p-3.5 bg-gray-50/80 hover:bg-emerald-50/50 rounded-2xl border border-gray-100 hover:border-emerald-200 transition-all text-left space-y-1.5 group"
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-gray-900 group-hover:text-emerald-700 block">
                  {isLoggedIn ? '评价打分 (+20分)' : '登录后写评价'}
                </span>
                <span className="text-[10px] text-gray-500 block leading-tight">
                  {isLoggedIn ? 'PRD 标准六维，可不写文字' : '登录后参与评教并积累积分'}
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
                className="p-3.5 bg-gray-50/80 hover:bg-amber-50/50 rounded-2xl border border-gray-100 hover:border-amber-200 transition-all text-left space-y-1.5 group"
              >
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Coins className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-gray-900 group-hover:text-amber-700 block">
                  积分规则与说明
                </span>
                <span className="text-[10px] text-gray-500 block leading-tight">
                  每日签到 +5 分 · 问答消耗 2 分
                </span>
              </button>
            </div>
          </div>

          {/* Identity Protection Assurance */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-2xs space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-gray-800">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              <span>学生评教绝对隐私保护</span>
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              根据系统匿名设计规范：所有发表的打分与评价，对外一律展示为「交大学子」。系统绝不记录或绑定您的真实学号与个人身份信息。
            </p>
          </div>
        </div>

        {/* Right Column (7 Cols): Records & Trans */}
        <div className="col-span-7 space-y-5">
          {/* Submitted Reviews Card */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-gray-900">我提交过的课程评价</h4>
                {onRefreshReviews && (
                  <button
                    onClick={async () => {
                      setIsRefreshing(true);
                      try {
                        await onRefreshReviews();
                      } finally {
                        setTimeout(() => setIsRefreshing(false), 400);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 text-[11px] font-medium transition-all"
                    title="重新从服务器同步最新审核状态"
                  >
                    <RotateCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
                    <span>{isRefreshing ? '同步中...' : '同步状态'}</span>
                  </button>
                )}
              </div>
              {isLoggedIn && (
                <span className="text-xs text-gray-400 font-medium">
                  共计 {myReviews.length} 条记录
                </span>
              )}
            </div>

            {/* Status Filter Tabs */}
            {isLoggedIn && myReviews.length > 0 && (
              <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-2xl w-fit">
                <button
                  onClick={() => setReviewFilterTab('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    reviewFilterTab === 'all'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  全部 ({myReviews.length})
                </button>
                <button
                  onClick={() => setReviewFilterTab('approved')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    reviewFilterTab === 'approved'
                      ? 'bg-white text-emerald-600 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  已通过 ({approvedCount})
                </button>
                <button
                  onClick={() => setReviewFilterTab('pending')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    reviewFilterTab === 'pending'
                      ? 'bg-white text-amber-600 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Clock className="w-3 h-3 text-amber-500" />
                  审核中 ({pendingCount})
                </button>
                <button
                  onClick={() => setReviewFilterTab('rejected')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    reviewFilterTab === 'rejected'
                      ? 'bg-white text-rose-600 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <XCircle className="w-3 h-3 text-rose-500" />
                  已驳回 ({rejectedCount})
                </button>
              </div>
            )}

            {!isLoggedIn ? (
              <div className="py-10 text-center bg-gray-50/60 rounded-2xl border border-gray-100 space-y-2.5">
                <User className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-600 font-medium">登录账号后，即可在此查看您提交的全部历史评价</p>
                <button
                  onClick={() => onOpenAuth('login')}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-xs"
                >
                  立即登录
                </button>
              </div>
            ) : filteredMyReviews.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-xs bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 space-y-2">
                <p>
                  {reviewFilterTab === 'all'
                    ? '您尚未提交过教师评价记录。'
                    : `暂无状态为「${
                        reviewFilterTab === 'pending'
                          ? '审核中'
                          : reviewFilterTab === 'approved'
                          ? '已通过'
                          : '已驳回'
                      }」的评价。`}
                </p>
                <p className="text-[11px] text-gray-500">
                  提交真实教师上课评价通过审核即可获赠 20 积分奖励！
                </p>
                <button
                  onClick={onOpenReview}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  去写第一篇评价
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMyReviews.map((rev) => {
                  const teacher = teachers.find((t) => t.id === rev.teacherId);
                  const isPending = rev.status === 'pending';
                  const isApproved = rev.status === 'approved';
                  const isRejected = rev.status === 'rejected';

                  return (
                    <div
                      key={rev.id}
                      className="p-4 bg-gray-50/70 hover:bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5 transition-all text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">
                            {teacher?.name || '任课老师'}
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-600 font-medium">{rev.courseName}</span>
                          <span className="text-[10px] text-gray-400">({rev.yearTerm || '近期'})</span>
                        </div>

                        {/* Badges according to PRD */}
                        {isPending && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600 animate-pulse" /> ⏳ 审核中
                          </span>
                        )}

                        {isApproved && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> ✓ 已公示 (+20分)
                          </span>
                        )}

                        {isRejected && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <XCircle className="w-2.5 h-2.5" /> ✕ 未通过
                          </span>
                        )}
                      </div>

                      {/* Friendly tip for pending reviews */}
                      {isPending && (
                        <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-800 flex items-start gap-2">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong>正在复核：</strong>正在由交大学工/学生审核组复核，预计24小时内公示。
                            <span className="block text-amber-700 mt-0.5 font-medium">
                              提示：+20 积分待审核通过后自动到账并记入教师主页。
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Rejection reason box if rejected */}
                      {isRejected && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong>驳回原因：</strong>
                              {rev.rejectionReason || '内容包含不当言论、人身攻击或过于简略'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-rose-100">
                            <button
                              onClick={() => {
                                if (teacher) {
                                  onSelectTeacher?.(teacher);
                                }
                                onOpenReview();
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-200 text-[10px] transition-colors flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" /> 重新编辑提交
                            </button>
                            {onDeleteReview && (
                              <button
                                onClick={() => {
                                  if (confirm('确定要删除此条被驳回的记录吗？')) {
                                    onDeleteReview(rev.id);
                                  }
                                }}
                                className="px-2 py-1 text-gray-500 hover:text-rose-700 text-[10px] transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> 删除记录
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {rev.comment && (
                        <p className="text-gray-700 text-xs leading-relaxed bg-white p-3 rounded-xl border border-gray-100">
                          “{rev.comment}”
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px] text-gray-500">
                        <div className="flex items-center gap-3">
                          <span>给分：<strong className="text-emerald-600">{rev.dimensions?.gradingLeniency ?? 4}分</strong></span>
                          <span>点名：<strong className="text-gray-700">{rev.dimensions?.attendanceStrictness ?? 3}分</strong></span>
                          <span>质量：<strong className="text-indigo-600">{rev.dimensions?.teachingQuality ?? 4}分</strong></span>
                        </div>

                        {teacher && onSelectTeacher && isApproved && (
                          <button
                            onClick={() => onSelectTeacher(teacher)}
                            className="text-indigo-600 hover:text-indigo-700 text-xs font-medium flex items-center gap-1"
                          >
                            查看教师页面 <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Points Transaction Ledger */}
          {isLoggedIn && (
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-bold text-gray-900">近期积分流水明细</h4>
                </div>
                <button
                  onClick={onOpenPointsModal}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  查看全部
                </button>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
                {transactions.slice(0, 4).map((tx) => (
                  <div key={tx.id} className="p-3 bg-white flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-gray-800">{tx.action}</span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">{tx.timestamp}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">余额: {tx.balanceAfter}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRD 5.0 Points Economy Rules Table */}
          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 text-xs text-gray-500 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-gray-700">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>PRD 5.0 积分经济体系对照表</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
              <div className="p-2.5 bg-white rounded-xl border border-gray-100 space-y-1">
                <span className="font-bold text-emerald-700 block">积分获取渠道：</span>
                <p>• 每日签到奖励：+5 积分/天</p>
                <p>• 提交审核通过评价：+20 积分/条</p>
                <p>• 首次注册赠送：+100 初始积分</p>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-gray-100 space-y-1">
                <span className="font-bold text-rose-700 block">积分消耗渠道：</span>
                <p>• AI 智能问答助理：2 积分/次</p>
                <p>• 教师库结构化检索：永久免费</p>
                <p>• 六维雷达图查看：永久免费</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
