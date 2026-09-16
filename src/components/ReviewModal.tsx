import React, { useState } from 'react';
import { Teacher, Review } from '../types';
import { X, CheckCircle, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { AnimatedDropdown } from './AnimatedDropdown';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: Teacher[];
  preselectedTeacher?: Teacher | null;
  onSubmitReview: (review: Omit<Review, 'id' | 'createdAt' | 'likes'>) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  onClose,
  teachers,
  preselectedTeacher,
  onSubmitReview,
}) => {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    preselectedTeacher?.id || (teachers[0]?.id ?? '')
  );
  const [selectedCourse, setSelectedCourse] = useState<string>(
    preselectedTeacher?.courses[0] || (teachers[0]?.courses[0] ?? '')
  );
  const [yearTerm, setYearTerm] = useState<string>('2024秋季');
  const [comment, setComment] = useState<string>('');
  const [nickname, setNickname] = useState<string>('犀浦小火车');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<boolean>(false);

  // 6 dimensions state
  const [dimensions, setDimensions] = useState({
    attendanceStrictness: 3,
    gradingLeniency: 4,
    effortMatters: 4,
    workloadDifficulty: 3,
    approachability: 4,
    teachingQuality: 4,
  });

  const currentTeacher = teachers.find((t) => t.id === selectedTeacherId) || teachers[0];

  const handleTeacherChange = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    const t = teachers.find((x) => x.id === teacherId);
    if (t && t.courses.length > 0) {
      setSelectedCourse(t.courses[0]);
    }
  };

  const handleDimensionChange = (key: keyof typeof dimensions, value: number) => {
    setDimensions((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (comment.trim()) {
      if (comment.trim().length < 5) {
        alert('评价文字略显单薄，请至少写出5个字以上的具体上课或考核体验，避免空泛注水哦！');
        return;
      }
      const bannedKeywords = ['傻逼', '垃圾老师', '去死', '骗子'];
      if (bannedKeywords.some((w) => comment.includes(w))) {
        alert('评价内容包含不当言论或人身攻击，已被拦截。请基于学术客观性与真实上课体验描述。');
        return;
      }
    }

    setIsSubmitting(true);

    setTimeout(() => {
      onSubmitReview({
        teacherId: selectedTeacherId,
        teacherName: currentTeacher ? currentTeacher.name : '未知老师',
        courseName: selectedCourse || currentTeacher?.courses[0] || '通识课',
        yearTerm,
        dimensions,
        comment: comment.trim() || undefined,
        authorNickname: nickname || '交大学子',
        isHistoricalMigrated: false,
        status: 'approved',
      });

      setIsSubmitting(false);
      setSuccessNotice(true);
      setTimeout(() => {
        setSuccessNotice(false);
        onClose();
      }, 1400);
    }, 500);
  };

  const dimensionDefinitions = [
    {
      key: 'attendanceStrictness' as const,
      label: '点名 / 签到严格度',
      desc: '1 = 从不点名，5 = 每次必点',
      lowDesc: '从不点名',
      highDesc: '每节必点',
    },
    {
      key: 'gradingLeniency' as const,
      label: '给分松紧度',
      desc: '1 = 极其严格，5 = 大方保高绩点',
      lowDesc: '手紧给分低',
      highDesc: '大方好拿A',
    },
    {
      key: 'effortMatters' as const,
      label: '给分是否看努力',
      desc: '1 = 躺平拿分，5 = 认真必高分 (独立于松紧度)',
      lowDesc: '躺平随缘',
      highDesc: '越努力分越高',
    },
    {
      key: 'workloadDifficulty' as const,
      label: '作业量 / 难度',
      desc: '1 = 作业少无压力，5 = 大作业量大烧脑',
      lowDesc: '基本无作业',
      highDesc: '连环硬核大作业',
    },
    {
      key: 'approachability' as const,
      label: '师生亲和力',
      desc: '1 = 严肃难沟通，5 = 极易相处温柔',
      lowDesc: '高冷严肃',
      highDesc: '超好沟通',
    },
    {
      key: 'teachingQuality' as const,
      label: '课程教学质量',
      desc: '1 = 照念课件，5 = 干货满满讲得透',
      lowDesc: '划水照念',
      highDesc: '干货封神',
    },
  ];

  return (
    <div id="review-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      <motion.div 
        id="review-modal-content"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 bg-white w-full max-w-xl h-[88vh] h-[88dvh] sm:h-auto max-h-[88vh] max-h-[88dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h3 className="text-lg font-bold text-gray-900">撰写教师评价 & 打分</h3>
            <p className="text-xs text-gray-500">
              PRD标准六维打分 · 审核通过可获得 <strong className="text-amber-600">+20 积分</strong>
            </p>
          </div>
          <motion.button 
            id="close-review-modal-btn"
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {successNotice ? (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-12 flex flex-col items-center justify-center text-center space-y-3 flex-1"
          >
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
              className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"
            >
              <CheckCircle className="w-8 h-8" />
            </motion.div>
            <h4 className="text-xl font-bold text-gray-900">评价提交成功！</h4>
            <p className="text-sm text-gray-500 max-w-xs">
              系统已快速过审入库，<strong className="text-amber-600">+20 积分</strong>已发放至您的账户！
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-5 pb-6 overflow-y-auto min-h-0 space-y-5 flex-1 overscroll-contain">
              {/* Teacher & Course Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">选择老师</label>
                  <AnimatedDropdown
                    id="review-teacher-select"
                    className="w-full"
                    value={selectedTeacherId}
                    onChange={handleTeacherChange}
                    options={teachers.map((t) => ({
                      value: t.id,
                      label: t.name,
                      badge: t.college,
                    }))}
                    searchable
                    placeholder="请选择教师..."
                    buttonClassName="w-full bg-gray-50 hover:bg-gray-100/90 text-gray-800 rounded-xl px-3.5 py-2.5 border border-gray-200"
                    menuClassName="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">修读课程</label>
                  <AnimatedDropdown
                    id="review-course-select"
                    className="w-full"
                    value={selectedCourse}
                    onChange={setSelectedCourse}
                    options={(currentTeacher?.courses || []).map((c) => ({
                      value: c,
                      label: c,
                    }))}
                    placeholder="请选择修读课程..."
                    buttonClassName="w-full bg-gray-50 hover:bg-gray-100/90 text-gray-800 rounded-xl px-3.5 py-2.5 border border-gray-200"
                    menuClassName="w-full"
                  />
                </div>
              </div>

              {/* Term and Nickname */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">修读学期</label>
                  <input
                    type="text"
                    value={yearTerm}
                    onChange={(e) => setYearTerm(e.target.value)}
                    placeholder="如：2024秋季"
                    className="w-full px-3.5 py-2 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">发布者昵称</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="匿名昵称"
                    className="w-full px-3.5 py-2 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 6 Dimension Sliders / Buttons */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h4 className="text-sm font-bold text-gray-900">多维度真实打分 (必填，1-5分)</h4>
                  <span className="text-[11px] text-gray-400">独立打分互不排斥</span>
                </div>

                <div className="space-y-3">
                  {dimensionDefinitions.map((item) => (
                    <div 
                      key={item.key} 
                      className="p-3 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-800">{item.label}</span>
                        <span className="font-bold text-indigo-600 text-sm">
                          {dimensions[item.key]} 分
                        </span>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-[11px] text-gray-400 w-18">{item.lowDesc}</span>
                        <div className="flex-1 flex justify-between gap-1.5">
                          {[1, 2, 3, 4, 5].map((score) => (
                            <motion.button
                              type="button"
                              key={score}
                              whileTap={{ scale: 0.85 }}
                              whileHover={{ scale: 1.05 }}
                              onClick={() => handleDimensionChange(item.key, score)}
                              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                dimensions[item.key] === score
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-white hover:bg-gray-100 text-gray-600 border border-gray-200'
                              }`}
                            >
                              {score}
                            </motion.button>
                          ))}
                        </div>
                        <span className="text-[11px] text-gray-400 w-20 text-right">{item.highDesc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional Text Comment */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    课程评价文字（选填，PRD：打分与文字不强绑）
                  </label>
                  <span className="text-[11px] text-emerald-600 font-medium">写文字上课体验更容易过审</span>
                </div>
                <textarea
                  id="review-comment-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="写下真实的考核方式、平时作业量、大作业要求、期末划重点情况等..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-gray-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white resize-none"
                />
              </div>

              {/* Policy note */}
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2 text-[11px] text-blue-800">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>社区公约 (PRD 8)：</strong>严禁注水评价（如仅输入“很好”）及人身攻击、虚假编造事实。宽松审核，真实体验即可通过。
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 pb-7 sm:pb-4 border-t border-gray-100 bg-white flex items-center justify-between">
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
              >
                取消
              </motion.button>
              <motion.button
                id="submit-review-btn"
                type="submit"
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-100 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? '正在提交...' : '提交打分 (+20积分)'}
              </motion.button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};
