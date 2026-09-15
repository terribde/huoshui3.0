import React, { useState } from 'react';
import { Teacher, Review } from '../types';
import { X, Star, Heart, Award, Sparkles, AlertCircle, History, MessageSquarePlus, ThumbsUp, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TeacherDetailModalProps {
  teacher: Teacher | null;
  reviews: Review[];
  onClose: () => void;
  onOpenReview: (teacher: Teacher) => void;
  onLikeReview: (reviewId: string) => void;
}

export const TeacherDetailModal: React.FC<TeacherDetailModalProps> = ({
  teacher,
  reviews,
  onClose,
  onOpenReview,
  onLikeReview,
}) => {
  const [activeTab, setActiveTab] = useState<'reviews' | 'dimensions'>('dimensions');

  if (!teacher) return null;

  const teacherReviews = reviews.filter((r) => r.teacherId === teacher.id);

  // 6 dimensions specifications according to PRD
  const dimensionConfigs = [
    {
      key: 'attendanceStrictness',
      label: '点名/签到严格度',
      desc: '1分从不点名 ↔ 5分每次必点',
      value: teacher.dimensions.attendanceStrictness,
      color: 'bg-amber-500',
      tag: teacher.dimensions.attendanceStrictness <= 2 ? '极少点名' : teacher.dimensions.attendanceStrictness >= 4.5 ? '逢课必点' : '偶尔抽查'
    },
    {
      key: 'gradingLeniency',
      label: '给分松紧度',
      desc: '1分给分极紧 ↔ 5分大方保A',
      value: teacher.dimensions.gradingLeniency,
      color: 'bg-emerald-500',
      tag: teacher.dimensions.gradingLeniency >= 4.5 ? '给分超大方' : teacher.dimensions.gradingLeniency <= 2.5 ? '给分严格' : '按卷面折算'
    },
    {
      key: 'effortMatters',
      label: '给分是否看努力',
      desc: '1分躺平高分 ↔ 5分必须认真投入',
      value: teacher.dimensions.effortMatters,
      color: 'bg-blue-500',
      tag: teacher.dimensions.effortMatters >= 4.5 ? '付出会回报' : '作业随缘'
    },
    {
      key: 'workloadDifficulty',
      label: '作业量 / 难度',
      desc: '1分作业极少 ↔ 5分大作业连环',
      value: teacher.dimensions.workloadDifficulty,
      color: 'bg-purple-500',
      tag: teacher.dimensions.workloadDifficulty <= 2 ? '作业轻松' : teacher.dimensions.workloadDifficulty >= 4 ? '作业硬核' : '题量适中'
    },
    {
      key: 'approachability',
      label: '课后答疑亲和力',
      desc: '1分高冷难约 ↔ 5分秒回耐心',
      value: teacher.dimensions.approachability,
      color: 'bg-pink-500',
      tag: teacher.dimensions.approachability >= 4.7 ? '亦师亦友' : '严肃治学'
    },
    {
      key: 'teachingQuality',
      label: '课程教学质量',
      desc: '1分照念PPT ↔ 5分干货拉满',
      value: teacher.dimensions.teachingQuality,
      color: 'bg-indigo-500',
      tag: teacher.dimensions.teachingQuality >= 4.7 ? '封神好课' : '通俗易懂'
    }
  ];

  return (
    <div id="teacher-detail-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      {/* Modal Dialog Card */}
      <motion.div 
        id="teacher-detail-content" 
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 bg-white w-full max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-md shadow-indigo-100">
              {teacher.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-gray-900">{teacher.name}</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  {teacher.title}
                </span>
                {teacher.isTeachingThisTerm ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 本学期开课
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    本学期未开课
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {teacher.college} · {teacher.campus}
              </p>
            </div>
          </div>
          <motion.button 
            id="close-teacher-detail-btn"
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Quick Stats Bar */}
        <div className="px-5 py-3 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 font-bold text-amber-600">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-base">{teacher.overallScore.toFixed(1)}</span>
              <span className="text-gray-400 font-normal">/ 5.0</span>
            </div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3 h-3 ${
                    s <= Math.round(teacher.overallScore)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-gray-200 fill-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">评价数: {teacher.reviewCount}条</span>
            {teacher.hasHistoricalData && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[11px] font-medium border border-blue-100 flex items-center gap-1">
                <History className="w-3 h-3" /> 含2024前迁移
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 px-5 pt-2">
          <button
            id="tab-dimensions-btn"
            onClick={() => setActiveTab('dimensions')}
            className={`pb-2.5 text-sm font-semibold transition-colors relative mr-6 ${
              activeTab === 'dimensions' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            六维评价体系 (PRD标准)
            {activeTab === 'dimensions' && (
              <motion.div 
                layoutId="modalTabLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" 
              />
            )}
          </button>
          <button
            id="tab-reviews-btn"
            onClick={() => setActiveTab('reviews')}
            className={`pb-2.5 text-sm font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'reviews' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            学生真实评价
            <span className="px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-full text-xs">
              {teacherReviews.length}
            </span>
            {activeTab === 'reviews' && (
              <motion.div 
                layoutId="modalTabLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" 
              />
            )}
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'dimensions' ? (
            <div className="space-y-4">
              {/* Courses taught */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">主讲课程</h4>
                <div className="flex flex-wrap gap-1.5">
                  {teacher.courses.map((course, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-medium transition-colors">
                      {course}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {teacher.tags.map((tag, idx) => (
                  <span key={idx} className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100">
                    #{tag}
                  </span>
                ))}
              </div>

              {/* 6 Dimension Details */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900">维度打分细则</h4>
                  <span className="text-xs text-gray-400">各维度独立可并存 (1-5分)</span>
                </div>

                <div className="space-y-3.5">
                  {dimensionConfigs.map((dim, idx) => (
                    <div key={dim.key} className="bg-gray-50/70 p-3 rounded-2xl border border-gray-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-800">{dim.label}</span>
                          <span className="text-[10px] text-gray-400">({dim.desc})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-900">{dim.value.toFixed(1)}分</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-2xs">
                            {dim.tag}
                          </span>
                        </div>
                      </div>
                      {/* Animated Progress Bar */}
                      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(dim.value / 5) * 100}%` }}
                          transition={{ duration: 0.6, delay: idx * 0.06 + 0.1, ease: 'easeOut' }}
                          className={`h-full ${dim.color} rounded-full`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data migration footnote */}
              {teacher.hasHistoricalData && (
                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">历史数据迁移提示 (PRD 4.1)</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      本教师包含原网站2024年前评价迁移。亲和力与课程质量继承历史分数；新拆分的「给分松紧度」和「是否看努力」正在持续积累最新学生评测。
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {teacherReviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">暂无该老师的文字评价</p>
                  <p className="text-xs mt-1">成为第一个评价的人，审核通过可得 +20 积分！</p>
                </div>
              ) : (
                teacherReviews.map((rev) => (
                  <motion.div 
                    key={rev.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800">{rev.authorNickname}</span>
                        <span className="text-[11px] text-gray-400">{rev.yearTerm}</span>
                      </div>
                      {rev.isHistoricalMigrated && (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                          老站迁移
                        </span>
                      )}
                    </div>
                    {rev.comment && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {rev.comment}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100/60 text-xs">
                      <span className="text-[11px] text-gray-400">课程：{rev.courseName}</span>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onLikeReview(rev.id)}
                        className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{rev.likes}</span>
                      </motion.button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            真实上课体验可获审核积分
          </div>
          <motion.button
            id="write-teacher-review-btn"
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => onOpenReview(teacher)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-100 transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            评价这位老师 (+20分)
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
