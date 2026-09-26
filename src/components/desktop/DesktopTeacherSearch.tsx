import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Teacher, College } from '../../types';
import { SWJTU_COLLEGES } from '../../data/mockTeachers';
import { 
  Search, 
  Star, 
  CheckCircle2, 
  ChevronRight, 
  History, 
  ArrowUpDown, 
  BookOpen, 
  X,
  SlidersHorizontal,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedDropdown } from '../AnimatedDropdown';

interface DesktopTeacherSearchProps {
  teachers: Teacher[];
  colleges?: College[];
  onSelectTeacher: (teacher: Teacher) => void;
  onOpenReview?: (teacher?: Teacher) => void;
  initialSearch?: string;
}

export const DesktopTeacherSearch: React.FC<DesktopTeacherSearchProps> = ({
  teachers,
  colleges,
  onSelectTeacher,
  onOpenReview,
  initialSearch = '',
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [selectedCollege, setSelectedCollege] = useState<string>('all');
  const [onlyThisTerm, setOnlyThisTerm] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'overall' | 'leniency' | 'quality' | 'attendance'>('overall');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search suggestions on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const collegeOptions = useMemo(() => {
    if (colleges && colleges.length > 0) {
      return [
        { value: 'all', label: '全部学院' },
        ...colleges.map((c) => ({ value: c.id, label: c.name })),
      ];
    }
    return SWJTU_COLLEGES.map((col) => ({
      value: col === '全部学院' ? 'all' : col,
      label: col,
    }));
  }, [colleges]);

  // Filter and sort
  const filteredTeachers = useMemo(() => {
    const selectedCollegeName = colleges?.find((c) => c.id === selectedCollege)?.name;

    return teachers
      .filter((t) => {
        const matchesCollege =
          selectedCollege === 'all' ||
          selectedCollege === '全部学院' ||
          t.collegeId === selectedCollege ||
          t.college === selectedCollege ||
          (selectedCollegeName && t.college === selectedCollegeName);
        const matchesTerm = !onlyThisTerm || t.isTeachingThisTerm;
        const matchesQuery =
          !searchTerm.trim() ||
          t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.courses.some((c) => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
          t.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesCollege && matchesTerm && matchesQuery;
      })
      .sort((a, b) => {
        if (sortBy === 'overall') return b.overallScore - a.overallScore;
        if (sortBy === 'leniency') return b.dimensions.gradingLeniency - a.dimensions.gradingLeniency;
        if (sortBy === 'quality') return b.dimensions.teachingQuality - a.dimensions.teachingQuality;
        if (sortBy === 'attendance') return b.dimensions.attendanceStrictness - a.dimensions.attendanceStrictness;
        return 0;
      });
  }, [teachers, searchTerm, selectedCollege, onlyThisTerm, sortBy]);

  return (
    <div id="desktop-teacher-search-view" className="w-full max-w-5xl mx-auto space-y-5 pb-16">
      {/* 1. Search & Filter Bar */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
        <div ref={searchContainerRef} className="relative">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-gray-400 absolute left-4" />
            <input
              id="desktop-teacher-search-input"
              type="text"
              value={searchTerm}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder="在西南交大全校教师库中搜索教师姓名、开设课程、标签（如：高等数学、李维宏、不点名、给分好）..."
              className="w-full pl-12 pr-10 py-3 bg-gray-50 rounded-2xl border border-gray-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete / Quick Search Suggestions Dropdown with Rounded Corners & Animation */}
          <AnimatePresence>
            {isSearchFocused && searchTerm.trim() && filteredTeachers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl shadow-gray-900/10 border border-gray-100 p-2.5 z-30 max-h-72 overflow-y-auto scrollbar-thin"
              >
                <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between border-b border-gray-50 mb-1">
                  <span>搜索联想推荐</span>
                  <span>{filteredTeachers.length} 位匹配教师</span>
                </div>
                <div className="space-y-1">
                  {filteredTeachers.slice(0, 6).map((t) => (
                    <motion.div
                      key={t.id}
                      whileTap={{ scale: 0.98 }}
                      whileHover={{ x: 3 }}
                      onClick={() => {
                        setIsSearchFocused(false);
                        onSelectTeacher(t);
                      }}
                      className="p-2.5 rounded-xl hover:bg-indigo-50/70 border border-transparent hover:border-indigo-100/60 flex items-center justify-between cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {t.name.slice(0, 1)}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{t.name}</span>
                            <span className="text-xs text-gray-400">{t.college}</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                              {t.title}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            开设课程：{t.courses.join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-amber-500 text-xs font-bold shrink-0 ml-3">
                        <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                        <span>{t.overallScore.toFixed(1)} 分</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Filter Toolbar with AnimatedDropdowns */}
        <div className="flex items-center justify-between gap-4 pt-1 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 flex items-center gap-1 font-medium">
              <SlidersHorizontal className="w-3.5 h-3.5" /> 学院筛选:
            </span>
            <AnimatedDropdown
              id="desktop-college-dropdown"
              value={selectedCollege}
              onChange={setSelectedCollege}
              options={collegeOptions}
              searchable
              buttonClassName="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl px-3 py-1.5"
              menuClassName="w-64"
            />

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setOnlyThisTerm(!onlyThisTerm)}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                onlyThisTerm
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              仅看本学期开课
            </motion.button>
          </div>

          <div className="flex items-center gap-2 text-gray-500">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span className="text-gray-400">排序:</span>
            <AnimatedDropdown
              id="desktop-sort-dropdown"
              value={sortBy}
              onChange={(v) => setSortBy(v as any)}
              options={[
                { value: 'overall', label: '综合评分最高' },
                { value: 'leniency', label: '给分最大方' },
                { value: 'quality', label: '教学质量最高' },
                { value: 'attendance', label: '最少点名' },
              ]}
              align="right"
              buttonClassName="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl px-3 py-1.5"
              menuClassName="w-40"
            />
          </div>
        </div>
      </div>

      {/* 2. Count Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-gray-500">
        <span>共找到 <strong className="text-gray-900 font-bold">{filteredTeachers.length}</strong> 位教师</span>
        <span className="text-gray-400">结构化全校教师档案 · 永久免费查阅</span>
      </div>

      {/* 3. Teachers Grid (2-Column for Desktop) */}
      {filteredTeachers.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-gray-100 text-center text-gray-400 space-y-2">
          <p className="text-base font-semibold text-gray-700">没有找到匹配的老师</p>
          <p className="text-xs">尝试更换关键词或在“全部学院”中搜索</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredTeachers.map((teacher) => (
            <div
              key={teacher.id}
              onClick={() => onSelectTeacher(teacher)}
              className="bg-white p-5 rounded-3xl border border-gray-100 hover:border-indigo-200 shadow-2xs hover:shadow-md transition-all cursor-pointer group space-y-3.5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-lg shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      {teacher.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-950 text-base group-hover:text-indigo-600 transition-colors">
                          {teacher.name}
                        </h4>
                        <span className="text-xs text-gray-500 font-medium">{teacher.title}</span>
                        {teacher.isTeachingThisTerm && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> 本学期在教
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {teacher.college} · {teacher.campus}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-amber-600 font-bold text-base">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span>{teacher.overallScore.toFixed(1)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{teacher.reviewCount} 条评价</span>
                  </div>
                </div>

                {/* Courses list */}
                <div className="flex flex-wrap gap-1.5 items-center text-xs">
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" /> 开设课程：
                  </span>
                  {teacher.courses.map((course, cIdx) => (
                    <span key={cIdx} className="px-2 py-0.5 rounded-md bg-gray-50 text-gray-700 text-xs border border-gray-100">
                      {course}
                    </span>
                  ))}
                </div>

                {/* 6-Dimension quick metrics badge */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-50 text-xs">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 rounded-xl">
                    <span className="text-gray-500">考勤宽松度</span>
                    <span className="font-bold text-gray-800">{teacher.dimensions.attendanceStrictness}分</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 rounded-xl">
                    <span className="text-gray-500">给分大方</span>
                    <span className="font-bold text-emerald-600">{teacher.dimensions.gradingLeniency}分</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 rounded-xl">
                    <span className="text-gray-500">教学质量</span>
                    <span className="font-bold text-indigo-600">{teacher.dimensions.teachingQuality}分</span>
                  </div>
                </div>
              </div>

              {/* Card Footer tags */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-50/80">
                <div className="flex flex-wrap gap-1.5">
                  {teacher.tags.map((tag, tIdx) => (
                    <span key={tIdx} className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                      #{tag}
                    </span>
                  ))}
                  {teacher.hasHistoricalData && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 flex items-center gap-0.5 font-medium">
                      <History className="w-2.5 h-2.5" /> 老站迁移数据
                    </span>
                  )}
                </div>

                <span className="text-xs text-gray-400 group-hover:text-indigo-600 flex items-center gap-0.5 transition-colors font-medium">
                  查看教师主页与雷达图 <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
