import React from 'react';
import { UserPointTransaction, Review, Teacher } from '../../types';
import { Coins, MessageSquare, Info, History, ArrowUpRight, CheckCircle2, ShieldAlert, Sparkles, User, Database } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';

interface DesktopUserProfileProps {
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

export const DesktopUserProfile: React.FC<DesktopUserProfileProps> = ({
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
  return (
    <div id="desktop-user-profile" className="w-full max-w-5xl mx-auto pt-2 pb-16 space-y-6">
      {/* 2-Column Grid Layout */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Left Column (5 Cols): Identity, Wallet & Actions */}
        <div className="col-span-5 space-y-5">
          {/* Identity Card */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-xs shadow-indigo-200 shrink-0">
                交
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-950">西南交大学子</h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    评教积极分子
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-gray-500">犀浦校区 · 认证学生身份</p>
                  {isSupabaseConfigured && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <Database className="w-3 h-3 text-emerald-600" />
                      Supabase 云端已直连
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Big Points Wallet Banner */}
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
                  disabled={hasCheckedInToday}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 ${
                    hasCheckedInToday
                      ? 'bg-white/20 text-white cursor-not-allowed'
                      : 'bg-white text-orange-600 hover:bg-orange-50'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {hasCheckedInToday ? '今日已完成签到' : '每日签到 (+5分)'}
                </button>
                <button
                  onClick={onOpenPointsModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-black/20 hover:bg-black/30 text-white transition-colors"
                >
                  明细
                </button>
              </div>
            </div>

            {/* Quick Action Grid */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={onOpenReview}
                className="p-3.5 bg-gray-50/80 hover:bg-emerald-50/50 rounded-2xl border border-gray-100 hover:border-emerald-200 transition-all text-left space-y-1.5 group"
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-gray-900 group-hover:text-emerald-700 block">
                  评价打分 (+20分)
                </span>
                <span className="text-[10px] text-gray-500 block leading-tight">
                  PRD 标准六维，可不写文字
                </span>
              </button>

              <button
                onClick={onOpenPointsModal}
                className="p-3.5 bg-gray-50/80 hover:bg-amber-50/50 rounded-2xl border border-gray-100 hover:border-amber-200 transition-all text-left space-y-1.5 group"
              >
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Coins className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-gray-900 group-hover:text-amber-700 block">
                  积分规则说明
                </span>
                <span className="text-[10px] text-gray-500 block leading-tight">
                  永久有效 · 问答扣2分
                </span>
              </button>
            </div>
          </div>

          {/* Project & Community PRD Card */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-2.5 text-xs text-gray-500">
            <div className="flex items-center gap-2 font-bold text-gray-800">
              <Info className="w-4 h-4 text-indigo-600" />
              <span>西南交大教师评价翻新说明 (PRD 1.0)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-600">
              原公益打分网站自 2024 年起已停更两年。本项目定位为「西南交通大学专属 Agent」，包含智能选课推荐、AI 自然语言问答、积分激励机制与历史数据迁移。
            </p>
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
              <span>研发团队：产品 + 技术协同 (2人)</span>
              <span>版本号：v1.0 (草案)</span>
            </div>
          </div>
        </div>

        {/* Right Column (7 Cols): Reviews & Transaction Ledger */}
        <div className="col-span-7 space-y-5">
          {/* My Reviews Section */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-gray-900">我的评价记录</h4>
              </div>
              <span className="text-xs text-gray-400">共 {myReviews.length} 条</span>
            </div>

            {myReviews.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-xs bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 space-y-2">
                <p>您尚未提交过教师评价记录。</p>
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
                {myReviews.map((rev) => {
                  const teacher = teachers.find((t) => t.id === rev.teacherId);
                  return (
                    <div
                      key={rev.id}
                      className="p-4 bg-gray-50/70 hover:bg-gray-50 rounded-2xl border border-gray-100 text-xs space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">
                            {teacher?.name || '任课老师'}
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-600 font-medium">{rev.courseName}</span>
                          <span className="text-[10px] text-gray-400">({rev.term})</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> 已过审 (+20分)
                        </span>
                      </div>

                      {rev.comment && (
                        <p className="text-gray-700 text-xs leading-relaxed bg-white p-3 rounded-xl border border-gray-100">
                          “{rev.comment}”
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px] text-gray-500">
                        <div className="flex items-center gap-3">
                          <span>给分：<strong className="text-emerald-600">{rev.dimensions.gradingLeniency}分</strong></span>
                          <span>点名：<strong className="text-gray-700">{rev.dimensions.attendanceStrictness}分</strong></span>
                          <span>质量：<strong className="text-indigo-600">{rev.dimensions.teachingQuality}分</strong></span>
                        </div>

                        {teacher && onSelectTeacher && (
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
                <p>• 首次注册赠送：+30 积分</p>
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
