import React from 'react';
import { UserPointTransaction, Review, Teacher } from '../../types';
import { Coins, MessageSquare, Info, History, CheckCircle2, ArrowUpRight } from 'lucide-react';

interface MobileUserProfileProps {
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
    <div id="mobile-user-profile" className="w-full px-4 pt-3 pb-24 space-y-4">
      {/* 1. Profile Header Card */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-2xs space-y-3.5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-xs shadow-indigo-200">
            交
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">西南交大学子</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                评教积极分子
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">犀浦校区 · 认证学生</p>
          </div>
        </div>

        {/* Points Banner */}
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
      </div>

      {/* 2. Quick Action Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onOpenReview}
          className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-2xs active:scale-95 transition-all text-left space-y-1 group"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-gray-900 block group-hover:text-emerald-600">
            评价打分 (+20分)
          </span>
          <span className="text-[10px] text-gray-400 block">六维标准打分，可只打分</span>
        </button>

        <button
          onClick={onOpenPointsModal}
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
          <span className="text-[11px] text-gray-400">{myReviews.length} 条</span>
        </div>

        {myReviews.length === 0 ? (
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
