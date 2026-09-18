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
  onAuthSuccess?: (user: any) => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [college, setCollege] = useState(SWJTU_COLLEGES[0] || '计算机与人工智能学院');
  const [campus, setCampus] = useState<'犀浦校区' | '九里校区'>('犀浦校区');

  // Status
  const [loading, setLoading] = useState(false);
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
  };

  const handleSwitchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('请输入正确的邮箱地址（支持常用邮箱或交大邮箱）');
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
          onAuthSuccess?.(res.user);
          onClose();
          resetForm();
        }, 600);
      } else {
        const res = await supabaseService.signUp(cleanEmail, password, {
          nickname: nickname.trim() || '交大学子',
          college,
          campus,
        });

        if (res.user && !res.session) {
          // Email confirmation might be enabled
          setSuccessMsg('注册申请已提交！若您的 Supabase 开启了邮件确认，请查收邮件；若未开启则可直接登录。');
        } else {
          setSuccessMsg('注册成功！已为您自动赠送 100 初始评教积分 🎁');
        }

        setTimeout(() => {
          onAuthSuccess?.(res.user);
          onClose();
          resetForm();
        }, 1200);
      }
    } catch (err: any) {
      console.error('[Auth Error]', err);
      let message = err.message || '操作失败，请重试';
      if (message.includes('Invalid login credentials')) {
        message = '邮箱或密码错误，请检查后再试';
      } else if (message.includes('User already registered')) {
        message = '该邮箱已注册，请直接切换至登录';
      } else if (message.includes('Password should be at least')) {
        message = '密码必须至少 6 个字符';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
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
        className="relative z-10 bg-white w-full max-w-md h-[90vh] h-[90dvh] sm:h-auto max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
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
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Tab Switcher */}
        <div className="p-4 bg-gray-50/70 border-b border-gray-100 shrink-0">
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

          {/* Feedback messages */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMsg}</span>
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
                <span>{successMsg}</span>
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
                  placeholder="如: student@swjtu.edu.cn 或 QQ邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                登录密码 {mode === 'register' && <span className="text-gray-400 font-normal">(至少6位)</span>}
              </label>
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
                    <span>正在验证并同步云端...</span>
                  </>
                ) : mode === 'login' ? (
                  <>
                    <span>立即登录</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>完成注册并领 100 积分</span>
                    <Sparkles className="w-4 h-4" />
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
    </div>
  );
};
