const TTL = 3600;
export class RedisConversations {
  constructor(redis, prefix = 'swjtu:ai:v1:') { this.redis = redis; this.prefix = prefix; }
  key(user, kind, id) { return `${this.prefix}${user}:${kind}:${id}`; }
  async history(user, conversation) {
    return JSON.parse(await this.redis.get(this.key(user, 'conversation', conversation)) || '[]');
  }
  async save(user, conversation, pairs) {
    await this.redis.set(this.key(user, 'conversation', conversation), JSON.stringify(pairs.slice(-8)), 'EX', TTL);
  }
  async result(user, request) { return JSON.parse(await this.redis.get(this.key(user, 'result', request)) || 'null'); }
  async saveResult(user, request, result) { await this.redis.set(this.key(user, 'result', request), JSON.stringify(result), 'EX', TTL); }
  async cancelled(user, request) { return Boolean(await this.redis.get(this.key(user, 'cancel', request))); }
  async cancel(user, request) { await this.redis.set(this.key(user, 'cancel', request), '1', 'EX', 600); }
  async rate(user) {
    const count = await this.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, this.key(user, 'rate', 'minute'));
    return count <= 6;
  }
}

const check = result => { if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code }); return result.data; };
export class SupabaseBilling {
  constructor(client) { this.client = client; }
  async config(user) {
    const [rule, account] = await Promise.all([
      this.client.from('point_rules').select('points_delta,is_active').eq('action_code', 'ai_question').maybeSingle(),
      this.client.from('user_profiles').select('points').eq('id', user).maybeSingle(),
    ]);
    const r = check(rule), a = check(account);
    if (!a) throw new Error('profile_not_found');
    const available = Boolean(r?.is_active && Number.isInteger(r.points_delta) && r.points_delta < 0);
    return { available, cost: available ? -r.points_delta : null, balance: a.points, maxLength: 1000 };
  }
  async reserve(user, request, hash, price) {
    return check(await this.client.rpc('ai_reserve_points', { p_user_id: user, p_request_id: request, p_request_hash: hash, p_expected_cost: price }));
  }
  async finalize(user, request, outcome, reason) {
    return check(await this.client.rpc('ai_finalize_points', { p_user_id: user, p_request_id: request, p_outcome: outcome, p_reason: reason }));
  }
  async status(user, request) {
    const tx = check(await this.client.from('point_transactions').select('settlement_status,amount,expires_at').eq('user_id', user).eq('request_id', request).eq('event_type', 'ai_debit').maybeSingle());
    const account = check(await this.client.from('user_profiles').select('points').eq('id', user).maybeSingle());
    return { status: tx?.settlement_status || 'not_found', cost: tx ? -tx.amount : null, balance: account?.points, expiresAt: tx?.expires_at };
  }
  async settled(user, requests) {
    if (!requests.length) return new Set();
    return new Set(check(await this.client.from('point_transactions').select('request_id').eq('user_id', user).eq('event_type', 'ai_debit').eq('settlement_status', 'settled').in('request_id', requests)).map(r => r.request_id));
  }
  async recover() { return check(await this.client.rpc('ai_refund_expired_points', { p_limit: 100 })); }
}
