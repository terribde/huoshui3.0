# 2026-10-14 管理员入口与积分读取修复

状态：本地修复和验证完成，未发布线上。用户要求线上 Node 服务与接口暂不修改；本次无需后端或 SQL 变更。

## 已核实

- 正式域名当时返回入口 `/assets/index-C2xFchWx.js`，审核模块为 `AdminAuditModal-DC0TMx9v.js`。
- 只读核对数据库：两名管理员均启用，对应 Auth 账号存在、邮箱已验证、未封禁。没有修改账号、权限或评价。
- 线上 `checkIsAdmin` 将权限 RPC 的网络错误、服务错误、异常响应统一转成 `isAdmin:false`。审核弹窗二次校验失败会显示“当前账号未获得有效管理员授权，请联系超级管理员。”，无法据此判断是真实拒绝还是连接失败。此次用户浏览器的具体失败响应尚未取得。
- 积分读取先等待额外的 `auth.getUser()` 网络请求，再读余额与流水；初始化、登录事件、窗口 focus / visibility、个人中心 effect 存在重复触发。旧版只采用最后一次请求结果，重复请求会增加等待。
- 线上主脚本仍有 `/api/analytics/visit` 基础访问统计，未找到 `/api/analytics/events` 行为埋点调用。基础统计调用没有等待鉴权或积分，也不会阻止 React 启动；现有证据不能将本次延迟归因于埋点。

## 前端修改

- 权限校验区分明确拒绝、会话过期、接口失败与异常响应；临时读取错误自动重试一次，RPC 设置 12 秒请求超时，弹窗提供手动重新核验。失败状态始终不授予权限。
- 相同身份的 token 刷新不再触发父组件反复清空管理员状态，避免正在使用的审核弹窗卸载。切换账号和退出仍清空权限。
- 积分与点赞只读请求使用 SDK 当前会话，数据库依然通过 JWT 与 RLS 校验权限；省去额外串行的 `/auth/v1/user` 往返。
- INITIAL_SESSION 负责恢复身份，删除重复初始化 getUser；同一用户的积分并发刷新合并，focus 和 visibility 事件去重。
- 加载期间发生扣费或实时变更会排队再读一次；旧账号的迟到响应不覆盖新账号。余额仍以数据库为准。

## 验证

- `npm run lint`：通过。
- `node --test tests/supabase-service.test.mjs`：39 项通过。
- `node --test tests/supabase-security.test.mjs tests/community-security.test.mjs`：16 项通过，在本地数据库执行。
- `node scripts/verify-auth-browser.mjs`：使用本地模拟数据验证真实 App 与审核弹窗；涵盖错误提示、重试恢复、无权限拒绝、token 刷新、启动积分请求次数、focus 合并、变更后重读及跨账号隔离。
- `npm run build:cache`：通过。

## 发布边界

`release/auth-points-frontend-20261014.zip` 仅包含本地 `dist` 的前端静态文件，不包含 server、环境密钥或测试页面。构建保留工作区已有前端改动，不能视为独立于工作区的单文件补丁。

目标站点是正式域名对应的 `/www/wwwroot/huoshui3.top`。发布时先上传 assets 等静态资源，再替换 index.html，保留旧 hash 资源供已打开的页面使用。不需要重启 Node、刷新 Redis、修改接口、数据库或 Nginx。发布前应核对线上版本是否有其他并发更新。

当前 SSH 批处理登录被服务器拒绝，因此没有上传或修改任何线上文件。上线后的真实账号验收仍待完成。
