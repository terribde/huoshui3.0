import React, { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { usePagedQuery } from '../hooks/usePagedQuery';
import { NOTICE_CATEGORIES, noticeService } from '../services/noticeService';
import { Pagination, PageFeedback } from './Pagination';
import type { Notice } from '../types';

const PAGE_SIZE = 10;
const categoryName = (code: string) => NOTICE_CATEGORIES.find(item => item.code === code)?.name;

/** 教务网「通知公告」列表：分类筛选 + 标题搜索 + 分页，点击在新标签页打开教务网原文。 */
export const NoticesPanel: React.FC = () => {
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const key = JSON.stringify([category, keyword.trim()]);
  const notices = usePagedQuery<Notice>(
    key,
    (page, signal) => noticeService.getNoticesPage({ category, query: keyword, page, pageSize: PAGE_SIZE }, signal),
    true, 0, 60_000,
  );

  return (
    <div className="space-y-3">
      <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800">
        来自西南交通大学本科生院官网「通知公告」，每小时自动同步。点击标题跳转到官网查看原文。
      </div>

      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-gray-400 absolute left-3" />
        <input
          type="search"
          maxLength={100}
          placeholder="搜索通知标题…"
          aria-label="搜索通知标题"
          value={keyword}
          onChange={event => setKeyword(event.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-xs border border-gray-200 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="通知分类">
        {NOTICE_CATEGORIES.map(item => (
          <button
            key={item.code}
            type="button"
            aria-pressed={category === item.code}
            onClick={() => setCategory(item.code)}
            className={`px-2.5 py-1 rounded-full text-2xs font-semibold border transition-colors cursor-pointer ${
              category === item.code
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>

      <PageFeedback loading={notices.loading && notices.items.length === 0} error={notices.error} onRetry={notices.reload} />

      {!notices.loading && !notices.error && notices.items.length === 0 && (
        <div className="py-10 text-center text-xs text-gray-400">没有找到相关通知</div>
      )}

      <ul className="space-y-2">
        {notices.items.map(item => (
          <li key={item.id}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3.5 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 space-y-1.5 transition-colors"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-gray-800 leading-snug">{item.title}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" aria-hidden="true" />
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-3xs text-gray-400">
                <time dateTime={item.publishedOn}>{item.publishedOn.replace(/-/g, '/')}</time>
                {item.categories.map(code => categoryName(code) && (
                  <span key={code} className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                    {categoryName(code)}
                  </span>
                ))}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <Pagination
        page={notices.page}
        total={notices.total}
        pageSize={PAGE_SIZE}
        loading={notices.loading}
        onPageChange={notices.setPage}
      />
    </div>
  );
};
