import React, { useEffect, useState } from 'react';
import { ChevronDown, Clock, MapPin, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabaseService } from '../services/supabaseService';
import { isSupabaseConfigured } from '../lib/supabase';
import type { CourseSection, CourseSectionMeeting, Teacher } from '../types';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** [1,2,3,5,6] -> "1-3,5-6周" */
function formatWeeks(weeks?: number[]): string {
  const list = [...new Set((weeks || []).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!list.length) return '';
  const parts: string[] = [];
  let start = list[0];
  let prev = list[0];
  for (const w of list.slice(1)) {
    if (w === prev + 1) { prev = w; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = w;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return `${parts.join(',')}周`;
}

function meetingTime(m: CourseSectionMeeting): string {
  if (m.rawSchedule) return m.rawSchedule;
  if (m.weekday) return `周${WEEKDAYS[m.weekday - 1]} ${m.periodStart ?? '?'}-${m.periodEnd ?? '?'}节`;
  return '时间待定';
}

function meetingPlace(m: CourseSectionMeeting, section: CourseSection): string {
  return m.rawLocation || m.classroom || (section.campus ? `${section.campus} 教室待定` : '地点待定');
}

/** 老师个人页：本学期开设的全部课程（先看简单列表，点开看详细上课安排） */
export const TeacherTermCourses: React.FC<{ teacher: Teacher }> = ({ teacher }) => {
  const [sections, setSections] = useState<CourseSection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setOpenId(null);
    if (!isSupabaseConfigured) { setSections(null); return; }
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(null); setSections(null);
    supabaseService.getTeacherSections(teacher.id, controller.signal)
      .then(items => { if (active) setSections(items); })
      .catch(e => { if (active && !controller.signal.aborted) setError(e.message || '加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [teacher.id, retry]);

  // 未连接数据库（演示数据）时，只能显示课程名
  const fallbackNames = !isSupabaseConfigured ? (teacher.recentTermCourses || []) : [];

  return (
    <div id="teacher-term-courses">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        本学期开设课程{sections ? ` (${sections.length})` : ''}
      </h4>

      {loading && <div role="status" className="py-3 text-xs text-gray-400">正在加载本学期课程…</div>}

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex items-center justify-between gap-2">
          <span>课程加载失败，请稍后重试</span>
          <button
            type="button"
            onClick={() => setRetry(n => n + 1)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-rose-200 font-semibold"
          >
            <RefreshCw className="w-3 h-3" />重试
          </button>
        </div>
      )}

      {!loading && !error && sections && sections.length === 0 && (
        <p className="py-2 text-xs text-gray-400">本学期暂无该教师的开课信息</p>
      )}

      {fallbackNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fallbackNames.map(name => (
            <span key={name} className="px-2.5 py-1 bg-gray-100 text-gray-800 rounded-lg text-xs font-medium">{name}</span>
          ))}
        </div>
      )}

      {sections && sections.length > 0 && (
        <ul className="space-y-1.5">
          {sections.map(section => {
            const open = openId === section.sectionId;
            return (
              <li key={section.sectionId} className="rounded-xl border border-gray-100 bg-gray-50/70 overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : section.sectionId)}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-gray-100/70 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">{section.courseName || '未命名课程'}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-gray-500">
                      {section.credits != null && <span>{section.credits} 学分</span>}
                      {section.selectionCode && <span className="font-mono">选课号 {section.selectionCode}</span>}
                      {section.campus && <span>{section.campus}</span>}
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-100">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs text-gray-600">
                          {section.courseCode && (<><dt className="text-gray-400">课程号</dt><dd className="font-mono">{section.courseCode}</dd></>)}
                          {section.nature && (<><dt className="text-gray-400">课程性质</dt><dd>{section.nature}</dd></>)}
                          {section.capacity != null && (<><dt className="text-gray-400">容量</dt><dd>{section.capacity} 人</dd></>)}
                          {section.preferred && (<><dt className="text-gray-400">优选班</dt><dd className="break-words">{section.preferred}</dd></>)}
                        </dl>

                        {section.meetings.length > 0 ? (
                          <ul className="space-y-1">
                            {section.meetings.map((m, i) => (
                              <li key={m.id ?? i} className="text-2xs text-gray-700 bg-white rounded-lg border border-gray-100 px-2.5 py-1.5 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span className="font-medium">{meetingTime(m)}</span>
                                  {formatWeeks(m.weeks) && <span className="text-gray-400">· {formatWeeks(m.weeks)}</span>}
                                </div>
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span>{meetingPlace(m, section)}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-2xs text-gray-400">上课时间待定</p>
                        )}
                        <p className="text-3xs text-gray-400">具体上课时间以教务系统为准</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
