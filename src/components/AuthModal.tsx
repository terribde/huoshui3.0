import { ModalFrame } from './ModalFrame';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  GraduationCap, 
  Building2, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { SWJTU_COLLEGES } from '../data/mockTeachers';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (user: any, isNewRegistration?: boolean) => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [college, setCollege] = useState(SWJTU_COLLEGES[0] || '计算机与人工智能学院');
  const [campus, setCampus] = useState<'犀浦校区' | '九里校区'>('犀浦校区');

  // Status
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setNickname('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setCanResendVerification(false);
  };

  const handleSwitchMode = (newMode: 'login' | 'register' | 'forgot') => {
    setMode(newMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    setCanResendVerification(false);
  };

  const handleResendVerification = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('请先输入注册时填写的邮箱');
      return;
    }
    setResending(true);
    setErrorMsg(null);
    try {
      await supabaseService.resendVerificationEmail(cleanEmail);
      setSuccessMsg('激活验证邮件已重新发送至您的邮箱，请检查收件箱或垃圾邮件箱');
      setCanResendVerification(false);
    } catch (err: any) {
      console.error('[Resend Verification Error]', err);
      let msg = err.message || '重发激活邮件失败';
      if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
        msg = '发送过于频繁，系统每小时发信次数受限，请稍候再试';
      }
      setErrorMsg(msg);
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setCanResendVerification(false);

    // Email validation
    const cleanEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMsg('请输入合规有效的邮箱地址（如 2502087135@qq.com 或交大邮箱）');
      return;
    }

    // Forgot password flow
    if (mode === 'forgot') {
      setLoading(true);
      try {
        await supabaseService.resetPassword(cleanEmail);
        setSuccessMsg('密码重置邮件已发送！请查收邮件并按照提示重设您的密码。');
      } catch (err: any) {
        console.error('[Reset Password Error]', err);
        let msg = err.message || '发送重置邮件失败，请重试';
        if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
          msg = '发送过于频繁，系统每小时发信次数受限，请稍后再试';
        } else if (msg.includes('not found') || msg.includes('User not found')) {
          msg = '该邮箱未在系统中注册，请先注册';
        }
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('密码长度不能少于 6 位');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await supabaseService.signIn(cleanEmail, password);
        setSuccessMsg('登录成功！正在加载个人评教档案...');
        setTimeout(() => {
          if (res.user) {
            onAuthSuccess?.(res.user, false);
          }
          onClose();
          resetForm();
        }, 500);
      } else {
        const finalNickname = nickname.trim() || '交大学子';
        const res = await supabaseService.signUp(cleanEmail, password, {
          nickname: finalNickname,
          college,
          campus,
        });

        // Check anti-enumeration: existing user returned with empty identities
        const isAlreadyRegistered = Boolean(
          res.user && Array.isArray(res.user.identities) && res.user.identities.length === 0
        );
        if (isAlreadyRegistered) {
          setErrorMsg('该邮箱已被注册！请直接切换至「密码登录」；若忘记密码可点击「忘记密码」重置。');
          return;
        }

        // Check if email confirmation is required by Supabase (session is null)
        if (res.user && !res.session) {
          setSuccessMsg('注册申请已提交！激活确认邮件已发送至您的邮箱，请前往查收邮件并激活后再登录。');
          setTimeout(() => {
            setMode('login');
          }, 3500);
          return;
        }

        const authUser = res.user
          ? {
              ...res.user,
              user_metadata: {
                ...(res.user.user_metadata || {}),
                nickname: finalNickname,
                college,
                campus,
              },
            }
          : null;

        setSuccessMsg('注册成功！已为您自动赠送 100 初始评教积分 🎁');

        setTimeout(() => {
          if (authUser) {
            onAuthSuccess?.(authUser, true);
          }
          onClose();
          resetForm();
        }, 800);
      }
    } catch (err: any) {
      console.error('[Auth Error]', err);
      let message = err.message || '操作失败，请重试';
      if (message.includes('Invalid login credentials') || message.includes('invalid_credentials')) {
        message = '邮箱或密码错误，请检查后再试（若尚未注册请先切换至注册）';
      } else if (message.includes('Email not confirmed') || message.includes('email_not_confirmed')) {
        message = '该账号尚未通过邮箱激活验证！请前往邮箱查收激活邮件，或点击下方重发。';
        setCanResendVerification(true);
      } else if (message.includes('User already registered') || message.includes('user_already_exists')) {
        message = '该邮箱已注册，请直接切换至「密码登录」；若忘记密码可点击「找回密码」';
      } else if (message.includes('email rate limit exceeded') || message.includes('over_email_send_rate_limit')) {
        message = '邮件发信过于频繁（系统每小时限制），请稍后再试或联系系统管理员';
      } else if (message.includes('email_address_invalid') || message.includes('Unable to validate email address')) {
        message = '请输入真实有效的邮箱地址（如 QQ邮箱、163邮箱或西南交大官方邮箱）';
      } else if (message.includes('Password should be at least') || message.includes('weak_password')) {
        message = '密码强度不足，长度必须至少 6 个字符';
      } else if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        message = '网络连接异常，无法连接鉴权服务器，请检查网络';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalFrame id="auth-modal" label="账号登录与注册" onClose={onClose}>
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
      />

      {/* Modal Container */}
      <motion.div 
        id="auth-modal-content"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="modal-panel relative z-10 bg-white w-full max-w-md h-[90vh] h-[90dvh] sm:h-auto max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header with Switch Tabs */}
        <div className="shrink-0 p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shadow-indigo-200">
              交
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">西南交大学子系统</h3>
              <p className="text-[11px] text-gray-500">统一身份认证 · 积分权益与评教中心</p>
            </div>
          </div>
          <motion.button 
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            data-modal-close aria-label="关闭窗口"
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Tab Switcher */}
        <div className="p-4 bg-gray-50/70 border-b border-gray-100 shrink-0">
          {mode === 'forgot' ? (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-600" />
                找回与重置账号密码
              </span>
              <button
                type="button"
                onClick={() => handleSwitchMode('login')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                返回登录 →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 p-1 bg-gray-200/80 rounded-2xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleSwitchMode('login')}
                className={`py-2 rounded-xl transition-all ${
                  mode === 'login' 
                    ? 'bg-white text-indigo-700 shadow-2xs' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                密码登录
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('register')}
                className={`py-2 rounded-xl transition-all ${
                  mode === 'register' 
                    ? 'bg-white text-indigo-700 shadow-2xs' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                邮箱注册 (+100积分)
              </button>
            </div>
          )}
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Banner for Register */}
          {mode === 'register' && (
            <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">新人注册福利：即送 100 初始积分</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  解锁「全量教师评价查看」、「选课推荐权重计算」及「撰写评教 +20分 奖励」。
                </p>
              </div>
            </div>
          )}

          {/* Top Banner for Forgot Password */}
          {mode === 'forgot' && (
            <div className="p-3 bg-indigo-50/80 rounded-2xl border border-indigo-100 text-indigo-950 text-xs flex items-start gap-2.5 shadow-2xs">
              <Mail className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">安全密码重置</p>
                <p className="text-[11px] text-indigo-700 mt-0.5">
                  输入注册时填写的邮箱地址，我们将通过 Supabase 安全服务发送密码重置邮件至您的邮箱。
                </p>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
                {canResendVerification && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="self-start ml-6 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline transition-colors disabled:opacity-50"
                  >
                    {resending ? '正在重新发送验证邮件...' : '点击重新发送激活验证邮件 →'}
                  </button>
                )}
              </motion.div>
            )}

            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span className="font-medium">{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                常用邮箱 / 交大邮箱
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="如: 2502087135@qq.com 或 student@swjtu.edu.cn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Password Field (Only for login or register) */}
            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    登录密码 {mode === 'register' && <span className="text-gray-400 font-normal">(至少6位)</span>}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('forgot')}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      忘记密码？
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="请输入您的安全密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Register specific fields */}
            {mode === 'register' && (
              <>
                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    确认密码
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      placeholder="请再次输入确认密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* Nickname */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    展示昵称 <span className="text-gray-400 font-normal">(选填，评教时默认匿名)</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="如: 犀浦熬夜选手"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* College & Campus Selector */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      所属学院
                    </label>
                    <div className="relative">
                      <select
                        value={college}
                        onChange={(e) => setCollege(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      >
                        {SWJTU_COLLEGES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      所在校区
                    </label>
                    <select
                      value={campus}
                      onChange={(e) => setCampus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    >
                      <option value="犀浦校区">犀浦校区</option>
                      <option value="九里校区">九里校区</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <motion.button
                type="submit"
                disabled={loading}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {mode === 'forgot' 
                        ? '正在发送密码重置邮件...' 
                        : '正在验证并同步云端...'}
                    </span>
                  </>
                ) : mode === 'login' ? (
                  <>
                    <span>立即登录</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : mode === 'register' ? (
                  <>
                    <span>完成注册并领 100 积分</span>
                    <Sparkles className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>发送重置密码邮件</span>
                    <Mail className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Privacy Note */}
          <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>数据直连 Supabase 安全鉴权 · 评教完全匿名保护</span>
          </div>
        </div>
      </motion.div>
    </ModalFrame>
  );
};
