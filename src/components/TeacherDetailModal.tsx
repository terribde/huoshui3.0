import { ModalFrame } from './ModalFrame';
import { formatRating, isRating } from '../lib/ratings';
import { RatingRadar } from './RatingRadar';
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
  likedReviewIds: Set<string>;
  pendingLikeIds: Set<string>;
  likesLoading: boolean;
}

export const TeacherDetailModal: React.FC<TeacherDetailModalProps> = ({
  teacher,
  reviews,
  onClose,
  onOpenReview,
  onLikeReview, likedReviewIds, pendingLikeIds, likesLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'reviews' | 'dimensions'>('dimensions');

  if (!teacher) return null;

  // Only approved reviews are visible on the public teacher page (PRD moderation spec)
  const teacherReviews = reviews.filter(
    (r) => r.teacherId === teacher.id && (r.status === 'approved' || (!r.status && !r.isHistoricalMigrated))
  );

  return (
    <ModalFrame id="teacher-detail-modal" label="教师详情" onClose={onClose}>
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
        className="modal-panel relative z-10 bg-white w-full max-w-lg h-[88vh] h-[88dvh] sm:h-auto max-h-[88vh] max-h-[88dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="shrink-0 p-5 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start gap-3.5">
            <div className="w-13 h-13 shrink-0 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-md shadow-indigo-100">
              {teacher.name.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
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
            data-modal-close aria-label="关闭窗口"
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Quick Stats Bar */}
        <div className="shrink-0 px-5 py-3 bg-gray-50/70 border-b border-gray-100 flex flex-wrap gap-2 items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 font-bold text-amber-600">
              <Star className={`w-4 h-4 ${isRating(teacher.overallScore) ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
              <span className={isRating(teacher.overallScore) ? 'text-base' : 'text-sm text-gray-500'}>{formatRating(teacher.overallScore)}</span>
              {isRating(teacher.overallScore) && <span className="text-gray-400 font-normal">/ 5.0</span>}
            </div>
            {isRating(teacher.overallScore) && <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3 h-3 ${
                    s <= Math.round(teacher.overallScore!)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-gray-200 fill-gray-200'
                  }`}
                />
              ))}
            </div>}
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
        <div className="shrink-0 flex border-b border-gray-100 px-5 pt-2">
          <button
            id="tab-dimensions-btn"
            onClick={() => setActiveTab('dimensions')}
            className={`pb-2.5 text-sm font-semibold transition-colors relative mr-6 ${
              activeTab === 'dimensions' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            六维评价
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
        <div className="p-5 pb-6 overflow-y-auto min-h-0 space-y-4 flex-1 overscroll-contain">
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

              <RatingRadar dimensions={teacher.dimensions} />

              {/* Data migration footnote */}
              {teacher.hasHistoricalData && (
                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">历史数据迁移提示 (PRD 4.1)</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      本教师包含原网站2024年前评价迁移。亲和力与课程质量继承历史分数；新拆分的「给分宽松度」和「努力回报」正在持续积累最新学生评测。
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
                  <div 
                    key={rev.id}
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
                        disabled={!rev.remote || likesLoading || pendingLikeIds.has(rev.id)}
                        aria-pressed={likedReviewIds.has(rev.id)}
                        aria-label={likedReviewIds.has(rev.id) ? "取消点赞" : "点赞"}
                        title={!rev.remote ? "示例评价不支持云端点赞" : undefined}
                        className={`min-h-11 px-2 flex items-center gap-1 rounded-lg transition-colors disabled:opacity-40 ${likedReviewIds.has(rev.id) ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:text-indigo-600"}`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{rev.likes}</span>
                      </motion.button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="shrink-0 p-4 pb-7 sm:pb-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
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
    </ModalFrame>
  );
};
