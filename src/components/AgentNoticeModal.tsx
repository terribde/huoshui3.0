import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Megaphone, Gift, Sliders, CalendarDays, Bot, Mail, Copy, Check, Heart, ArrowUpRight } from 'lucide-react';
import { ModalFrame } from './ModalFrame';
import { RATING_DIMENSIONS } from '../lib/ratings';

// 公告文字、联系邮箱和支持二维码统一在这里维护。
export const AGENT_NOTICE_CONFIG = {
  title: '新版交大活水，和你见面了',
  intro: '查评价、选课程，希望这里能帮你少走一点弯路。',
  trafficTitle: '新版没有流量限制',
  trafficBody: '查老师、看评价、挑课程，按自己的需要慢慢看。',
  pointsTitle: '注册就送 100 积分',
  pointsBody: '欢迎先注册一个账号，领取你的新用户积分。',
  ratingsTitle: '从 3 个评价维度，到 6 个',
  ratingsBody: '旧站只有 3 个评价维度。新版用 6 个维度记录同学们的感受，选老师时可以看得更全面。',
  timetableTitle: '本学期课表，也能查了',
  timetableBody: '在智能选课里查本学期开设的课程，也可以点进老师详情，查看老师的开课安排和上课时间。',
  aiTitle: 'AI 功能维护中',
  aiBody: '还在继续调试和完善。之后希望能直接用 AI 查老师评价、了解课程，这部分做好了会再告诉大家。',
  devNote: '这个网站全部由两个人完成，从制定PRD到开发实现，从页面到功能，都是一步步做出来的。开发不易，你们的支持是我们继续更新的动力。',
  donationTitle: '支持一下服务器',
  donationSubtitle: '支持随心，能来使用和提建议，我也很感谢。',
  contactEmail: '2502087135@qq.com',
  contactNote: '发现问题、有建议，或想一起参与开发，都可以给我写邮件。',
  alipayQrCodeImageUrl: '/donation-qrcode.jpg',
  wechatQrCodeImageUrl: '/wechat-donation-qrcode.jpg',
};

export function SiteNoticeBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="查看网站公告"
      className="w-full flex items-center gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-3 text-left text-indigo-900 hover:bg-indigo-100/70 transition-colors">
      <Megaphone className="w-4 h-4 shrink-0 text-indigo-600" />
      <span className="flex-1 min-w-0 text-xs leading-relaxed"><strong>新版公告</strong><span className="text-indigo-700"> · 不限流量，注册领 100 积分</span></span>
      <ArrowUpRight className="w-4 h-4 shrink-0" />
    </button>
  );
}

interface AgentNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister?: () => void;
}

export const AgentNoticeModal: React.FC<AgentNoticeModalProps> = ({ isOpen, onClose, onRegister }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [failedQrCodes, setFailedQrCodes] = useState<Record<'alipay' | 'wechat', boolean>>({ alipay: false, wechat: false });
  if (!isOpen) return null;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_NOTICE_CONFIG.contactEmail);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <ModalFrame id="agent-notice-modal" label="新版交大活水网站公告" onClose={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} aria-hidden="true" className="absolute inset-0 bg-slate-900/55 backdrop-blur-xs" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.2 }}
        className="modal-panel relative z-10 w-full max-w-xl rounded-t-3xl bg-white shadow-2xl border border-indigo-100 flex flex-col">
        <header className="shrink-0 px-5 py-4 sm:px-7 sm:py-5 bg-gradient-to-br from-indigo-50 via-white to-violet-50 border-b border-indigo-100">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 mb-2"><Megaphone className="w-3.5 h-3.5" />网站公告</div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{AGENT_NOTICE_CONFIG.title}</h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">{AGENT_NOTICE_CONFIG.intro}</p>
            </div>
            <button type="button" onClick={onClose} data-modal-close aria-label="关闭公告"
              className="rounded-full text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 sm:px-7 space-y-5" data-notice-scroll>
          <section className="rounded-2xl bg-indigo-600 p-4 sm:p-5 text-white">
            <h3 className="text-base sm:text-lg font-bold">{AGENT_NOTICE_CONFIG.trafficTitle}</h3>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-indigo-100">{AGENT_NOTICE_CONFIG.trafficBody}</p>
            <div className="mt-4 pt-3 border-t border-white/20 flex items-start gap-2.5">
              <Gift className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
              <div><h3 className="font-semibold text-sm">{AGENT_NOTICE_CONFIG.pointsTitle}</h3><p className="mt-1 text-xs leading-relaxed text-indigo-100">{AGENT_NOTICE_CONFIG.pointsBody}</p></div>
            </div>
          </section>

          <section className="space-y-2.5">
            <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900"><Sliders className="w-4 h-4 text-indigo-600" />{AGENT_NOTICE_CONFIG.ratingsTitle}</h3>
            <p className="text-sm leading-relaxed text-slate-600">{AGENT_NOTICE_CONFIG.ratingsBody}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RATING_DIMENSIONS.map(dimension => <span key={dimension.key} className="rounded-lg bg-slate-50 border border-slate-100 py-2 px-2 text-center text-xs text-slate-600">{dimension.label}</span>)}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900"><CalendarDays className="w-4 h-4 text-indigo-600" />{AGENT_NOTICE_CONFIG.timetableTitle}</h3>
            <p className="text-sm leading-relaxed text-slate-600">{AGENT_NOTICE_CONFIG.timetableBody}</p>
          </section>

          <section className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900"><Bot className="w-4 h-4 shrink-0" />{AGENT_NOTICE_CONFIG.aiTitle}</h3>
            <p className="text-sm leading-relaxed text-amber-900/80">{AGENT_NOTICE_CONFIG.aiBody}</p>
          </section>

          <section className="border-t border-slate-100 pt-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">最后，想说几句</h3>
            <p className="text-sm leading-7 text-slate-600">{AGENT_NOTICE_CONFIG.devNote}</p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-center">
              <h4 className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-800"><Heart className="w-4 h-4 text-rose-500" />{AGENT_NOTICE_CONFIG.donationTitle}</h4>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {([
                  { key: 'alipay', label: '支付宝', src: AGENT_NOTICE_CONFIG.alipayQrCodeImageUrl },
                  { key: 'wechat', label: '微信支付', src: AGENT_NOTICE_CONFIG.wechatQrCodeImageUrl },
                ] as const).map(({ key, label, src }) => (
                  <div key={key} className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-slate-700">{label}</p>
                    {failedQrCodes[key] ? <p className="flex aspect-square items-center justify-center rounded-xl bg-white px-2 text-xs text-slate-500" role="status">二维码加载失败</p> : (
                      <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`查看${label}收款码大图`} className="block rounded-xl border border-slate-200 bg-white p-2">
                        <img src={src} alt={`${label}收款二维码`} width={192} height={240} onError={() => setFailedQrCodes(previous => ({ ...previous, [key]: true }))} className="aspect-square w-full object-contain" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">点击二维码查看大图，也可以长按保存。</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{AGENT_NOTICE_CONFIG.donationSubtitle}</p>
            </div>
            <div className="pt-1">
              <p className="text-xs leading-relaxed text-slate-500">{AGENT_NOTICE_CONFIG.contactNote}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <a href={'mailto:' + AGENT_NOTICE_CONFIG.contactEmail} className="inline-flex items-center gap-1.5 text-sm text-indigo-700 hover:underline py-2 break-all"><Mail className="w-4 h-4 shrink-0" />{AGENT_NOTICE_CONFIG.contactEmail}</a>
                <button type="button" onClick={handleCopyEmail} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-700 rounded-lg bg-slate-100 px-3 min-h-11">
                  {copyState === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copyState === 'copied' ? '已复制' : '复制邮箱'}
                </button>
              </div>
              <p role="status" className="text-xs text-slate-500 leading-relaxed">{copyState === 'failed' ? '复制未成功，请长按上方邮箱手动复制，或点击邮箱写信。' : copyState === 'copied' ? '邮箱已复制到剪贴板。' : ''}</p>
            </div>
          </section>
        </div>

        <footer className="shrink-0 p-4 border-t border-slate-100 bg-white flex gap-3">
          <button type="button" onClick={onClose} className={'flex-1 min-h-11 rounded-xl text-sm font-semibold transition-colors ' + (onRegister ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700')}>我知道了，开始逛逛</button>
          {onRegister && <button type="button" onClick={onRegister} className="flex-1 min-h-11 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">注册领 100 积分</button>}
        </footer>
      </motion.div>
    </ModalFrame>
  );
};
