import { cacheApiEnabled, cacheQuery, cacheRequest } from '../lib/cacheApi';
import { supabase } from '../lib/supabase';
import type { DataPage, Notice, NoticeQuery } from '../types';

/** 与教务网 /tzgg/<代码>.htm 和后端 server/notices.mjs 保持一致。 */
export const NOTICE_CATEGORIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'all', name: '全部' },
  { code: 'jxyx', name: '教学运行' }, { code: 'jxjs', name: '教学建设' }, { code: 'jsfz', name: '教师发展' },
  { code: 'tsjy', name: '通识教育' }, { code: 'sjjx', name: '实践教学' }, { code: 'syjx', name: '实验教学' },
  { code: 'cxcy', name: '创新创业' }, { code: 'zljs', name: '质量建设' }, { code: 'glgd', name: '管理规定' },
];

const toNotice = (row: any): Notice => ({
  id: row.id, url: row.url, title: row.title,
  publishedOn: row.published_on ?? row.publishedOn,
  categories: Array.isArray(row.categories) ? row.categories : [],
});

// ilike 中的 % _ \ 按普通字符处理
const escapeLike = (text: string) => text.replace(/[\\%_]/g, char => `\\${char}`);

export const noticeService = {
  async getNoticesPage(options: NoticeQuery = {}, signal?: AbortSignal): Promise<DataPage<Notice>> {
    const page = options.page ?? 0;
    const pageSize = options.pageSize ?? 20;
    const category = options.category ?? 'all';
    const text = (options.query ?? '').trim();

    // 启用缓存 API 的部署走 Node 接口（带 60 秒缓存）；否则直接读 Supabase（表对所有人只读开放）。
    if (cacheApiEnabled) {
      const data = await cacheRequest<DataPage<any>>(
        `/notices?${cacheQuery({ page, pageSize, category, query: text || undefined })}`, { signal });
      return { items: data.items.map(toNotice), total: data.total };
    }
    if (!supabase) throw new Error('数据服务未配置');
    let request = supabase.from('notices').select('id,url,title,published_on,categories', { count: 'exact' });
    if (category !== 'all') request = request.contains('categories', [category]);
    if (text) request = request.ilike('title', `%${escapeLike(text)}%`);
    const from = page * pageSize;
    const { data, error, count } = await request
      .order('published_on', { ascending: false }).order('id', { ascending: false })
      .range(from, from + pageSize - 1).abortSignal(signal as AbortSignal);
    if (error) {
      if (error.code === 'PGRST103') return { items: [], total: 0 }; // 页码超出范围
      throw new Error(error.message);
    }
    return { items: (data ?? []).map(toNotice), total: count ?? 0 };
  },
};
