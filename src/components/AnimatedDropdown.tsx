import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface AnimatedDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  selectedOption?: DropdownOption;
  searchPlaceholder?: string;
  emptyMessage?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
  searchable?: boolean;
  onSearchChange?: (value: string) => void;
  loading?: boolean;
}

export const AnimatedDropdown: React.FC<AnimatedDropdownProps> = ({
  id,
  value,
  onChange,
  options,
  selectedOption: selectedOverride,
  searchPlaceholder = '搜索筛选...',
  emptyMessage = '无匹配选项',
  placeholder = '请选择',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  align = 'left',
  searchable = false,
  onSearchChange,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = selectedOverride || options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter options if searchable
  const displayedOptions = searchable && searchFilter.trim() && !onSearchChange
    ? options.filter((opt) => 
        opt.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (opt.badge && opt.badge.toLowerCase().includes(searchFilter.toLowerCase()))
      )
    : options;

  return (
    <div ref={dropdownRef} className={`relative text-left ${className ? className : 'inline-block'}`} id={id}>
      {/* Trigger Button */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchFilter('');
          onSearchChange?.('');
        }}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium text-gray-800 bg-gray-50 hover:bg-gray-100/90 active:bg-gray-100 transition-all cursor-pointer border border-gray-200/80 focus:outline-hidden focus:border-indigo-500 ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {selectedOption?.badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-medium">
              {selectedOption.badge}
            </span>
          )}
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-400"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </div>
      </motion.button>

      {/* Animated Dropdown Menu with Rounded Corners */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute z-50 mt-1.5 min-w-[180px] bg-white rounded-2xl shadow-xl shadow-gray-900/12 border border-gray-100 p-1.5 focus:outline-hidden ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${menuClassName}`}
          >
            {searchable && (
              <div className="p-1 border-b border-gray-100 mb-1">
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => { setSearchFilter(e.target.value); onSearchChange?.(e.target.value); }}
                  placeholder={searchPlaceholder}
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 rounded-xl border border-gray-200 text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            )}

            <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin">
              {loading ? <div role="status" className="p-3 text-center text-xs text-gray-400">正在搜索…</div> : displayedOptions.length === 0 ? (
                <div className="p-3 text-center text-xs text-gray-400">{emptyMessage}</div>
              ) : (
                displayedOptions.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <motion.button
                      key={option.value}
                      type="button"
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {option.icon && <span className="shrink-0">{option.icon}</span>}
                        <span className="truncate">{option.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {option.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                            {option.badge}
                          </span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
