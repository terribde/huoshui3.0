import { pagination } from './data.mjs';

// 分类代码与教务网 /tzgg/<代码>.htm 一致；"all" 表示不筛选。
export const NOTICE_CATEGORIES = Object.freeze({
  jxyx: '教学运行', jxjs: '教学建设', jsfz: '教师发展', tsjy: '通识教育', sjjx: '实践教学',
  syjx: '实验教学', cxcy: '创新创业', zljs: '质量建设', glgd: '管理规定',
});
export const NOTICE_SELECT = 'id,url,title,published_on,categories';

export function noticeOptions(query) {
  const options = { ...pagination(query), query: String(query.query ?? '').trim(),
    category: String(query.category ?? 'all') };
  if (options.query.length > 100) throw new Error('Invalid notice filter');
  if (options.category !== 'all' && !Object.hasOwn(NOTICE_CATEGORIES, options.category)) {
    throw new Error('Invalid notice category');
  }
  return options;
}

// ilike 中 % _ \ 有特殊含义，用户输入按普通字符处理。
const escapeLike = text => text.replace(/[\\%_]/g, char => `\\${char}`);

export function publicNotice(row) {
  return { id: row.id, url: row.url, title: row.title, published_on: row.published_on,
    categories: Array.isArray(row.categories) ? row.categories : [] };
}

export async function noticePage(client, { page, pageSize, query, category }) {
  let request = client.from('notices').select(NOTICE_SELECT, { count: 'exact' });
  if (category !== 'all') request = request.contains('categories', [category]);
  if (query) request = request.ilike('title', `%${escapeLike(query)}%`);
  const from = page * pageSize;
  const { data, error, count } = await request
    .order('published_on', { ascending: false }).order('id', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    // PostgREST 对超出总数的偏移返回 PGRST103；这是请求问题，不是服务故障。
    if (error.code === 'PGRST103') throw Object.assign(new Error('Page out of range'), { status: 400 });
    throw new Error(error.message);
  }
  if (!Array.isArray(data) || !Number.isSafeInteger(count)) throw new Error('Incomplete database response');
  return { items: data.map(publicNotice), total: count };
}

// 通知更新很慢，而接口是公开的：同一查询 60 秒内只访问一次数据库。
export function createNoticeReader(client, { ttlMs = 60000, maxEntries = 200, now = Date.now } = {}) {
  const entries = new Map();
  return async function readNotices(options) {
    const key = JSON.stringify([options.page, options.pageSize, options.query, options.category]);
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return { cache: 'HIT', data: hit.data };
    const data = await noticePage(client, options);
    entries.delete(key);
    entries.set(key, { at: now(), data });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return { cache: 'MISS', data };
  };
}
