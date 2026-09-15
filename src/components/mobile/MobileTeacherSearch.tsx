import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Teacher } from '../../types';
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
  Sparkles,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedDropdown } from '../AnimatedDropdown';

interface MobileTeacherSearchProps {
  teachers: Teacher[];
  onSelectTeacher: (teacher: Teacher) => void;
  onOpenReview?: (teacher?: Teacher) => void;
  initialSearch?: string;
}

export const MobileTeacherSearch: React.FC<MobileTeacherSearchProps> = ({
  teachers,
  onSelectTeacher,
  onOpenReview,
  initialSearch = '',
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [selectedCollege, setSelectedCollege] = useState<string>('全部学院');
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

  // Filter and sort
  const filteredTeachers = useMemo(() => {
    return teachers
      .filter((t) => {
        const matchesCollege = selectedCollege === '全部学院' || t.college === selectedCollege;
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
        if (sortBy === 'attendance') return a.dimensions.attendanceStrictness - b.dimensions.attendanceStrictness;
        return 0;
      });
  }, [teachers, searchTerm, selectedCollege, onlyThisTerm, sortBy]);

  // Mobile quick college filter chips
  const quickColleges = ['全部学院', '数学学院', '计算机与人工智能学院', '土木工程学院', '机械工程学院', '电气工程学院', '物理科学与技术学院'];

  return (
    <motion.div 
      id="mobile-teacher-search-view" 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="w-full px-3.5 pt-2 pb-24 space-y-3"
    >
      {/* 1. Search Input Bar */}
      <div className="bg-white p-3 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
        <div ref={searchContainerRef} className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3" />
            <input
              id="mobile-search-teachers-input"
              type="text"
              value={searchTerm}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder="搜索老师姓名、课程、标签（如：高数、不点名）..."
              className="w-full pl-9 pr-8 py-2 bg-gray-50 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete / Quick Search Suggestions Dropdown with Rounded Corners & Animation */}
          <AnimatePresence>
            {isSearchFocused && searchTerm.trim() && filteredTeachers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl shadow-gray-900/10 border border-gray-100 p-2 z-30 max-h-60 overflow-y-auto scrollbar-thin"
              >
                <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                  <span>智能联想推荐</span>
                  <span>{filteredTeachers.length} 位匹配教师</span>
                </div>
                <div className="space-y-1 mt-1">
                  {filteredTeachers.slice(0, 5).map((t) => (
                    <motion.div
                      key={t.id}
                      whileTap={{ scale: 0.98 }}
                      whileHover={{ x: 2 }}
                      onClick={() => {
                        setIsSearchFocused(false);
                        onSelectTeacher(t);
                      }}
                      className="p-2 rounded-xl hover:bg-indigo-50/70 border border-transparent hover:border-indigo-100/60 flex items-center justify-between cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {t.name.slice(0, 1)}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-900">{t.name}</span>
                            <span className="text-[10px] text-gray-400">{t.college}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate">
                            {t.courses.join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-amber-500 text-xs font-bold shrink-0 ml-2">
                        <Star className="w-3 h-3 fill-amber-400 stroke-amber-400" />
                        <span>{t.overallScore.toFixed(1)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* College Horizontal Scroll Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 -mx-1 px-1">
          {quickColleges.map((col) => {
            const isSelected = selectedCollege === col;
            const shortName = col === '全部学院' ? '全部' : col.replace(/学院$/, '').slice(0, 4);
            return (
              <motion.button
                key={col}
                whileTap={{ scale: 0.92 }}
                onClick={() => setSelectedCollege(col)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'bg-gray-100/90 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {shortName}
              </motion.button>
            );
          })}
        </div>

        {/* Filter & Sort Controls with AnimatedDropdown */}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-1.5">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setOnlyThisTerm(!onlyThisTerm)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                onlyThisTerm
                  ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              仅看本学期
            </motion.button>

            {/* Dropdown for all other colleges with rounded corners and animation */}
            <AnimatedDropdown
              id="mobile-college-dropdown"
              value={selectedCollege}
              onChange={setSelectedCollege}
              options={[
                { value: '全部学院', label: '更多学院...' },
                ...SWJTU_COLLEGES.filter((c) => c !== '全部学院').map((col) => ({
                  value: col,
                  label: col,
                })),
              ]}
              searchable
              buttonClassName="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-medium max-w-[110px]"
              menuClassName="w-56"
            />
          </div>

          <div className="flex items-center gap-1 text-gray-500">
            <ArrowUpDown className="w-3 h-3 text-gray-400" />
            {/* Sort Dropdown with rounded corners and motion animation */}
            <AnimatedDropdown
              id="mobile-sort-dropdown"
              value={sortBy}
              onChange={(val) => setSortBy(val as any)}
              options={[
                { value: 'overall', label: '评分最高' },
                { value: 'leniency', label: '给分最大方' },
                { value: 'quality', label: '教学质量高' },
                { value: 'attendance', label: '最少点名' },
              ]}
              align="right"
              buttonClassName="px-2 py-1 bg-gray-100/90 text-gray-700 rounded-lg text-[11px] font-medium"
              menuClassName="w-36"
            />
          </div>
        </div>
      </div>

      {/* 2. Teachers Count Header */}
      <div className="flex items-center justify-between px-1 text-[11px] text-gray-500">
        <span>共找到 <strong className="text-gray-900">{filteredTeachers.length}</strong> 位教师</span>
        <span className="text-gray-400">永久免费查询</span>
      </div>

      {/* 3. Teachers List (Single Column Compact Mobile Cards) */}
      <div className="space-y-2.5">
        {filteredTeachers.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-gray-400 space-y-1.5">
            <p className="text-xs font-medium text-gray-600">没有找到匹配的老师</p>
            <p className="text-[11px]">尝试缩短关键词或在“全部”中搜索</p>
          </div>
        ) : (
          filteredTeachers.map((teacher, idx) => (
            <motion.div
              key={teacher.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.03, 0.25), duration: 0.2 }}
              onClick={() => onSelectTeacher(teacher)}
              whileTap={{ scale: 0.98 }}
              className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-2.5"
            >
              {/* Header row: Avatar, Name, Title, Term, Rating */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-base shrink-0">
                    {teacher.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-gray-900 text-sm">
                        {teacher.name}
                      </h4>
                      <span className="text-[11px] text-gray-500">{teacher.title}</span>
                      {teacher.isTeachingThisTerm && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> 本学期
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {teacher.college} · {teacher.campus}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-0.5 text-amber-600 font-bold text-sm">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{teacher.overallScore.toFixed(1)}</span>
                  </div>
                  <span className="text-[10px] text-gray-400">{teacher.reviewCount} 条评价</span>
                </div>
              </div>

              {/* Course Snippet */}
              <div className="flex flex-wrap gap-1 items-center text-[11px]">
                <span className="text-gray-400 flex items-center gap-0.5 text-[10px]">
                  <BookOpen className="w-3 h-3" /> 开课:
                </span>
                {teacher.courses.map((course, cIdx) => (
                  <span key={cIdx} className="px-1.5 py-0.2 rounded bg-gray-50 text-gray-700 text-[11px] border border-gray-100">
                    {course}
                  </span>
                ))}
              </div>

              {/* 3 Core Dimensions (点名严度 / 给分大方 / 教学质量) */}
              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-gray-50 text-[10px]">
                <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded-lg">
                  <span className="text-gray-500">点名严度</span>
                  <span className="font-bold text-gray-800">{teacher.dimensions.attendanceStrictness}分</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded-lg">
                  <span className="text-gray-500">给分大方</span>
                  <span className="font-bold text-emerald-600">{teacher.dimensions.gradingLeniency}分</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded-lg">
                  <span className="text-gray-500">教学质量</span>
                  <span className="font-bold text-indigo-600">{teacher.dimensions.teachingQuality}分</span>
                </div>
              </div>

              {/* Card Footer tags */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex flex-wrap gap-1">
                  {teacher.tags.map((tag, tIdx) => (
                    <span key={tIdx} className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50/70 text-indigo-700 font-medium">
                      #{tag}
                    </span>
                  ))}
                  {teacher.hasHistoricalData && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 flex items-center gap-0.5 font-medium">
                      <History className="w-2.5 h-2.5" /> 老站迁移
                    </span>
                  )}
                </div>

                <span className="text-[11px] text-gray-400 flex items-center gap-0.5 font-medium">
                  详情 <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};
