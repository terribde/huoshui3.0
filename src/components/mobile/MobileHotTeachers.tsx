import React from 'react';
import { ChevronLeft, Star, Flame } from 'lucide-react';
import { motion } from 'motion/react';
import { Teacher } from '../../types';
import { formatRating } from '../../lib/ratings';

interface MobileHotTeachersProps {
  teachers: Teacher[];
  onBack: () => void;
  onSelectTeacher: (teacher: Teacher) => void;
}

const RANK_STYLE = [
  'bg-amber-400 text-white',
  'bg-gray-400 text-white',
  'bg-orange-400 text-white',
];

/** 手机端全屏页面：本学期热门好评教师（取列表前 10 位） */
export const MobileHotTeachers: React.FC<MobileHotTeachersProps> = ({ teachers, onBack, onSelectTeacher }) => {
  const list = teachers.slice(0, 10);

  return (
    <div id="mobile-hot-teachers" className="w-full pb-24">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-3 py-3 flex items-center gap-2 border-b border-gray-100">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={onBack}
          aria-label="返回"
          className="p-1.5 -ml-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
        <div className="flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-orange-500" />
          <h1 className="text-sm font-bold text-gray-900">本学期热门好评教师</h1>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {list.length === 0 ? (
          <p className="py-16 text-center text-xs text-gray-400">暂无教师数据</p>
        ) : (
          list.map((teacher, index) => (
            <motion.div
              key={teacher.id}
              onClick={() => onSelectTeacher(teacher)}
              whileTap={{ scale: 0.98 }}
              className="p-3 bg-white rounded-2xl border border-gray-100 shadow-2xs cursor-pointer flex items-center justify-between gap-2 group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full text-3xs font-bold flex items-center justify-center shrink-0 ${
                    RANK_STYLE[index] || 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs shrink-0">
                  {teacher.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900 text-xs">{teacher.name}</span>
                    <span className="text-3xs text-gray-500">{teacher.title}</span>
                    <span className="text-4xs px-1 py-0.2 bg-gray-100 text-gray-600 rounded truncate">
                      {teacher.college.replace('学院', '')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-2xs text-gray-500 mt-0.5">
                    <span className="truncate">{teacher.courses[0]}</span>
                    <span>·</span>
                    <span className="text-emerald-600 font-medium shrink-0">
                      给分 {formatRating(teacher.dimensions.gradingLeniency, '分')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 font-bold text-amber-600 text-xs shrink-0">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{formatRating(teacher.overallScore)}</span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
