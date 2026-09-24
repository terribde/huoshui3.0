import React from 'react';
import { UserPointTransaction } from '../types';
import { X, Coins, Check, Calendar, ArrowUpRight, Shield, RotateCw } from 'lucide-react';
import { motion } from 'motion/react';

interface UserPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  points: number;
  transactions: UserPointTransaction[];
  hasCheckedInToday: boolean;
  isCheckingIn?: boolean;
  isCheckinStatusLoading?: boolean;
  onCheckIn: () => void;
  onOpenReview: () => void;
}

export const UserPointsModal: React.FC<UserPointsModalProps> = ({
  isOpen,
  onClose,
  points,
  transactions,
  hasCheckedInToday,
  isCheckingIn = false,
  isCheckinStatusLoading = false,
  onCheckIn,
  onOpenReview,
}) => {
  return (
    <div id="points-center-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      <motion.div 
        id="points-center-content"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 bg-white w-full max-w-lg h-[88vh] h-[88dvh] sm:h-auto max-h-[88vh] max-h-[88dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-orange-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">交大积分中心</h3>
              <p className="text-xs text-gray-500">写评价换权限 · 永久有效不扣除 (PRD 5.0)</p>
            </div>
          </div>
          <motion.button 
            id="close-points-center-btn"
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        <div className="p-5 pb-8 sm:pb-5 overflow-y-auto min-h-0 space-y-5 flex-1 overscroll-contain">
          {/* Balance card */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />
            
            <div className="flex items-center justify-between relative z-10">
              <div>
                <span className="text-xs text-gray-400 font-medium">当前可用积分 (永久有效)</span>
                <div className="text-3xl font-extrabold text-amber-400 mt-1 flex items-baseline gap-1">
                  <span>{points}</span>
                  <span className="text-xs text-gray-400 font-normal">分</span>
                </div>
              </div>

              {/* Checkin button */}
              <motion.button
                id="daily-checkin-btn"
                whileTap={hasCheckedInToday || isCheckingIn || isCheckinStatusLoading ? {} : { scale: 0.92 }}
                disabled={hasCheckedInToday || isCheckingIn || isCheckinStatusLoading}
                onClick={onCheckIn}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                  hasCheckedInToday
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-90'
                    : isCheckingIn || isCheckinStatusLoading
                    ? 'bg-amber-400/50 text-gray-900 cursor-wait animate-pulse'
                    : 'bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-gray-950 shadow-amber-500/20 cursor-pointer active:scale-95'
                }`}
              >
                {isCheckinStatusLoading ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    同步中...
                  </>
                ) : isCheckingIn ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    签到中...
                  </>
                ) : hasCheckedInToday ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    今日已签到
                  </>
                ) : (
                  <>
                    <Calendar className="w-3.5 h-3.5" />
                    每日签到 (+5分)
                  </>
                )}
              </motion.button>
            </div>

            <div className="pt-4 mt-4 border-t border-gray-700/60 flex items-center justify-between text-xs text-gray-300 relative z-10">
              <span>商业模式：暂不收现金，靠评价共享社区共建</span>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  onClose();
                  onOpenReview();
                }}
                className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1 cursor-pointer"
              >
                去写评价 (+20分) <ArrowUpRight className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          </div>

          {/* Rules Breakdown (PRD 5.0 Table) */}
          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              PRD 积分获取与消耗规则
            </h4>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-white rounded-xl border border-gray-200/80 space-y-1">
                <span className="font-semibold text-gray-800 text-[11px] block text-emerald-600">
                  + 获取途径
                </span>
                <p className="text-gray-600 text-[11px]">✍️ 写评价审核通过：<strong>+20 分</strong> (主渠道)</p>
                <p className="text-gray-600 text-[11px]">📅 每日登录/签到：<strong>+5 分</strong></p>
                <p className="text-gray-600 text-[11px]">🤝 邀请校友注册：<strong>+10 分</strong></p>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-gray-200/80 space-y-1">
                <span className="font-semibold text-gray-800 text-[11px] block text-amber-600">
                  - 消耗规则
                </span>
                <p className="text-gray-600 text-[11px]">🤖 AI 自然语言提问：<strong>2 分/次</strong></p>
                <p className="text-gray-600 text-[11px]">🎯 偏好加权智能推荐：<strong>3 分/次</strong></p>
                <p className="text-gray-600 text-[11px]">📖 经验攻略内容：<strong>5 分/篇</strong></p>
                <p className="text-gray-600 text-[11px]">📢 教务网通知/查老师：<strong>永久免费</strong></p>
              </div>
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              积分流水明细
            </h4>

            <div className="space-y-1.5">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-gray-50/60 rounded-xl border border-gray-100 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-medium text-gray-800 block">{tx.action}</span>
                    <span className="text-[10px] text-gray-400">{tx.timestamp}</span>
                  </div>

                  <div className="text-right">
                    <span className={`font-bold ${
                      tx.amount > 0 ? 'text-emerald-600' : 'text-gray-700'
                    }`}>
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} 分
                    </span>
                    <span className="block text-[10px] text-gray-400">
                      结余: {tx.balanceAfter}分
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
