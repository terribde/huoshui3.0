import React, { useState } from 'react';
import { ModalFrame } from './ModalFrame';
import { motion } from 'motion/react';
import { 
  X, 
  Sparkles, 
  Mail, 
  Copy, 
  Check, 
  Heart, 
  Code2, 
  Coffee, 
  AlertTriangle,
  ExternalLink,
  QrCode
} from 'lucide-react';

/**
 * ============================================================================
 * 📝 【公告卡片快捷编辑区 / QUICK EDIT CONFIGURATION】
 * ============================================================================
 * 提示：如果需要修改公告文字、版本号、联系邮箱或赞赏二维码，可直接修改下方对象：
 * 文件路径: src/components/AgentNoticeModal.tsx
 * ============================================================================
 */
export const AGENT_NOTICE_CONFIG = {
  // 当前版本号
  version: 'pre1.0.1',
  
  // 顶部主标题与标签
  title: 'Agent 智能助手维护公告',
  badge: '全力更新中',
  
  // 公告核心文案
  noticeTitle: '功能暂时下线维护中',
  noticeBody: 'agent功能暂时不可用，我们正在全力更新，技术开发只有一个人，并且如果想要参与开发可以联系',
  
  // 开发者联系邮箱
  contactEmail: '2502087135@qq.com',
  
  // 补充说明
  devNote: '目前由交大同学一人独立开发维护。如果您对大模型校园应用（RAG / Agent / 知识库 / 前后端）感兴趣，欢迎邮件来信共同打磨！',
  
  // 赞赏 / 捐助区域
  donationTitle: '请开发者喝杯咖啡 ☕',
  donationSubtitle: '开源公益不易，您的赞助是服务器运维与功能迭代的最大动力！',
  
  // 捐助二维码图片路径：
  // 若您有微信或支付宝赞赏码图片，可把图片放到 public/donation-qrcode.png，并设置此处为 '/donation-qrcode.png'
  // 若为空字符串，则展示内置的赞赏码视觉图
  qrCodeImageUrl: '',
};

interface AgentNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentNoticeModal: React.FC<AgentNoticeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_NOTICE_CONFIG.contactEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModalFrame id="agent-notice-modal" label="Agent 功能维护公告" onClose={onClose}>
      {/* 背景遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      {/* 弹窗主体卡片 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="modal-panel relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-indigo-100/80 overflow-hidden flex flex-col max-h-[92vh] max-h-[92dvh] my-auto"
      >
        {/* 顶部色彩横条与头部 */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-br from-indigo-50/90 via-purple-50/60 to-pink-50/40 border-b border-indigo-100/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">
                    {AGENT_NOTICE_CONFIG.title}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {AGENT_NOTICE_CONFIG.badge}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">当前版本号:</span>
                  <span className="px-2 py-0.2 rounded-md bg-indigo-100/80 text-indigo-700 text-xs font-mono font-bold">
                    {AGENT_NOTICE_CONFIG.version}
                  </span>
                </div>
              </div>
            </div>

            {/* 关闭按钮 */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onClose}
              data-modal-close
              aria-label="关闭公告"
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-colors shadow-2xs"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* 弹窗内容可滚动区 */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* 核心公告卡片 */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-950 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{AGENT_NOTICE_CONFIG.noticeTitle}</span>
            </div>
            
            <p className="text-xs sm:text-sm leading-relaxed text-amber-900/90">
              {AGENT_NOTICE_CONFIG.noticeBody}：
              <a
                href={`mailto:${AGENT_NOTICE_CONFIG.contactEmail}`}
                className="font-bold underline decoration-amber-400 hover:text-indigo-600 inline-flex items-center gap-1 mx-1 text-indigo-700 transition-colors"
              >
                <span>{AGENT_NOTICE_CONFIG.contactEmail}</span>
                <ExternalLink className="w-3 h-3 inline-block" />
              </a>
            </p>

            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs">
              <span className="text-amber-800/80 flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5 text-amber-700" />
                技术开发目前仅一人，感谢大家的理解与等待！
              </span>

              <button
                type="button"
                onClick={handleCopyEmail}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">已复制邮箱</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-700" />
                    <span>复制邮箱</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 参与开发邀请说明 */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs text-indigo-900/90 leading-relaxed flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p>{AGENT_NOTICE_CONFIG.devNote}</p>
          </div>

          {/* 赞赏 / 捐助二维码卡片 */}
          <div className="p-5 rounded-3xl bg-gradient-to-b from-gray-50 to-white border border-gray-200/80 flex flex-col items-center text-center space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <Coffee className="w-4 h-4 text-amber-600" />
              <span>{AGENT_NOTICE_CONFIG.donationTitle}</span>
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            </div>

            <p className="text-xs text-gray-500 max-w-sm">
              {AGENT_NOTICE_CONFIG.donationSubtitle}
            </p>

            {/* 二维码展示区 */}
            <div className="relative p-3 bg-white rounded-2xl border-2 border-indigo-100 shadow-md flex flex-col items-center group">
              {AGENT_NOTICE_CONFIG.qrCodeImageUrl ? (
                <img
                  src={AGENT_NOTICE_CONFIG.qrCodeImageUrl}
                  alt="开发者赞赏二维码"
                  className="w-44 h-44 object-contain rounded-xl"
                />
              ) : (
                /* 默认矢量赞赏码占位图，样式精美且完全自洽 */
                <div className="w-44 h-44 bg-slate-900 rounded-xl p-3 flex flex-col items-center justify-between text-white relative overflow-hidden select-none">
                  {/* 二维码四角定位锚点 */}
                  <div className="w-full flex justify-between">
                    <div className="w-8 h-8 border-4 border-white rounded-lg flex items-center justify-center p-1">
                      <div className="w-3.5 h-3.5 bg-indigo-400 rounded-xs" />
                    </div>
                    <div className="w-8 h-8 border-4 border-white rounded-lg flex items-center justify-center p-1">
                      <div className="w-3.5 h-3.5 bg-indigo-400 rounded-xs" />
                    </div>
                  </div>

                  {/* 中心图标与提示 */}
                  <div className="flex flex-col items-center justify-center space-y-1 my-auto">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center">
                      <QrCode className="w-6 h-6 text-indigo-300" />
                    </div>
                    <span className="text-[10px] font-bold text-indigo-200 tracking-wider">
                      交大活水 · 赞赏通道
                    </span>
                  </div>

                  {/* 底部定位锚点与说明 */}
                  <div className="w-full flex justify-between items-end">
                    <div className="w-8 h-8 border-4 border-white rounded-lg flex items-center justify-center p-1">
                      <div className="w-3.5 h-3.5 bg-indigo-400 rounded-xs" />
                    </div>
                    <div className="text-[9px] text-gray-400 text-right leading-tight">
                      微信 / 支付宝<br />扫码支持
                    </div>
                  </div>
                </div>
              )}

              <span className="mt-2 text-[10px] text-gray-400 font-mono">
                扫码支持独立开发 · 共同打造更好的交大社区
              </span>
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-semibold text-xs transition-all shadow-xs"
          >
            我知道了
          </button>
        </div>
      </motion.div>
    </ModalFrame>
  );
};
