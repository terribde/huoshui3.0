# 前端服务器访问统计

## 2026-10-14 已上线（Asia/Tokyo）

- 按用户要求直接更新，未创建备份。现有发布目录 /opt/swjtu-cache/releases/20261002-timetable-01 中的 app.mjs、index.mjs 已更新并加入 analytics.mjs；现有 systemd 服务增加持久目录权限。
- Node v22.22.2 / SQLite 3.51.2。上线前在服务器实际运行环境执行 27 项后端测试全部通过。本地控制台 12 项测试、类型检查通过。
- 两个现有前端目录 /www/wwwroot/temp.com 和 /www/wwwroot/huoshui3.top 的首页均加入独立的 site-analytics-e55e61639c11.js（1,143 字节）。保留原页面构建；脚本由 scripts/build-analytics-tracker.mjs 生成，并和主应用共享启动标记，避免将来整包更新时重复采集。
- IP 入口原先落到默认 HTTPS 跳转且证书不匹配，已在 temp.com 虚拟主机明确绑定 47.108.145.230。现在 http://47.108.145.230/ 保持 HTTP 正常返回 200，https://huoshui3.top/ 同样正常。
- 首次记录：2026-10-14 00:18:40（Asia/Tokyo）。浏览器实测两个入口均上报 204，教师查询返回 3,368 人、X-Cache: HIT，选课姓名筛选正常，页面无脚本错误。未携带读取口令的汇总接口返回 401。
- 验证快照：累计 PV 4、区间 UV 3，含验证访问；数字会持续变化。Redis 有 2 个汇总键（约 584 和 955 字节），与持久记录汇总一致。服务内存快照约 76.5 MiB，这是整个缓存 API 的占用，并非 SQLite 单独占用。
- 本地控制台配置保存在被 Git 忽略的 local-console/.env；不要在文档或日志记录密钥。
- 服务器的 /var/lib/swjtu-cache/visits.sqlite 为持久记录，Redis 仍使用现有 ACL / 内存策略。未经用户请求未清理任何累计记录或现有缓存。

访问统计由已有 Node 缓存 API 接收，数据保存在同台服务器的 SQLite 文件，Redis 缓存 15 秒的统计结果。网站账号仍由 Supabase 管理，但访问统计不使用 Supabase，也不需要执行统计 SQL。

## 数据流

网站可见页面加载 → POST /api/analytics/visit → 服务器校验与限流 → SQLite 持久保存 → Redis 缓存汇总 → 本地控制台读取。

Nginx 的现有 /api/ 反向代理已经覆盖统计接口。只对页面加载上报，静态图片、JS、CSS、接口轮询、页面内弹窗不增加访问数。

## 服务器部署

1. 确认 Node >= 22.13（支持 node:sqlite），发布更新后的 server/app.mjs、server/index.mjs 和新增的 server/analytics.mjs 到现有缓存 API 发布目录，保留其余原有服务文件。若 Node 较旧先升级；ANALYTICS_ENABLED=false 时不会加载 SQLite。
2. 更新 systemd 服务：在 [Service] 中增加 StateDirectory=swjtu-cache 和 StateDirectoryMode=0700。参考 server/deploy/swjtu-cache-api.service。原服务的 ProtectSystem=strict 需要这个可写目录。使用现有 swjtu-cache 账号，不要将数据库放在前端公开目录或每次替换的发布目录内。
3. 在 /etc/swjtu-cache-api.env 增加下列配置，独立随机读取口令至少 32 字符：

    ANALYTICS_ENABLED=true
    ANALYTICS_DB_PATH=/var/lib/swjtu-cache/visits.sqlite
    ANALYTICS_TIMEZONE=Asia/Tokyo
    ANALYTICS_ALLOWED_ORIGINS=https://huoshui3.top,http://47.108.145.230
    ANALYTICS_READ_TOKEN=你生成的独立随机口令

4. 可用 node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))" 在自己的服务器终端生成口令。不要写入 VITE_ 变量、前端、URL 或提交到 Git。口令仅用于读取统计，不是 Redis 密码，也不是 Supabase 密钥。
5. 备份原配置，执行 systemctl daemon-reload，再重启 swjtu-cache-api.service。核对 /health 和原教师查询正常。此服务启动时会先同步目录缓存，需等待同步完成。更改数据库已有时区会被拒绝，避免混合不同口径；本机时区与服务器保持一致。
6. 网站根目录 .env.local 设置 VITE_ANALYTICS_ENABLED=true，按现有发布流程运行 npm run build:cache 并上传新前端。仅修改本地文件或启动控制台不会修改已上线的网站。

现有 Redis ACL 已允许统计使用的 hgetall、hset、expire，键位于现有缓存前缀下的 analytics: 命名空间，无需增加 Redis 账号权限或改变全局内存策略。Nginx 现有 /api/ 代理会透传 Authorization 和 Origin，并设置 X-Real-IP。其他公网入口必须明确加入 ANALYTICS_ALLOWED_ORIGINS（仅 origin，无尾斜杠）。

## 本地控制台连接

在 local-console/.env 填写：

    ANALYTICS_API_URL=https://huoshui3.top
    ANALYTICS_READ_TOKEN=与服务器相同的独立读取口令
    ADMIN_TIMEZONE=Asia/Tokyo

在 local-console 目录运行 npm start，打开 http://127.0.0.1:4311。外部统计地址必须为 HTTPS；也支持通过 SSH 隧道连接 http://127.0.0.1:本地端口，不将口令明文发送到公网 HTTP。

未配置 Supabase 密钥时仍可查看访问量。用户量和用户列表另需 SUPABASE_SERVICE_ROLE_KEY。浏览器只访问本地接口，由本地 Node 服务携带统计口令读取远端；口令不会发给浏览器。

## 计数和可靠性

- 每次打开或刷新正式网站计一次 PV；同一随机浏览器标识 5 秒内重复加载合并。事件 ID 永久去重，重复提交不会重复累计。localhost / 127.0.0.1 本地预览不计数。
- UV 按区间内随机浏览器标识去重，跨天合并，不是日 UV 相加。换设备、清空浏览器存储可能重复计人。
- 时间由服务器决定；默认按 Asia/Tokyo 分日。没有事件时明确显示“等待首次采集”，不声称已有历史访问为零。
- SQLite 使用 WAL 和 synchronous=FULL，成功响应前提交到本地文件；Redis 淘汰、清空或临时失联不会丢累计记录，Redis 不可用时直接查询 SQLite。Redis 只缓存不含个人信息的汇总，最长 15 秒，控制台每 60 秒刷新。
- 数据只保存随机浏览器标识、事件 ID、日期和服务器时间。IP 仅用于一分钟内存限流，不写入统计数据库。每 IP 每分钟最多 240 次、进程每分钟最多 6,000 次；机器人伪造和网络漏报仍可能影响数据，适合运营参考。
- 统计进程以单实例部署。访问记录暂不自动删除，随增长定期检查数据库大小。SQLite 适合当前单机站点；更大规模时应改为异步队列与专用统计存储。
- 持久文件仍须备份。停服务后复制数据库，或使用 SQLite 官方在线备份接口；不要在服务运行时只复制 visits.sqlite 而遗漏 WAL。服务器磁盘损坏或删除数据库仍会丢失记录。

## 验证与回退

部署后在正式域名打开网站一次，等 15 秒后查看控制台今日访问和累计访问；无读取口令访问 /api/analytics/overview 应返回 401。Redis 摘要键被淘汰后应从 SQLite 重新生成。

本地检查：npm --prefix server test；npm --prefix local-console test；npm run lint。浏览器回归：npm --prefix local-console run test:browser（需 Playwright / Edge）。

回退时将服务器 ANALYTICS_ENABLED=false，再发布关闭 VITE_ANALYTICS_ENABLED 的前端；保留 /var/lib/swjtu-cache 下的数据以便恢复。上一版生成的 Supabase 统计 SQL 已从当前方案移除；如曾手动安装，它不会再接收此新版前端的事件，无需为了本方案删除已有表。
