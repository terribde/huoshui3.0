import React from 'react';
import { SWJTU_COLLEGES } from '../data/mockTeachers';
import { X, Building2, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

interface CollegeListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCollege: (college: string) => void;
}

export const CollegeListModal: React.FC<CollegeListModalProps> = ({
  onClose,
  onSelectCollege,
}) => {
  return (
    <div id="colleges-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
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
        className="relative z-10 bg-white w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-gray-900 text-base">西南交大学院库</h3>
          </div>
          <motion.button 
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {SWJTU_COLLEGES.map((college, idx) => (
            <motion.div
              key={college}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02, duration: 0.2 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onSelectCollege(college);
                onClose();
              }}
              className="p-3.5 rounded-2xl bg-gray-50/70 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 flex items-center justify-between cursor-pointer transition-all group"
            >
              <span className="font-medium text-xs sm:text-sm text-gray-800 group-hover:text-indigo-600">
                {college}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
