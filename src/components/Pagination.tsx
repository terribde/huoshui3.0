import React from 'react';

export function PageFeedback({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p role="status" className="p-6 text-center text-sm text-gray-500">正在加载…</p>;
  if (error) return <div role="alert" className="p-4 text-center text-sm text-rose-700">读取失败，请重试。<button type="button" onClick={onRetry} className="ml-3 underline">重试</button></div>;
  return null;
}

export function Pagination({ page, total, pageSize = 20, loading, onPageChange }: { page: number; total: number; pageSize?: number; loading: boolean; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 0) return null;
  return <nav aria-label="分页" className="flex items-center justify-center gap-4 py-4 text-sm">
    <button type="button" disabled={loading || page === 0} onClick={() => onPageChange(page - 1)} className="rounded-xl border bg-white px-4 py-2 disabled:opacity-40">上一页</button>
    <span aria-live="polite">第 {page + 1} / {pages} 页</span>
    <button type="button" disabled={loading || page + 1 >= pages} onClick={() => onPageChange(page + 1)} className="rounded-xl border bg-white px-4 py-2 disabled:opacity-40">下一页</button>
  </nav>;
}
