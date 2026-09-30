import { formatRating, ratingMatchPercent } from '../lib/ratings';
import React, { useState, useMemo, useEffect } from 'react';
import { supabaseService } from '../services/supabaseService';
import { isSupabaseConfigured } from '../lib/supabase';
import { Pagination, PageFeedback } from './Pagination';
import { Teacher, RecommendationWeights, College, TeacherWithSections, CourseSection } from '../types';
import { POPULAR_COURSES } from '../data/mockTeachers';
import { Sliders, Sparkles, CheckCircle2, ChevronRight, HelpCircle, Star, Award, RotateCcw, Building2, MapPin, Copy, Check, Clock, BookOpen, Calendar, Users, X } from 'lucide-react';

const CAMPUS_OPTIONS = [
  { id: 'all', name: '全部校区' },
  { id: '西部校区', name: '西部校区' },
  { id: '九里校区', name: '九里校区' },
  { id: '峨眉校区', name: '峨眉校区' },
  { id: '东部校区', name: '东部校区' },
];

const WEEKDAY_OPTIONS = [
  { id: 'all', name: '全部日期 (不限)' },
  { id: '1', name: '周一' },
  { id: '2', name: '周二' },
  { id: '3', name: '周三' },
  { id: '4', name: '周四' },
  { id: '5', name: '周五' },
  { id: '6', name: '周六' },
  { id: '7', name: '周日' },
];

interface CourseRecommendProps {
  teachers: Teacher[];
  colleges?: College[];
  userPoints: number;
  onSelectTeacher: (teacher: Teacher) => void;
  onDeductPoints: (amount: number, reason: string, actionCode?: string) => Promise<boolean> | boolean;
}

export const CourseRecommend: React.FC<CourseRecommendProps> = ({
  teachers,
  colleges,
  userPoints,
  onSelectTeacher,
  onDeductPoints,
}) => {
  const [selectedCourse, setSelectedCourse] = useState<string>('高等数学');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  const [selectedWeekday, setSelectedWeekday] = useState<string>('all');
  const [preferredClass, setPreferredClass] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [hasCalculated, setHasCalculated] = useState<boolean>(true);
  const [timetableResults, setTimetableResults] = useState<TeacherWithSections[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => {
        setCopiedCode((curr) => (curr === code ? null : curr));
      }, 1500);
    }).catch(() => {});
  };

  const courseToMatch = searchKeyword.trim() || selectedCourse;
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(null); setTimetableResults([]); setPage(0);
    const timer = setTimeout(() => {
      supabaseService.getTimetableCourseRecommendations(
        courseToMatch,
        selectedCampus,
        selectedCollegeId,
        selectedWeekday,
        preferredClass,
        controller.signal
      )
        .then(items => { if (active) setTimetableResults(items); })
        .catch(error => { if (active) setError(error.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [courseToMatch, selectedCampus, selectedCollegeId, selectedWeekday, preferredClass, retry]);

  // Weights (0 to 100) for user preferences
  const [weights, setWeights] = useState<RecommendationWeights>({
    attendanceStrictness: 70, // 倾向不点名
    gradingLeniency: 90,      // 倾向给分大方
    effortMatters: 60,        // 付出必有回报
    workloadDifficulty: 40,   // 作业尽量少
    approachability: 50,      // 老师好沟通
    teachingQuality: 80       // 讲课干货多
  });

  const handleResetWeights = () => {
    setWeights({
      attendanceStrictness: 60,
      gradingLeniency: 80,
      effortMatters: 50,
      workloadDifficulty: 40,
      approachability: 60,
      teachingQuality: 80
    });
  };

  // Filter candidates:
  // 候选池为本学期开课的授课老师（结合 2026-2027-1 学期课表明细）
  const rankedTeachers = useMemo(() => {
    const courseToMatch = searchKeyword.trim() || selectedCourse;
    if (!courseToMatch) return [];

    const selectedCollegeName = colleges?.find((c) => c.id === selectedCollegeId)?.name;

    let list: Array<{ teacher: Teacher; sections: CourseSection[] }> = [];

    if (isSupabaseConfigured && timetableResults.length > 0) {
      list = timetableResults;
    } else {
      // 本地 Mock 回退模式
      const cleanCourse = courseToMatch.replace(/\s*[\(（][^()（）]+[\)）]/g, '').trim().toLowerCase();
      const filtered = teachers.filter((t) => {
        const matchCourse = t.courses.some((c) =>
          c.toLowerCase().includes(cleanCourse)
        );
        const matchCollege =
          selectedCollegeId === 'all' ||
          t.collegeId === selectedCollegeId ||
          (selectedCollegeName && t.college === selectedCollegeName);

        const matchCampus =
          selectedCampus === 'all' ||
          (selectedCampus === '西部校区'
            ? (t.campus === '犀浦校区' || t.campus === '西部校区')
            : t.campus === selectedCampus);

        return matchCourse && t.isTeachingThisTerm && matchCollege && matchCampus;
      });

      list = filtered.map((t, idx) => {
        const mockWeekday = ((idx * 2) % 5) + 1;
        const mockPreferred = idx % 2 === 0 ? '计算机2024-01班, 软件2024-01班' : '茅以升2024-01班';
        return {
          teacher: t,
          sections: [
            {
              sectionId: `mock_sec_${t.id}_1`,
              selectionCode: `B${(1000 + idx * 37) % 9000}`,
              courseCode: `SWJTU00${100 + idx}`,
              credits: 4,
              nature: '必修',
              campus: t.campus || '西部校区',
              capacity: 60,
              preferred: mockPreferred,
              meetings: [
                {
                  weekday: mockWeekday,
                  periodStart: ((idx % 3) * 2) + 1,
                  periodEnd: ((idx % 3) * 2) + 2,
                  rawSchedule: `1-16周 星期${['一','二','三','四','五'][mockWeekday - 1]} ${((idx % 3) * 2) + 1}-${((idx % 3) * 2) + 2}节`,
                  rawLocation: `${t.campus || '西部校区'} X${2100 + (idx * 17) % 800}`,
                  classroom: `X${2100 + (idx * 17) % 800}`,
                  classroomCampus: t.campus || '西部校区'
                }
              ]
            }
          ]
        };
      }).filter(({ sections }) => {
        if (selectedWeekday !== 'all' && !sections.some(s => s.meetings.some(m => m.weekday === Number(selectedWeekday)))) {
          return false;
        }
        if (preferredClass.trim() && !sections.some(s => s.preferred && s.preferred.includes(preferredClass.trim()))) {
          return false;
        }
        return true;
      });
    }

    return list.map(({ teacher, sections }) => ({
      teacher,
      sections,
      matchPercent: ratingMatchPercent(teacher.dimensions, weights),
    })).sort((a, b) => {
      const aVal = a.matchPercent ?? -1;
      const bVal = b.matchPercent ?? -1;
      if (bVal !== aVal) return bVal - aVal;
      return (b.teacher.reviewCount || 0) - (a.teacher.reviewCount || 0);
    });
  }, [teachers, timetableResults, selectedCourse, searchKeyword, selectedCollegeId, selectedCampus, selectedWeekday, preferredClass, colleges, weights]);
  useEffect(() => { setPage(0); }, [weights, selectedCourse, searchKeyword, selectedCollegeId, selectedCampus, selectedWeekday, preferredClass]);

  return (
    <div id="course-recommend-panel" className="max-w-5xl mx-auto space-y-4 sm:space-y-6 pb-20">
      {/* Title & banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-100 shrink-0">
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">智能选课偏好推荐</h2>
              <p className="text-[11px] sm:text-xs text-gray-500">依据本学期开课教师与加权算法动态匹配</p>
            </div>
          </div>
          <button
            onClick={handleResetWeights}
            className="flex items-center gap-1 text-[11px] sm:text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border border-gray-200 hover:border-indigo-200 transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>重置偏好</span>
          </button>
        </div>
      </div>

      {/* Target Course Selector */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 shadow-2xs space-y-3">
        <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
          第一步：选择或输入想要选的课程名
        </label>
        
        <div className="flex gap-2">
          <input
            id="course-recommend-input"
            type="text"
            placeholder="输入课程名称，如：高等数学、微积分、数据结构..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-gray-50 rounded-2xl border border-gray-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>

        {/* Hot Course Tags */}
        <div className="flex flex-wrap gap-2 pt-1">
          {POPULAR_COURSES.map((course) => (
            <button
              key={course}
              onClick={() => {
                setSelectedCourse(course);
                setSearchKeyword('');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                (!searchKeyword && selectedCourse === course) || searchKeyword === course
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {course}
            </button>
          ))}
        </div>

        {/* Campus, College, Weekday & Preferred Class Filter */}
        <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
          {/* Campus Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
              校区:
            </span>
            <select
              id="course-recommend-campus-select"
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-gray-700 cursor-pointer font-medium"
            >
              {CAMPUS_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* College Filter using college_id foreign key */}
          {colleges && colleges.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                开课学院:
              </span>
              <select
                id="course-recommend-college-select"
                value={selectedCollegeId}
                onChange={(e) => setSelectedCollegeId(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-gray-700 cursor-pointer"
              >
                <option value="all">全部学院 (不限)</option>
                {colleges.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Weekday Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              上课日期:
            </span>
            <select
              id="course-recommend-weekday-select"
              value={selectedWeekday}
              onChange={(e) => setSelectedWeekday(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-gray-700 cursor-pointer font-medium"
            >
              {WEEKDAY_OPTIONS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Preferred Class Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              优选班:
            </span>
            <div className="relative flex items-center">
              <input
                id="course-recommend-preferred-input"
                type="text"
                placeholder="班级关键字，如: 计算机..."
                value={preferredClass}
                onChange={(e) => setPreferredClass(e.target.value)}
                className="text-xs px-2.5 py-1.5 pr-6 bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-gray-700 w-36 sm:w-44 transition-all"
              />
              {preferredClass && (
                <button
                  type="button"
                  onClick={() => setPreferredClass('')}
                  className="absolute right-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="清空优选班筛选"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {(selectedCollegeId !== 'all' || selectedCampus !== 'all' || selectedWeekday !== 'all' || Boolean(preferredClass.trim())) && (
            <button
              onClick={() => {
                setSelectedCollegeId('all');
                setSelectedCampus('all');
                setSelectedWeekday('all');
                setPreferredClass('');
              }}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
            >
              重置筛选
            </button>
          )}
        </div>
      </div>

      {/* 6 Dimensions Weight Sliders */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">第二步：调节你的个性化选课权重</h3>
            <p className="text-xs text-gray-400">滑动增加你在意的维度权重，系统将即时重新计算排序</p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            加权匹配算分
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* 1. 考勤宽松度偏好 */}
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-800">不想被点名 (逃课友好)</span>
              <span className="font-bold text-amber-600">{weights.attendanceStrictness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.attendanceStrictness}
              onChange={(e) => setWeights({ ...weights, attendanceStrictness: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>无所谓点名</span>
              <span>坚决不点名</span>
            </div>
          </div>

          {/* 2. 给分宽松度 */}
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-800">给分大方 (保高绩点)</span>
              <span className="font-bold text-emerald-600">{weights.gradingLeniency}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.gradingLeniency}
              onChange={(e) => setWeights({ ...weights, gradingLeniency: Number(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>正常均分</span>
              <span>超大方给A</span>
            </div>
          </div>

          {/* 3. 给分努力回报 */}
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-800">付出必有回报 (努力回报)</span>
              <span className="font-bold text-blue-600">{weights.effortMatters}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.effortMatters}
              onChange={(e) => setWeights({ ...weights, effortMatters: Number(e.target.value) })}
              className="w-full accent-blue-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>不太在意</span>
              <span>越努力分越高</span>
            </div>
          </div>

          {/* 4. 作业量/难度 */}
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-800">少作业轻负担 (课后省心)</span>
              <span className="font-bold text-purple-600">{weights.workloadDifficulty}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.workloadDifficulty}
              onChange={(e) => setWeights({ ...weights, workloadDifficulty: Number(e.target.value) })}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>能写大作业</span>
              <span>少布置作业</span>
            </div>
          </div>

          {/* 5. 亲和力 */}
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-800">老师亲切好沟通 (答疑耐心)</span>
              <span className="font-bold text-pink-600">{weights.approachability}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.approachability}
              onChange={(e) => setWeights({ ...weights, approachability: Number(e.target.value) })}
              className="w-full accent-pink-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>不限性格</span>
              <span>温柔和蔼</span>
            </div>
          </div>

          {/* 6. 课程教学质量 */}
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-800">教学质量高 (干货满满)</span>
              <span className="font-bold text-indigo-600">{weights.teachingQuality}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.teachingQuality}
              onChange={(e) => setWeights({ ...weights, teachingQuality: Number(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>过考就行</span>
              <span>讲课封神透彻</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation Results (仅展示排序，候选池为本学期开课老师) */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              本学期开课教师推荐排序
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              已自动剔除本学期未开课教师，按偏好加权总分自高向低排列
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            找到 {rankedTeachers.length} 位在教老师
          </span>
        </div>

        <PageFeedback loading={loading} error={error} onRetry={() => setRetry(value => value + 1)} />
        {loading || error ? null : rankedTeachers.length === 0 ? (
          <div className="py-12 text-center text-gray-400 space-y-2">
            <p className="text-sm font-medium">本学期暂无开设该课程的教师数据</p>
            <p className="text-xs text-gray-400">试试热门课程：高等数学、微积分、数据结构、大学物理</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rankedTeachers.slice(page * 20, (page + 1) * 20).map(({ teacher, sections, matchPercent }, index) => (
              <div
                key={teacher.id}
                onClick={() => onSelectTeacher(teacher)}
                className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-150 hover:border-indigo-300 bg-white hover:bg-indigo-50/20 transition-all cursor-pointer group shadow-2xs hover:shadow-md space-y-3"
              >
                {/* Top teacher summary */}
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      page === 0 && index === 0
                        ? 'bg-amber-500 text-white shadow-xs' 
                        : page === 0 && index === 1
                        ? 'bg-slate-400 text-white' 
                        : page === 0 && index === 2
                        ? 'bg-amber-700/60 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {page * 20 + index + 1}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-gray-900 text-base group-hover:text-indigo-600 transition-colors">
                          {teacher.name}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">{teacher.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {teacher.college}
                        </span>
                        {teacher.campus && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600">
                            {teacher.campus}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>综合评分: <strong className="text-amber-600">{formatRating(teacher.overallScore)}</strong></span>
                        <span>·</span>
                        <span>评价数: {teacher.reviewCount}条</span>
                      </div>
                    </div>
                  </div>

                  {/* Match percentage pill */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm ${
                      matchPercent !== null
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                        : 'bg-gray-50 border border-gray-200 text-gray-500 font-medium'
                    }`}>
                      <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500" />
                      <span>{matchPercent === null ? '新开课 · 尚无评分' : `${matchPercent}% 契合`}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors font-medium">
                      教师主页 <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>

                {/* Tags if present */}
                {teacher.tags && teacher.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {teacher.tags.slice(0, 4).map((tag, tIdx) => (
                      <span key={tIdx} className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50/60 text-indigo-700 font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Teaching Sections from 2026-2027-1 timetable */}
                {sections && sections.length > 0 && (
                  <div className="pt-2.5 border-t border-gray-100 space-y-2">
                    <div className="text-[11px] font-semibold text-gray-500 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                        <span>本学期教学班排课明细 ({sections.length}个班/时段):</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-normal">点击选课号可一键复制</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sections.map((sec, sIdx) => (
                        <div
                          key={sec.sectionId || sec.selectionCode || sIdx}
                          className="p-2.5 rounded-xl bg-gray-50/80 hover:bg-white border border-gray-200/80 hover:border-indigo-200 transition-all shadow-2xs space-y-1.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-gray-800 bg-white border border-gray-200 px-1.5 py-0.5 rounded text-[11px]">
                                选课号: {sec.selectionCode}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyCode(sec.selectionCode);
                                }}
                                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                title="复制选课号"
                              >
                                {copiedCode === sec.selectionCode ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-600 font-semibold">已复制</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>复制</span>
                                  </>
                                )}
                              </button>

                              {/* Course Code */}
                              {sec.courseCode && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyCode(sec.courseCode!);
                                  }}
                                  className="font-mono text-gray-600 bg-white border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 px-1.5 py-0.5 rounded text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  title="点击复制课程代码"
                                >
                                  <span>代码: {sec.courseCode}</span>
                                  {copiedCode === sec.courseCode ? (
                                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5 text-gray-400" />
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Class Capacity */}
                            {sec.capacity != null ? (
                              <span className="text-[10px] text-gray-600 font-medium px-2 py-0.5 rounded-md bg-white border border-gray-200 shrink-0">
                                容量: {sec.capacity}人
                              </span>
                            ) : null}
                          </div>

                          {/* Preferred Class Display */}
                          {sec.preferred && (
                            <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-slate-100/90 border border-slate-200/90 text-slate-700">
                              <Users className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span className="font-semibold text-gray-700 shrink-0">优选班:</span>
                              <span
                                className={`truncate ${
                                  preferredClass.trim() && sec.preferred.toLowerCase().includes(preferredClass.trim().toLowerCase())
                                    ? 'font-bold text-indigo-700 bg-amber-100/80 px-1 rounded'
                                    : 'text-gray-600'
                                }`}
                                title={sec.preferred}
                              >
                                {sec.preferred}
                              </span>
                            </div>
                          )}

                          {/* Meeting schedules */}
                          {sec.meetings && sec.meetings.length > 0 ? (
                            <div className="space-y-1 text-[11px] text-gray-600">
                              {sec.meetings.map((m, mIdx) => {
                                const isSelectedDay = selectedWeekday !== 'all' && m.weekday === Number(selectedWeekday);
                                return (
                                  <div
                                    key={mIdx}
                                    className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 transition-colors ${
                                      isSelectedDay
                                        ? 'bg-amber-50/90 border border-amber-200 text-amber-900 rounded-md px-1.5 py-0.5 font-medium'
                                        : ''
                                    }`}
                                  >
                                    <span className="flex items-center gap-1 text-gray-800">
                                      <Clock className={`w-3 h-3 shrink-0 ${isSelectedDay ? 'text-amber-600' : 'text-indigo-500'}`} />
                                      {m.rawSchedule || (m.weekday ? `周${['一','二','三','四','五','六','日'][m.weekday - 1]} ${m.periodStart}-${m.periodEnd}节` : '时间待定')}
                                    </span>
                                    <span className="flex items-center gap-1 text-gray-500">
                                      <MapPin className={`w-3 h-3 shrink-0 ${isSelectedDay ? 'text-amber-600' : 'text-rose-500'}`} />
                                      {m.rawLocation || m.classroom || (sec.campus ? `${sec.campus} 教室待定` : '地点待定')}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[11px] text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{sec.campus || '校区'} · 具体上课时间以教务系统为准</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} total={rankedTeachers.length} loading={loading} onPageChange={setPage} />
      </div>
    </div>
  );
};
