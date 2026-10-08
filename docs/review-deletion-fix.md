# 审核后删除评价修复

审核奖励流水的 `related_review_id` 外键原来使用默认 NO ACTION，导致已发放积分的评价无法删除（SQLSTATE 23503）。改为 ON DELETE SET NULL 后，删除评价只清空流水的评价关联，保留流水金额、余额快照、作者已获得的积分和 private.swjtu_review_rewards 防重复奖励记录。原有管理员和作者删除权限保持有效。

## 现有网站上线

1. 在目标 Supabase 项目的 SQL Editor 中完整运行 `supabase/migrations/20261008_review_deletion.sql`。脚本以事务执行，可重复运行，并按外键关联列识别历史约束名。失败时停止上线并保留报错；不要删除积分流水。
2. 发布包含此次修复的前端。缓存 API 已在成功删除后更新评价缓存和教师统计，无需更改删除路由。
3. 用测试评价验证审核通过后可删除，作者积分不变，奖励流水保留且 related_review_id 为空，公开列表不再显示评价，教师评价数量已更新。普通作者仍不能删除已通过评价。

现有数据库只需执行上述增量迁移，不要运行新数据库初始化文件 supabase_schema.sql。本地自动化验证使用内存 PostgreSQL，不会改动线上数据。

## 开发维护

修改 `supabase/review-deletion.sql` 后运行 `node scripts/build-schema.mjs` 生成增量迁移。新数据库的外键定义维护在 `supabase/base-schema.sql`。
