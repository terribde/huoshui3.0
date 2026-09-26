# P1 修复与 Supabase 数据库升级

适配依据：2026-09-24 用户提供的线上字段、约束、RLS、触发器、RPC 和 `point_rules` 报告。

## 先分清三个文件

| 文件 | 用途 | 是否保留改动 |
| --- | --- | --- |
| `supabase/dry-run-p1.sql` | 在现有数据库里试运行升级和模拟测试 | 不保留，最后执行 ROLLBACK |
| `supabase/migrations/20260924_p1_security.sql` | 正式升级现有数据库 | 保留，最后执行 COMMIT |
| `supabase/verify-p1.sql` | 升级后再验收权限、签到、扣费、审核发奖 | 不保留测试数据，最后执行 ROLLBACK |

根目录 `supabase_schema.sql` 只用于**全新空数据库**，不要对现有线上数据库执行。其 CREATE TABLE 不使用 IF NOT EXISTS，防止把新建脚本误当作升级脚本。

## 现有项目的执行步骤

1. 保存当前数据库备份和 `supabase/preflight.sql` 的结构报告。
2. 在 Supabase SQL Editor 新建查询，完整粘贴并运行 `supabase/dry-run-p1.sql`。
3. 最后一行应返回 `PASS: test data rolled back; no test users or balances retained`。测试使用随机 ID 和 `example.invalid` 邮箱，只通过 SQL 建立临时测试记录，不调用发邮件 API。整个事务回滚后，升级改动和测试记录都不保留。试运行期间会短暂持有表锁，宜在低访问时执行。
4. 若失败，把原始错误提供给开发者。不要删掉失败的语句继续运行，也不要单独运行试运行文件的一部分。
5. 试运行通过后，完整执行 `supabase/migrations/20260924_p1_security.sql`。该脚本由 BEGIN/COMMIT 包裹，任何步骤报错会使整个升级事务无法提交。
6. 完整执行 `supabase/verify-p1.sql`，确认同样返回 PASS。
7. 部署本次前端构建，重新登录管理员账号，验证管理员入口和普通用户签到。应先升级数据库再部署前端；新版前端依赖 `get_my_admin_status()`。

没有额外创建管理员、恢复已停用管理员或硬编码授权邮箱。正式升级保留现有 `admin_users` 名单；`super_admin` 可管理名单，`admin`/`moderator` 可审核。管理员身份通过已验证的登录邮箱匹配启用名单。全新数据库的首位超级管理员需由项目所有者在 SQL Editor 明确添加。

### 试运行出现 private schema 不存在

用户已确认旧版试运行是完整粘贴执行；本地按提供的线上结构未复现该错误，线上原因尚未确定。新版 `dry-run-p1.sql` 首行带有 `P1 DRY RUN v2`，将创建 `private` 单列为前置阶段，后续 SQL 在阶段执行时解析，并为错误附加阶段编号及原始上下文。这是诊断改进，尚不能据此认定线上问题已经修复。

在 SQL Editor 新建查询，用新版文件的全部内容执行。成功仍返回 PASS 并回滚所有试运行改动；失败请保留完整的 `P1 dry-run stage`、`DETAIL`、`CONTEXT` 和 `HINT`。阶段依次为 01 结构检查、02 创建 private、03 字段兼容、04 权限与函数、05 模拟验收。不要为绕过报错而单独永久创建 private，也不要继续执行正式升级。若编辑器提示事务已中止（25P02），先执行 `ROLLBACK;` 结束失败事务，再完整重试。

## 本次升级具体改动

- 仅保留教师/学院/课程/学期/积分规则的公开读取。
- 清理应用相关表的旧策略及历史列授权，再明确授予必要权限。学生只能提交自己的待审评价、修改自己的待审或被驳回评价。
- 普通客户端不能直接写用户余额或积分流水；审核、签到、扣费必须调用 RPC。
- 管理员也不能直接修改审核状态，必须使用审核 RPC，确保状态和奖励在同一个事务内提交。
- 审核奖励通过原子累加更新真实余额，使用私有奖励登记表按评价 ID 防止重复发奖；登记表不能通过客户端访问。
- 签到以 Asia/Shanghai 日期为准，在检查日期前锁定用户积分行，避免重复签到奖励。
- 增加线上 RPC 已引用但表中缺失的可空字段 `point_transactions.action`，保留消费备注。原 action_code 外键仍然保留。
- 评价默认状态从 approved 改为 pending，不修改已有评价状态。
- 添加查询索引和管理员邮箱大小写归一唯一索引。若现有管理员邮箱仅大小写不同但出现多条记录，升级会报错并回滚，需要先人工核对，不会静默合并。
- 保留现有 `on_auth_user_created` 和 `trg_recalc_teacher_scores` 触发器及其函数内容，不添加第二个注册触发器。
- 保留现有积分规则：注册 100、签到 5、审核 20；AI -2、筛选 -3、攻略 -10。消费价格、启停状态以 point_rules 为准，不重写这些记录。
- 为历史正向评价流水以及已有 approved 评价登记防重标记，不追补或重发历史奖励，也不重算历史余额。已有历史数据正确性不在本轮自动修正范围内。

`document_chunks` 及 AI 检索功能不属于本轮修复，不变更其表和业务逻辑。密码邮件及登录流程不在本轮扩展。

## 前后端不一致清单

| 项目 | 原仓库/前端 | 线上实际结构 | 本轮处理 |
| --- | --- | --- | --- |
| 学院、课程、学期 ID | 旧脚本没有完整关系结构 | UUID，课程和教师等通过外键关联 | 新建脚本和升级守卫按线上类型编写 |
| 评价课程与驳回原因 | 旧 SQL 是 course_name / rejection_reason | course_id / reject_reason | 不向线上加回旧字段 |
| 积分流水备注 | 签到/扣费函数引用 action | 表中没有 action | 增加可空备注列 |
| 签到返回类型 | 旧 SQL 为 JSON | TABLE(points, already_checked_in) | 保持线上 TABLE 类型，前端兼容数组行 |
| 初始赠分来源 | 本地也自行显示/补写 100 | 注册触发器 + new_user_welcome 规则 | 取消客户端造余额，保留注册触发器 |
| 消费定价 | 旧逻辑 2/2/5 | point_rules 为 2/3/10 | 服务端统一读取规则，删除客户端降级定价 |
| 管理员 | 邮箱特征、元数据、口令、本地缓存 | 显式授权名单 | 仅服务器根据名单判定；超管管理名单 |
| 评分统计 | 旧建表脚本缺失 | 已有评分重算触发器 | 线上保留；新建库提供同类触发器 |

## 本地验证与维护

```text
npm ci
npm run schema:build
npm test
npm run lint
npm run build
```

使用 PGlite 在本地运行真实 PostgreSQL SQL、RLS 和事务测试；Supabase 的 auth.users/auth.uid 在测试中用最小模型模拟。测试包含线上结构复现、升级前缺失 action 列的失败、升级后成功、触发器不变、余额保留、角色隔离、重复发奖、防止透支和失败回滚。PGlite 单连接测试不能替代真实并发压力测试。

SQL 源文件为 `supabase/base-schema.sql`、`migration-guard.sql`、`production-compat.sql`、`security.sql`、`fresh-hooks.sql`、`verification-body.sql`。修改后运行 `npm run schema:build`，生成新建脚本、正式升级、试运行和验收脚本，不单独手改生成文件。
