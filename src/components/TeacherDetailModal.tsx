import { ModalFrame } from './ModalFrame';
import { formatRating, isRating, RATING_DIMENSIONS } from '../lib/ratings';
import { RatingRadar } from './RatingRadar';
import { TeacherTermCourses } from './TeacherTermCourses';
import { usePagedQuery } from '../hooks/usePagedQuery';
import { supabaseService } from '../services/supabaseService';
import { isSupabaseConfigured } from '../lib/supabase';
import { Pagination, PageFeedback } from './Pagination';
import { ReviewListSkeleton } from './Skeletons';
import React, { useState, useEffect, useRef } from 'react';
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
  refreshToken?: number;
}

const DETAIL_TABS = [
  { id: 'dimensions', label: '六维评价' },
  { id: 'reviews', label: '学生真实评价' },
  { id: 'courses', label: '本学期开设课程' },
] as const;
type DetailTab = typeof DETAIL_TABS[number]['id'];

export const TeacherDetailModal: React.FC<TeacherDetailModalProps> = ({
  teacher,
  reviews,
  onClose,
  onOpenReview,
  onLikeReview, likedReviewIds, pendingLikeIds, likesLoading, refreshToken,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('dimensions');
  const [coursesTeacherId, setCoursesTeacherId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const selectTab = (tab: DetailTab) => {
    setActiveTab(tab);
    if (tab === 'courses' && teacher) setCoursesTeacherId(teacher.id);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  useEffect(() => {
    setActiveTab('dimensions');
    setCoursesTeacherId(null);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [teacher?.id]);

  const page = usePagedQuery<Review>(teacher?.id || '', (index, signal) => {
    if (isSupabaseConfigured) return supabaseService.getReviewsPage({ teacherId: teacher!.id, status: 'approved', page: index }, signal);
    const items = reviews.filter(r => r.teacherId === teacher?.id && r.status === 'approved');
    return Promise.resolve({ items: items.slice(index * 20, (index + 1) * 20), total: items.length });
  }, Boolean(teacher) && activeTab === 'reviews', likedReviewIds);
  useEffect(() => { page.reload(); }, [refreshToken]);

  if (!teacher) return null;

  // Only approved reviews are visible on the public teacher page
  const teacherReviews = page.items;

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
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-2xs font-medium border border-blue-100 flex items-center gap-1">
                <History className="w-3 h-3" /> 含旧站评价
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label="教师详情内容" className="shrink-0 flex justify-start gap-3 overflow-x-auto border-b border-gray-100 px-3 sm:px-5 pt-2">
          {DETAIL_TABS.map((tab, index) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}-btn`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`teacher-${tab.id}-panel`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === 'ArrowRight') next = (index + 1) % DETAIL_TABS.length;
                else if (event.key === 'ArrowLeft') next = (index + DETAIL_TABS.length - 1) % DETAIL_TABS.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = DETAIL_TABS.length - 1;
                else return;
                event.preventDefault();
                selectTab(DETAIL_TABS[next].id);
                document.getElementById(`tab-${DETAIL_TABS[next].id}-btn`)?.focus();
              }}
              className={`min-h-11 pb-2.5 text-xs sm:text-sm font-semibold transition-colors relative flex shrink-0 items-center gap-1 whitespace-nowrap ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
              {tab.id === 'reviews' && (
                <span className="px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-full text-2xs sm:text-xs">
                  {activeTab === 'reviews' && !page.loading && !page.error ? page.total : teacher.reviewCount}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="modalTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Modal Scroll Content */}
        <div ref={contentRef} className="p-5 pb-6 overflow-y-auto min-h-0 flex-1 overscroll-contain">
          <div id="teacher-dimensions-panel" role="tabpanel" aria-labelledby="tab-dimensions-btn" hidden={activeTab !== 'dimensions'} tabIndex={0}>
          {activeTab === 'dimensions' && (
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
            </div>
          )}
          </div>
          <div id="teacher-reviews-panel" role="tabpanel" aria-labelledby="tab-reviews-btn" hidden={activeTab !== 'reviews'} tabIndex={0}>
          {activeTab === 'reviews' && (
            <div className="space-y-3">
              <PageFeedback loading={false} error={page.error} onRetry={page.reload} />
              {page.loading ? (
                <ReviewListSkeleton count={3} />
              ) : page.error ? null : teacherReviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">暂无该老师的文字评价</p>
                  <p className="text-xs mt-1">成为第一个评价的人，审核通过可得 +20 积分！</p>
                </div>
              ) : (
                teacherReviews.map((rev) => {
                  const reviewDate = rev.createdAt ? rev.createdAt.slice(0, 10) : '';
                  const ratedDims = RATING_DIMENSIONS.filter(d => isRating(rev.dimensions?.[d.key]));
                  const overallScore = ratedDims.length > 0
                    ? (ratedDims.reduce((acc, d) => acc + (rev.dimensions[d.key] as number), 0) / ratedDims.length).toFixed(1)
                    : null;

                  return (
                    <div 
                      key={rev.id}
                      className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-800">{rev.authorNickname}</span>
                          <span className="text-2xs text-gray-400">{rev.yearTerm}</span>
                          {reviewDate && (
                            <>
                              <span className="text-gray-300 text-3xs">·</span>
                              <span className="text-2xs text-gray-400">{reviewDate}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {overallScore && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold font-mono">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{overallScore}分</span>
                            </span>
                          )}
                          {rev.isHistoricalMigrated && (
                            <span className="text-3xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                              老站迁移
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dimension Specific Scores */}
                      {ratedDims.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {ratedDims.map(d => (
                            <span
                              key={d.key}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/70 border border-indigo-100/80 text-2xs text-slate-700"
                            >
                              <span className="text-slate-500">{d.label}</span>
                              <span className="font-bold font-mono text-indigo-600">
                                {rev.dimensions[d.key]!.toFixed(1)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {rev.comment && (
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {rev.comment}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1 border-t border-gray-100/60 text-xs">
                        <span className="text-2xs text-gray-400">课程：{rev.courseName}</span>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={async () => { await onLikeReview(rev.id); page.reload(); }}
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
                  );
                })
              )}
              <Pagination page={page.page} total={page.total} loading={page.loading} onPageChange={page.setPage} />
            </div>
          )}
          </div>
          <div id="teacher-courses-panel" role="tabpanel" aria-labelledby="tab-courses-btn" hidden={activeTab !== 'courses'} tabIndex={0}>
            {/* Mount on first visit, then keep course data and expanded details while switching tabs. */}
            {coursesTeacherId === teacher.id && <TeacherTermCourses key={teacher.id} teacher={teacher} />}
          </div>
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
