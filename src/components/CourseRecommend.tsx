import React, { useState, useMemo } from 'react';
import { Teacher, RecommendationWeights, College } from '../types';
import { POPULAR_COURSES } from '../data/mockTeachers';
import { Sliders, Sparkles, CheckCircle2, ChevronRight, HelpCircle, Star, Award, RotateCcw, Building2 } from 'lucide-react';

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
  const [selectedCourse, setSelectedCourse] = useState<string>('高等数学 (I)');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [hasCalculated, setHasCalculated] = useState<boolean>(true);

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

  // Find all unique courses available across teachers
  const allAvailableCourses = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      t.courses.forEach((c) => set.add(c));
    });
    return Array.from(set);
  }, [teachers]);

  // Filter candidates:
  // PRD 7.0 Requirement: 候选池为本学期开课的授课老师（不含以往教过但本学期未开课的老师）
  // Database Schema Requirement: 支持通过 college_id 筛选学院
  const rankedTeachers = useMemo(() => {
    const courseToMatch = searchKeyword.trim() || selectedCourse;
    if (!courseToMatch) return [];

    const selectedCollegeName = colleges?.find((c) => c.id === selectedCollegeId)?.name;

    // Filter teachers who teach this course AND are teaching this semester AND match college
    const candidates = teachers.filter((t) => {
      const matchCourse = t.courses.some((c) => 
        c.toLowerCase().includes(courseToMatch.toLowerCase())
      );
      const matchCollege =
        selectedCollegeId === 'all' ||
        t.collegeId === selectedCollegeId ||
        (selectedCollegeName && t.college === selectedCollegeName);

      // Hard requirement from PRD: isTeachingThisTerm must be true
      return matchCourse && t.isTeachingThisTerm && matchCollege;
    });

    // Calculate weighted match score (0 - 100)
    return candidates.map((teacher) => {
      const dim = teacher.dimensions;
      
      // Normalize dimensions based on user desire:
      // 1. attendance: higher means less attendance pressure
      // score: (attendanceStrictness - 1) / 4 (range 0-1)
      const attendScore = (dim.attendanceStrictness - 1) / 4;

      // 2. gradingLeniency: higher is better: (gradingLeniency - 1) / 4
      const leniencyScore = (dim.gradingLeniency - 1) / 4;

      // 3. effortMatters: higher is better: (effortMatters - 1) / 4
      const effortScore = (dim.effortMatters - 1) / 4;

      // 4. workloadDifficulty: higher means lighter workload
      const workloadScore = (dim.workloadDifficulty - 1) / 4;

      // 5. approachability: higher is better: (approachability - 1) / 4
      const approachScore = (dim.approachability - 1) / 4;

      // 6. teachingQuality: higher is better: (teachingQuality - 1) / 4
      const qualityScore = (dim.teachingQuality - 1) / 4;

      const totalWeight =
        weights.attendanceStrictness +
        weights.gradingLeniency +
        weights.effortMatters +
        weights.workloadDifficulty +
        weights.approachability +
        weights.teachingQuality || 1;

      const weightedSum =
        attendScore * weights.attendanceStrictness +
        leniencyScore * weights.gradingLeniency +
        effortScore * weights.effortMatters +
        workloadScore * weights.workloadDifficulty +
        approachScore * weights.approachability +
        qualityScore * weights.teachingQuality;

      const matchPercent = Math.min(99, Math.max(50, Math.round((weightedSum / totalWeight) * 100)));

      return {
        teacher,
        matchPercent,
        scores: {
          attendScore,
          leniencyScore,
          effortScore,
          workloadScore,
          approachScore,
          qualityScore,
        }
      };
    }).sort((a, b) => b.matchPercent - a.matchPercent);
  }, [teachers, selectedCourse, searchKeyword, weights]);

  return (
    <div id="course-recommend-panel" className="max-w-5xl mx-auto space-y-4 sm:space-y-6 pb-20">
      {/* Title & PRD banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-100 shrink-0">
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">智能选课偏好推荐</h2>
              <p className="text-[11px] sm:text-xs text-gray-500">依据本学期开课教师与加权算法动态匹配 (PRD 3.3 / 7)</p>
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

        {/* College Filter using college_id foreign key */}
        {colleges && colleges.length > 0 && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              开课学院筛选:
            </span>
            <select
              id="course-recommend-college-select"
              value={selectedCollegeId}
              onChange={(e) => setSelectedCollegeId(e.target.value)}
              className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-gray-700 cursor-pointer"
            >
              <option value="all">全部学院 (不限)</option>
              {colleges.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
            {selectedCollegeId !== 'all' && (
              <button
                onClick={() => setSelectedCollegeId('all')}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
              >
                清除学院筛选
              </button>
            )}
          </div>
        )}
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

      {/* Recommendation Results (PRD 7: 仅展示排序，候选池为本学期开课老师) */}
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

        {rankedTeachers.length === 0 ? (
          <div className="py-12 text-center text-gray-400 space-y-2">
            <p className="text-sm font-medium">本学期暂无开设该课程的教师数据</p>
            <p className="text-xs text-gray-400">试试热门课程：高等数学、微积分、数据结构、大学物理</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rankedTeachers.map(({ teacher, matchPercent }, index) => (
              <div
                key={teacher.id}
                onClick={() => onSelectTeacher(teacher)}
                className="p-4 rounded-2xl border border-gray-100 hover:border-indigo-200 bg-gray-50/50 hover:bg-white transition-all cursor-pointer group flex items-center justify-between shadow-2xs hover:shadow-md"
              >
                <div className="flex items-center gap-3.5">
                  {/* Rank Badge */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${
                    index === 0 
                      ? 'bg-amber-500 text-white shadow-xs' 
                      : index === 1 
                      ? 'bg-slate-400 text-white' 
                      : index === 2 
                      ? 'bg-amber-700/60 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {index + 1}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base group-hover:text-indigo-600 transition-colors">
                        {teacher.name}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">{teacher.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {teacher.college}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500">
                      <span>综合评分: <strong className="text-amber-600">{teacher.overallScore}</strong></span>
                      <span>·</span>
                      <span>评价数: {teacher.reviewCount}条</span>
                      <span>·</span>
                      <span className="text-indigo-600 font-medium">
                        本学期班级：{teacher.recentTermCourses?.[0] || teacher.courses[0]}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {teacher.tags.slice(0, 3).map((tag, tIdx) => (
                        <span key={tIdx} className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Match percentage pill */}
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl font-bold text-sm">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>{matchPercent}% 契合</span>
                  </div>
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    查看主页 <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
