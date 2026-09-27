import express from 'express';
import { pagination, teacherOptions, teacherPage, reviewPage } from './data.mjs';

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const httpError = (status, message) => Object.assign(new Error(message), { status });
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value) || value === '__meta') {
    throw httpError(400, 'Invalid record ID');
  }
  return value;
}
function check(result) {
  if (result.error) throw httpError(400, result.error.message);
  return result.data;
}

export function createApp({ cache, authClient, userClient, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, _res, next) => { req.body ||= {}; next(); });
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, cache: cache.available ? 'ready' : 'bypass', lastSync: cache.lastSync }));
  app.get('/api/teachers', asyncRoute(async (req, res) => {
    let options;
    try { options = teacherOptions(req.query); }
    catch (error) { throw httpError(400, error.message); }
    const result = await cache.teachers();
    res.set('X-Cache', result.cache).json({ data: teacherPage(result.rows, options) });
  }));
  app.get('/api/teachers/:id', asyncRoute(async (req, res) => {
    const teacherId = id(req.params.id);
    const result = await cache.teachers();
    res.set('X-Cache', result.cache).json({ data: result.rows.find(row => row.id === teacherId) || null });
  }));
  app.get('/api/teachers/:id/reviews', asyncRoute(async (req, res) => {
    const teacherId = id(req.params.id);
    let options;
    try { options = pagination(req.query); }
    catch (error) { throw httpError(400, error.message); }
    const result = await cache.reviews(teacherId);
    res.set('X-Cache', result.cache).json({ data: reviewPage(result.rows, options) });
  }));

  // Express 4 does not automatically forward rejected promises from async middleware.
  app.use('/api/reviews', (req, res, next) => {
    Promise.resolve(authenticateRequest(req)).then(() => next(), next);
  });
  async function authenticateRequest(req) {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
    if (!match) throw httpError(401, 'Please sign in again');
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data?.user) throw httpError(401, 'Session expired');
    req.user = data.user;
    req.db = userClient(match[1]);
  }
  async function perform(req, operation, teacherChanged = true) {
    const reviewId = id(req.params.id);
    return cache.mutate(async () => {
      const before = check(await req.db.from('reviews').select('id,teacher_id,status,user_id').eq('id', reviewId).maybeSingle());
      if (!before) throw httpError(404, 'Review not found or access denied');
      const result = await operation(reviewId, before);
      await cache.changedReview(before.teacher_id, reviewId, { teacherChanged });
      return result;
    });
  }
  for (const action of ['approve', 'reject']) {
    app.post(`/api/reviews/:id/${action}`, asyncRoute(async (req, res) => {
      if (action === 'reject' && (typeof req.body.reason !== 'string' || req.body.reason.length > 2000)) {
        throw httpError(400, 'Invalid rejection reason');
      }
      const data = await perform(req, async reviewId => {
        const result = check(await req.db.rpc(`${action}_review`, { p_review_id: reviewId,
          ...(action === 'reject' ? { p_reason: req.body.reason || 'Content does not meet review guidelines' } : {}) }));
        if (result?.success !== true) throw httpError(403, result?.message || 'Operation denied');
        return result;
      });
      res.json({ data });
    }));
  }
  app.post('/api/reviews/:id/like', asyncRoute(async (req, res) => {
    if (typeof req.body.liked !== 'boolean') throw httpError(400, 'Invalid liked state');
    const data = await perform(req, reviewId => req.db.rpc('set_review_like', {
      p_review_id: reviewId, p_liked: req.body.liked,
    }).then(check), false);
    res.json({ data });
  }));
  app.delete('/api/reviews/:id', asyncRoute(async (req, res) => {
    const data = await perform(req, async reviewId => {
      const removed = check(await req.db.from('reviews').delete().eq('id', reviewId).select('id'));
      if (removed?.length !== 1) throw httpError(403, 'Deletion denied');
      return { success: true };
    });
    res.json({ data });
  }));
  app.patch('/api/reviews/:id', asyncRoute(async (req, res) => {
    const fields = ['rating_version', 'course_id', 'year_term', 'attendance_strictness', 'grading_leniency',
      'effort_matters', 'workload_difficulty', 'approachability', 'teaching_quality', 'comment'];
    const payload = Object.fromEntries(fields.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (payload.rating_version !== 2) throw httpError(400, 'Invalid rating version');
    payload.status = 'pending';
    payload.reject_reason = null;
    const data = await perform(req, async (reviewId, before) => {
      if (before.user_id !== req.user.id) throw httpError(403, 'Editing denied');
      const changed = check(await req.db.from('reviews').update(payload).eq('id', reviewId)
        .eq('user_id', req.user.id).select('id'));
      if (changed?.length !== 1) throw httpError(403, 'Editing denied');
      return { success: true };
    });
    res.json({ data });
  }));
  app.post('/api/cache/refresh', asyncRoute(async (req, res) => {
    await authenticateRequest(req);
    const status = check(await req.db.rpc('get_my_admin_status'));
    if (status?.is_admin !== true) throw httpError(403, 'Administrator required');
    await cache.synchronize();
    res.json({ data: { success: true } });
  }));
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Unknown API endpoint' }));
  app.use((error, _req, res, _next) => {
    const status = error.status || 503;
    if (status >= 500) logger.error('[api]', error.message);
    res.status(status).json({ message: status >= 500 ? 'Data service temporarily unavailable' : error.message });
  });
  return app;
}
