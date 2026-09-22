import React, { useState, useEffect } from 'react';
import { Review, Teacher } from '../types';
import { 
  X, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, 
  Search, Filter, Clock, Eye, Trash2, Send, Lock, UserCheck, Sparkles, MessageSquare,
  Users, UserPlus, Database, RefreshCw, Check, Copy, UserCog, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { checkSensitiveContent } from '../utils/sensitiveFilter';
import { supabaseService } from '../services/supabaseService';

interface AdminAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviews: Review[];
  teachers: Teacher[];
  onApproveReview: (reviewId: string, authorUserId?: string) => Promise<void>;
  onRejectReview: (reviewId: string, reason: string) => Promise<void>;
  onDeleteReview: (reviewId: string) => Promise<void>;
  onRefreshReviews?: () => Promise<void> | void;
  currentUserEmail?: string;
}

const formatReviewDate = (dateStr?: string) => {
  if (!dateStr || dateStr === '刚刚') return '刚刚';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PRESET_REJECTION_REASONS = [
  '包含不当言论、粗俗用语或人身攻击',
  '涉嫌广告营销、代考代写或外部联系方式引流',
  '泄露教师或学生个人隐私（如电话、微信、住址等）',
  '评价内容与课程实际教学无关，属于无意义刷屏灌水',
  '评语过于简略敷衍（建议补充具体考核形式与授课特点）',
];

export const AdminAuditModal: React.FC<AdminAuditModalProps> = ({
  isOpen,
  onClose,
  reviews,
  teachers,
  onApproveReview,
  onRejectReview,
  onDeleteReview,
  onRefreshReviews,
  currentUserEmail,
}) => {
  // Navigation between Reviews Audit and Admin Users Config
  const [activeSection, setActiveSection] = useState<'reviews' | 'admins'>('reviews');

  // Admin authentication state
  const isInitialEmailAdmin = Boolean(
    currentUserEmail && (
      currentUserEmail.includes('admin') || 
      currentUserEmail === '2502087135@qq.com' ||
      currentUserEmail.endsWith('@swjtu.edu.cn')
    )
  );

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return isInitialEmailAdmin || localStorage.getItem('swjtu_admin_auth') === 'true';
  });
  const [adminPasscode, setAdminPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [adminRole, setAdminRole] = useState<string>('admin');

  // Dynamic Supabase Admin List state
  const [adminList, setAdminList] = useState<Array<{ id: string; email: string; role: string; nickname: string; is_active: boolean; created_at: string }>>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState<boolean>(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminNickname, setNewAdminNickname] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'super_admin' | 'admin' | 'moderator'>('admin');
  const [adminActionMsg, setAdminActionMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);
  const [isRefreshingReviews, setIsRefreshingReviews] = useState(false);

  // Moderation filtering state
  const [currentTab, setCurrentTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Reject Dialog state
  const [rejectingReview, setRejectingReview] = useState<Review | null>(null);
  const [selectedReason, setSelectedReason] = useState(PRESET_REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  // Dynamically check admin status in Supabase
  useEffect(() => {
    let isMounted = true;
    if (currentUserEmail) {
      supabaseService.checkIsAdmin(currentUserEmail).then((res) => {
        if (isMounted && res.isAdmin) {
          setIsAdminAuthenticated(true);
          setAdminRole(res.role || 'admin');
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [currentUserEmail]);

  // Load admin list when switching to admin config tab
  const loadAdmins = async () => {
    setIsLoadingAdmins(true);
    try {
      const list = await supabaseService.getAdminList();
      setAdminList(list);
    } catch (e) {
      console.warn('Failed to load admins:', e);
    } finally {
      setIsLoadingAdmins(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'admins' && isAdminAuthenticated) {
      loadAdmins();
    }
  }, [activeSection, isAdminAuthenticated]);

  if (!isOpen) return null;

  // Verify Admin Code
  const handleVerifyPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasscode.trim() === 'swjtu2024' || adminPasscode.trim() === 'admin888') {
      setIsAdminAuthenticated(true);
      localStorage.setItem('swjtu_admin_auth', 'true');
      setAuthError('');
    } else {
      setAuthError('口令错误！默认测试口令为 swjtu2024 或 admin888');
    }
  };

  // Add new admin handler
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
      setAdminActionMsg({ text: '请输入合法的管理员邮箱地址', isError: true });
      return;
    }

    setAdminActionMsg(null);
    const success = await supabaseService.addAdminUser(
      newAdminEmail.trim(),
      newAdminRole,
      newAdminNickname.trim() || '评教审核员'
    );

    if (success) {
      setAdminActionMsg({ text: `已成功添加/授权管理员：${newAdminEmail.trim()}` });
      setNewAdminEmail('');
      setNewAdminNickname('');
      loadAdmins();
    } else {
      setAdminActionMsg({ text: '保存失败，请检查 Supabase 表 public.admin_users 是否已建表并授权。', isError: true });
    }
  };

  // Toggle admin active status
  const handleToggleAdminStatus = async (email: string, currentStatus: boolean) => {
    const success = await supabaseService.toggleAdminStatus(email, !currentStatus);
    if (success) {
      loadAdmins();
    }
  };

  const copySqlCode = () => {
    const sql = `-- 5. 管理员动态配置表 (admin_users)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin', -- 'super_admin' | 'admin' | 'moderator'
    nickname TEXT DEFAULT '评教审核员',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 默认插入站长初始超管账号
INSERT INTO public.admin_users (email, role, nickname, is_active)
VALUES ('2502087135@qq.com', 'super_admin', '站长超管', true)
ON CONFLICT (email) DO UPDATE SET is_active = true, role = 'super_admin';

-- 启用 RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can check active admin status" ON public.admin_users FOR SELECT USING (is_active = true);
CREATE POLICY "Public can manage admin users" ON public.admin_users FOR ALL USING (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const copyRlsSqlCode = () => {
    const sql = `-- 修复评价审核与读取权限 (允许管理员查询待审核评价并在后台公示或驳回)
DROP POLICY IF EXISTS "Public can view approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
CREATE POLICY "Public can view reviews" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can update reviews" ON public.reviews;
CREATE POLICY "Public can update reviews" ON public.reviews FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete reviews" ON public.reviews;
CREATE POLICY "Public can delete reviews" ON public.reviews FOR DELETE USING (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedRlsSql(true);
    setTimeout(() => setCopiedRlsSql(false), 2000);
  };

  const handleManualRefresh = async () => {
    setIsRefreshingReviews(true);
    try {
      if (onRefreshReviews) {
        await onRefreshReviews();
      }
    } finally {
      setIsRefreshingReviews(false);
    }
  };

  // Automatically refresh reviews whenever admin opens the modal
  useEffect(() => {
    if (isOpen && onRefreshReviews) {
      onRefreshReviews();
    }
  }, [isOpen]);

  const handleCreateTestReview = async () => {
    setIsRefreshingReviews(true);
    try {
      const firstTeacher = teachers[0];
      const offering = firstTeacher?.courseOfferings?.[0];
      const testRev: Review = {
        id: `rev_test_${Date.now()}`,
        teacherId: firstTeacher?.id || 't_001',
        courseId: offering?.courseId,
        courseName: offering?.courseName || firstTeacher?.courses[0] || '高等数学 (测试待审样本)',
        yearTerm: '2024-2025第1学期',
        dimensions: {
          attendanceStrictness: 3,
          gradingLeniency: 5,
          effortMatters: 4,
          workloadDifficulty: 3,
          approachability: 5,
          teachingQuality: 5,
        },
        comment: '（这是一条测试待审核评价）老师授课条理极其清晰，期末还会重点答疑。给分很公道，平时作业认真完成就能拿优秀！',
        authorNickname: '交大测评小助手',
        status: 'pending',
        createdAt: new Date().toISOString(),
        likes: 0,
      };
      await supabaseService.submitReview(testRev);
      if (onRefreshReviews) {
        await onRefreshReviews();
      }
    } finally {
      setIsRefreshingReviews(false);
    }
  };

  // Status counts
  const pendingCount = reviews.filter((r) => r.status === 'pending').length;
  const approvedCount = reviews.filter((r) => r.status === 'approved').length;
  const rejectedCount = reviews.filter((r) => r.status === 'rejected').length;

  // Filter reviews
  const filteredReviews = reviews.filter((r) => {
    // 1. Tab filter
    if (currentTab !== 'all' && r.status !== currentTab) return false;

    // 2. Search keyword filter
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    const teacher = teachers.find((t) => t.id === r.teacherId);
    return (
      (teacher?.name && teacher.name.toLowerCase().includes(kw)) ||
      (r.courseName && r.courseName.toLowerCase().includes(kw)) ||
      (r.comment && r.comment.toLowerCase().includes(kw)) ||
      (r.authorNickname && r.authorNickname.toLowerCase().includes(kw))
    );
  });

  const handleApprove = async (review: Review) => {
    setProcessingId(review.id);
    try {
      await onApproveReview(review.id, review.userId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingReview) return;
    const reason = customReason.trim() ? customReason.trim() : selectedReason;
    setProcessingId(rejectingReview.id);
    try {
      await onRejectReview(rejectingReview.id, reason);
      setRejectingReview(null);
      setCustomReason('');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-100"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-400/30 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-white">
                  西南交大选课评教 · 管理工作台
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {adminRole === 'super_admin' ? '超管权限' : '审核权限'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                严格把关评教内容 · 动态管理审核团队名单 (Supabase 数据库驱动)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdminAuthenticated && (
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  onClick={() => setActiveSection('reviews')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSection === 'reviews'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>评教审核</span>
                  {pendingCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full text-[9px] font-black">
                      {pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveSection('admins')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSection === 'admins'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>管理员动态配置</span>
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {!isAdminAuthenticated ? (
          /* Admin Login Gate */
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-5 my-auto">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-xs">
              <Lock className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h4 className="text-lg font-bold text-gray-900">需要管理员身份验证</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                当前登录邮箱：<strong>{currentUserEmail || '未登录/普通学生'}</strong>
                <br />
                请输入管理员管理口令进入评教审核后台（默认口令：<code className="text-indigo-600 font-mono font-bold">swjtu2024</code> 或 <code className="text-indigo-600 font-mono font-bold">admin888</code>）
              </p>
            </div>

            <form onSubmit={handleVerifyPasscode} className="w-full max-w-sm space-y-3">
              <input
                type="password"
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="输入管理员验证口令 (如: swjtu2024)"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-center tracking-widest font-mono"
                autoFocus
              />
              {authError && <p className="text-xs text-red-500 font-medium">{authError}</p>}
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs"
              >
                验证并进入审核工作台
              </button>
            </form>
          </div>
        ) : activeSection === 'admins' ? (
          /* Dynamic Admin Database Management Workspace */
          <div className="flex-1 flex flex-col overflow-y-auto p-6 bg-slate-50 space-y-6">
            {/* Supabase Status Banner */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-gray-900">Supabase 动态管理员配置表 (public.admin_users)</h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      云端同步已连接
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    添加至该表的邮箱用户在登录系统时，将自动获取管理员审核权限，无需每次输入验证码。
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={copySqlCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  title="复制建表 SQL 语句"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? '已复制 SQL' : '复制建表 SQL'}</span>
                </button>
                <button
                  onClick={loadAdmins}
                  disabled={isLoadingAdmins}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdmins ? 'animate-spin' : ''}`} />
                  <span>刷新列表</span>
                </button>
              </div>
            </div>

            {/* Add New Admin Form */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span>新增管理员账号</span>
              </div>

              {adminActionMsg && (
                <div className={`p-3 rounded-xl text-xs font-medium ${
                  adminActionMsg.isError ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}>
                  {adminActionMsg.text}
                </div>
              )}

              <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5 space-y-1">
                  <label className="text-xs font-semibold text-gray-700">管理员邮箱 (Supabase 登录账号)</label>
                  <input
                    type="email"
                    required
                    placeholder="如: 2502087135@qq.com 或 stu@swjtu.edu.cn"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-600 bg-gray-50 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-xs font-semibold text-gray-700">审核员备注昵称</label>
                  <input
                    type="text"
                    placeholder="如: 学工处李老师 / 评教组长"
                    value={newAdminNickname}
                    onChange={(e) => setNewAdminNickname(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-600 bg-gray-50 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-gray-700">权限角色</label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-600 bg-gray-50 focus:bg-white"
                  >
                    <option value="admin">审核管理员 (admin)</option>
                    <option value="super_admin">站长超管 (super_admin)</option>
                    <option value="moderator">助理审核员 (moderator)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>添加授权</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Current Admin Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-bold text-gray-900">当前已配置的管理员团队</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                    {adminList.length} 位
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {adminList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    暂未查询到管理员记录，请在下方点击执行 SQL 创建配置表。
                  </div>
                ) : (
                  adminList.map((adm) => (
                    <div key={adm.id || adm.email} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          {adm.nickname?.slice(0, 1) || '管'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900">{adm.email}</span>
                            {adm.role === 'super_admin' ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                                👑 站长超管
                              </span>
                            ) : adm.role === 'moderator' ? (
                              <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md text-[10px] font-bold">
                                助理协管
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md text-[10px] font-bold">
                                审核管理员
                              </span>
                            )}
                            {adm.is_active ? (
                              <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded text-[10px] font-medium">
                                活跃有效
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 bg-gray-100 text-gray-500 rounded text-[10px] font-medium">
                                已停用
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            身份昵称：{adm.nickname} · 登记时间：{new Date(adm.created_at || Date.now()).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => handleToggleAdminStatus(adm.email, adm.is_active)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            adm.is_active 
                              ? 'bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-600'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {adm.is_active ? '停用权限' : '恢复启用'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Supabase SQL Instructions Card */}
            <div className="bg-slate-900 text-slate-200 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">Supabase 后台快速操作指南</span>
                </div>
                <button
                  onClick={copySqlCode}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSql ? '已复制' : '复制 SQL'}</span>
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                如果您尚未在 Supabase 中运行建表脚本，请打开 Supabase 控制台的 <strong>SQL Editor</strong>，点击新建查询，粘贴上方 SQL 并点击 <strong>Run</strong> 执行即可。执行完成后，您即可在上方直接动态录入和管理所有管理员。
              </p>

              <pre className="p-3 bg-black/40 rounded-xl text-[11px] font-mono text-emerald-400 overflow-x-auto">
                {`-- 5. 管理员动态配置表 (admin_users)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    nickname TEXT DEFAULT '评教审核员',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
INSERT INTO public.admin_users (email, role, nickname, is_active)
VALUES ('2502087135@qq.com', 'super_admin', '站长超管', true)
ON CONFLICT (email) DO UPDATE SET is_active = true;`}
              </pre>
            </div>
          </div>
        ) : (
          /* Moderation Workspace */
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {/* Top Toolbar */}
            <div className="p-4 bg-white border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Tab Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-2xl w-full sm:w-auto overflow-x-auto">
                <button
                  onClick={() => setCurrentTab('pending')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    currentTab === 'pending'
                      ? 'bg-white text-amber-600 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>待审核</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    {pendingCount}
                  </span>
                </button>

                <button
                  onClick={() => setCurrentTab('approved')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    currentTab === 'approved'
                      ? 'bg-white text-emerald-600 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>已公示</span>
                  <span className="text-[10px] text-gray-400">({approvedCount})</span>
                </button>

                <button
                  onClick={() => setCurrentTab('rejected')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    currentTab === 'rejected'
                      ? 'bg-white text-rose-600 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span>已驳回</span>
                  <span className="text-[10px] text-gray-400">({rejectedCount})</span>
                </button>

                <button
                  onClick={() => setCurrentTab('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'all'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  全部 ({reviews.length})
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshingReviews}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all shrink-0 disabled:opacity-50"
                  title="重新从 Supabase 云端拉取最新评教与待审数据"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingReviews ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>刷新数据</span>
                </button>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="搜索教师、课程或内容..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-600 bg-gray-50 focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Reviews List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {filteredReviews.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-4 max-w-lg mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-gray-800">
                      {currentTab === 'pending' ? '当前暂无待审核评教' : '暂无匹配的评价记录'}
                    </h5>
                    <p className="text-xs text-gray-400 mt-1">
                      {currentTab === 'pending'
                        ? '当有学子提交新的课程评教时，系统将汇总至此供您审批公示。'
                        : '您可以通过上方筛选查看其他状态分类。'}
                    </p>
                  </div>

                  {currentTab === 'pending' && (
                    <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-left space-y-2.5">
                      <div className="flex items-start gap-2 text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs font-semibold">
                          若其他账号已提交评价却在此处看不到？
                        </div>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        这是由于 Supabase 数据库默认的 RLS 行级安全策略设置了「仅过审评价可读（status = 'approved'）」，导致数据库拦截了待审评价的读取。
                      </p>
                      <button
                        onClick={copyRlsSqlCode}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        {copiedRlsSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedRlsSql ? '已复制修复 SQL，前往 Supabase 粘贴执行' : '复制修复 reviews 权限 SQL (1步搞定)'}</span>
                      </button>

                      <button
                        onClick={handleCreateTestReview}
                        disabled={isRefreshingReviews}
                        className="w-full py-1.5 bg-white hover:bg-amber-100/70 text-amber-900 border border-amber-300/80 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-700" />
                        <span>一键生成模拟待审评价 (用于验证审批流)</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                filteredReviews.map((rev) => {
                  const teacher = teachers.find((t) => t.id === rev.teacherId);
                  const isProcessing = processingId === rev.id;
                  
                  // Check automated sensitive content scan
                  const sensitiveScan = checkSensitiveContent(rev.comment || '');

                  return (
                    <div
                      key={rev.id}
                      className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-all space-y-3.5"
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-50">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs">
                            {teacher?.name || '任课教师'}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs font-semibold text-gray-800">
                            {rev.courseName}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            ({rev.yearTerm})
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          {rev.status === 'pending' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600 animate-pulse" /> ⏳ 待审核
                            </span>
                          )}
                          {rev.status === 'approved' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> ✓ 已公示 (+20分)
                            </span>
                          )}
                          {rev.status === 'rejected' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-600" /> ✕ 已驳回
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {formatReviewDate(rev.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Dimension Scores */}
                      <div className="flex flex-wrap gap-2 text-[11px] text-gray-600 bg-gray-50/80 p-2.5 rounded-xl">
                        <span className="px-2 py-0.5 bg-white rounded-md border border-gray-100">
                          给分松紧：<strong className="text-emerald-600">{rev.dimensions.gradingLeniency ?? '-'}分</strong>
                        </span>
                        <span className="px-2 py-0.5 bg-white rounded-md border border-gray-100">
                          点名严格：<strong className="text-amber-600">{rev.dimensions.attendanceStrictness ?? '-'}分</strong>
                        </span>
                        <span className="px-2 py-0.5 bg-white rounded-md border border-gray-100">
                          教学质量：<strong className="text-indigo-600">{rev.dimensions.teachingQuality ?? '-'}分</strong>
                        </span>
                        <span className="px-2 py-0.5 bg-white rounded-md border border-gray-100">
                          作业难度：<strong className="text-purple-600">{rev.dimensions.workloadDifficulty ?? '-'}分</strong>
                        </span>
                      </div>

                      {/* Review Comment Content */}
                      <div className="space-y-2">
                        {rev.comment ? (
                          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-xs text-gray-800 leading-relaxed font-sans">
                            “{rev.comment}”
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 italic">（该学生仅提交了六维客观评分，未填写文本评价）</div>
                        )}

                        {/* Automated Sensitive Scan Alert */}
                        {!sensitiveScan.isClean && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="font-semibold">前置安全扫描预警：</strong>
                              {sensitiveScan.reason}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {sensitiveScan.violations.map((v, i) => (
                                  <span key={i} className="px-1.5 py-0.2 bg-amber-200/70 text-amber-900 rounded text-[10px] font-mono">
                                    {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Rejection Reason display if rejected */}
                        {rev.status === 'rejected' && rev.rejectionReason && (
                          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <strong className="font-bold">驳回原因：</strong>
                              {rev.rejectionReason}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Author & Action Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                        <div className="text-[11px] text-gray-500 flex items-center gap-2">
                          <span>作者昵称：<strong>{rev.authorNickname}</strong></span>
                          {rev.userEmail && (
                            <>
                              <span>·</span>
                              <span className="text-gray-400 font-mono">{rev.userEmail}</span>
                            </>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {rev.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(rev)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {isProcessing ? '处理中...' : '【通过公示】(+20分)'}
                              </button>

                              <button
                                onClick={() => {
                                  setRejectingReview(rev);
                                  setSelectedReason(PRESET_REJECTION_REASONS[0]);
                                  setCustomReason('');
                                }}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-white hover:bg-rose-50 active:scale-95 text-rose-600 border border-rose-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                【驳回修改】
                              </button>
                            </>
                          )}

                          {rev.status === 'approved' && (
                            <button
                              onClick={() => {
                                setRejectingReview(rev);
                                setSelectedReason(PRESET_REJECTION_REASONS[0]);
                                setCustomReason('');
                              }}
                              disabled={isProcessing}
                              className="px-2.5 py-1 text-xs text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              撤回并驳回
                            </button>
                          )}

                          {rev.status === 'rejected' && (
                            <button
                              onClick={() => handleApprove(rev)}
                              disabled={isProcessing}
                              className="px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-semibold"
                            >
                              重新通过
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={async () => {
                              if (confirm('确定要彻底删除此条评价吗？')) {
                                await onDeleteReview(rev.id);
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 transition-colors"
                            title="彻底删除此记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
          <span>
            {isAdminAuthenticated ? '✓ 已通过管理员权限认证' : '未授权状态'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1 text-xs text-gray-600 hover:text-gray-900 font-medium"
          >
            关闭窗口
          </button>
        </div>
      </motion.div>

      {/* Reject Reason Modal */}
      <AnimatePresence>
        {rejectingReview && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-600">
                  <XCircle className="w-5 h-5" />
                  <h4 className="font-bold text-sm text-gray-900">驳回此条评价</h4>
                </div>
                <button
                  onClick={() => setRejectingReview(null)}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-gray-500">
                请选择或填写驳回原因，该原因将实时反馈在作者的“个人中心 - 我的评价”中，并允许作者重新修改后提交：
              </p>

              {/* Preset Reason Options */}
              <div className="space-y-2">
                {PRESET_REJECTION_REASONS.map((reason, idx) => (
                  <label
                    key={idx}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedReason === reason && !customReason
                        ? 'bg-rose-50/80 border-rose-200 text-rose-900 font-medium'
                        : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rejection_reason"
                      checked={selectedReason === reason && !customReason}
                      onChange={() => {
                        setSelectedReason(reason);
                        setCustomReason('');
                      }}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>

              {/* Custom Input */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">其他自定义理由：</label>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="如：请补充期末考核占比与平时作业量等关键细节..."
                  rows={2}
                  className="w-full p-2.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-200"
                />
              </div>

              {/* Confirm Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setRejectingReview(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmReject}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-xs"
                >
                  确认驳回通知作者
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
