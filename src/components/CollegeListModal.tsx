import React, { useEffect, useState } from 'react';
import { SWJTU_COLLEGES } from '../data/mockTeachers';
import { X, Building2, ChevronRight, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { supabaseService } from '../services/supabaseService';
import { College } from '../types';

interface CollegeListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCollege: (collegeName: string, collegeId?: string) => void;
  colleges?: College[];
}

export const CollegeListModal: React.FC<CollegeListModalProps> = ({
  onClose,
  onSelectCollege,
  colleges: propColleges,
}) => {
  const [colleges, setColleges] = useState<College[]>(propColleges || []);
  const [loading, setLoading] = useState<boolean>(!propColleges || propColleges.length === 0);
  const [searchFilter, setSearchFilter] = useState<string>('');

  useEffect(() => {
    if (propColleges && propColleges.length > 0) {
      setColleges(propColleges);
      setLoading(false);
      return;
    }

    supabaseService.getColleges().then((data) => {
      if (data && data.length > 0) {
        setColleges(data);
      } else {
        // Fallback to mock colleges
        setColleges(
          SWJTU_COLLEGES.filter((c) => c !== '全部学院').map((name, index) => ({
            id: `col_${index + 1}`,
            name,
          }))
        );
      }
      setLoading(false);
    });
  }, [propColleges]);

  const filtered = colleges.filter((c) =>
    c.name.toLowerCase().includes(searchFilter.trim().toLowerCase())
  );

  return (
    <div id="colleges-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      <motion.div 
        id="colleges-modal-content"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 bg-white w-full max-w-md h-[85vh] h-[85dvh] sm:h-auto max-h-[85vh] max-h-[85dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-gray-900 text-base">西南交大学院库</h3>
          </div>
          <motion.button 
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Quick Search */}
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3" />
            <input
              type="text"
              placeholder="搜索学院名称..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-xs border border-gray-200 focus:outline-hidden focus:border-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="p-4 pb-8 sm:pb-4 overflow-y-auto min-h-0 space-y-2 flex-1 overscroll-contain">
          {loading ? (
            <div className="py-12 text-center text-xs text-gray-400">正在从数据库加载学院列表...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400">未找到相关学院</div>
          ) : (
            filtered.map((item) => (
              <motion.div
                key={item.id}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onSelectCollege(item.name, item.id);
                  onClose();
                }}
                className="p-3.5 rounded-2xl bg-gray-50/70 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 flex items-center justify-between cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs sm:text-sm text-gray-800 group-hover:text-indigo-600">
                    {item.name}
                  </span>
                  {item.code && (
                    <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-100">
                      {item.code}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};
