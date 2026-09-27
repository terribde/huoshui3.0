import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

export function PageFeedback({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) {
    return (
      <div role="status" className="py-6 flex items-center justify-center gap-2 text-xs sm:text-sm text-indigo-600 animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
        <span className="font-medium text-gray-500">正在同步最新数据…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="p-4 my-2 rounded-2xl bg-rose-50 border border-rose-150 text-center text-xs sm:text-sm text-rose-700 flex items-center justify-center gap-2">
        <span>读取失败，请检查网络后重试</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-800 hover:bg-rose-100 font-semibold transition-all active:scale-95 shadow-2xs"
        >
          <RefreshCw className="w-3 h-3" />
          <span>重试</span>
        </button>
      </div>
    );
  }
  return null;
}

export function Pagination({
  page,
  total,
  pageSize = 20,
  loading,
  onPageChange
}: {
  page: number;
  total: number;
  pageSize?: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 0) return null;

  return (
    <nav aria-label="分页导航" className="flex items-center justify-center gap-3 py-4 text-xs sm:text-sm select-none">
      {/* 上一页按钮 */}
      <motion.button
        type="button"
        disabled={loading || page === 0}
        onClick={() => onPageChange(page - 1)}
        whileHover={!loading && page > 0 ? { y: -1, scale: 1.02 } : {}}
        whileTap={!loading && page > 0 ? { scale: 0.94 } : {}}
        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
        className="group flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-gray-700 font-medium shadow-2xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-700"
      >
        <ChevronLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        <span>上一页</span>
      </motion.button>

      {/* 当前页码胶囊 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200/80 text-gray-600 text-xs font-medium shadow-2xs">
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        )}
        <span aria-live="polite" className="font-mono">
          第 <strong className="text-gray-900 font-bold">{page + 1}</strong> / {pages} 页
        </span>
      </div>

      {/* 下一页按钮 */}
      <motion.button
        type="button"
        disabled={loading || page + 1 >= pages}
        onClick={() => onPageChange(page + 1)}
        whileHover={!loading && page + 1 < pages ? { y: -1, scale: 1.02 } : {}}
        whileTap={!loading && page + 1 < pages ? { scale: 0.94 } : {}}
        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
        className="group flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-gray-700 font-medium shadow-2xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-700"
      >
        <span>下一页</span>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500 ml-0.5" />
        ) : (
          <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
      </motion.button>
    </nav>
  );
}

