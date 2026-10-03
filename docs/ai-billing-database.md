# AI 积分数据库接入约定

2026-10-03 已通过 Supabase MCP execute_sql 在项目 qczsdnmwtagwbofpvwle 应用
`supabase/ai-billing.sql`。该文件是已执行的变更记录，不要重复执行；本次未写入 CLI migration history，未 Git 提交。

没有创建新表。point_transactions 新增 request_id、request_hash、event_type、related_transaction_id、
settlement_status、expires_at、settled_at、settlement_reason。历史流水的新字段均为空。
原 spend_points、积分规则、用户余额和 RLS 保持原样。当前 ai_question 为 -2，后端不得写死价格。

## 后端接口

三个 RPC 均 SECURITY INVOKER，仅 service_role 可执行；必须在可信后端先验证真实 Supabase 用户。
不能把 service_role 凭证提供给浏览器，也不能信任客户端传来的 user_id。

- `ai_reserve_points(p_user_id text, p_request_id uuid, p_request_hash text, p_expected_cost integer)`
  读取当前启用规则，比较页面展示的正数价格，锁定账户后预扣；有效期 5 分钟。
  SHA-256 小写十六进制 request_hash 由后端对 JSON.stringify({ conversationId, prompt: prompt.trim() }) 计算，不存正文；不包含可变的历史内容，保证重放时标识稳定。
  返回 created、transaction_id、request_id、status、cost、balance、expires_at。
  **只有 created=true 才能启动新的模型请求**。同一 ID 相同内容返回已有状态，不再扣分；不同内容报冲突。
  一个账号有 pending 请求时拒绝新的请求。profile 必须已存在，不自动发注册奖励。
- `ai_finalize_points(p_user_id text, p_request_id uuid, p_outcome text, p_reason text default null)`
  outcome 为 settled 或 refunded。退款原因支持 failed/cancelled/timeout/empty_response/expired/interrupted。
  返回 changed、status、cost、balance。终态不再转换；必须检查返回的实际 status，不能假设传入结果已生效。
  退款使用原 debit 金额并新增正数退款流水，动态调价不影响退款。
- `ai_refund_expired_points(p_limit integer default 100)`
  批量退还过期 pending，最多 500 条，返回实际处理数。后端启动和定时任务需调用。
  已接入 AI 后端：启动时和每 60 秒调用一次，每次 p_limit=100。数据库故障或积压可能延迟恢复。

错误：price_changed、ai_rule_unavailable、insufficient_points、ai_request_in_progress、request_id_conflict、
profile_not_found、request_not_found、reservation_expired。服务应映射成明确的客户端状态，不能重试启动重复模型请求。

新聊天入口不得再次调用旧 spend_points，否则会重复扣费。旧 RPC 为兼容其他现有界面保留。
只有收到完整非空最终回答且未取消时才结算；结算成功再发最终完成事件。
超过预扣有效期不能结算，应退款。生成超时应短于 5 分钟，定时恢复处理数据库断连或进程崩溃留下的 pending。

## 验证

`supabase/verify-ai-billing.sql` 使用模拟账户和事务 ROLLBACK；正式应用前后均通过。
涵盖重复请求、内容冲突、同账号 pending、动态价格、价格变动后原额退款、余额不足、规则停用、
重复结算/退款、过期恢复、跨账号隔离、普通用户调用拒绝、RLS 和函数授权。
未做真实并行会话压力测试；并发保护使用账户行锁及唯一索引，后续服务接入时需做端到端并发验证。
测试后模拟账户数与带 request_id 的真实流水数均为 0，原 ai_question 仍为 -2 且启用。
安全 Advisor 与执行前一致，没有本次新增函数的安全告警；已有规则/其他函数告警未在本次范围内修改。
