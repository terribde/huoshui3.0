# Redis 缓存部署记录

## 2026-10-13 智能选课老师姓名筛选修复（Asia/Tokyo）

- 原因：线上 `timetable.mjs` 未部署本地已有的 `teacherName` 支持，接口忽略姓名参数；输入不存在的姓名仍返回默认 60 位教师。Redis 数据刷新不会更新接口代码。
- 已将本地 `server/timetable.mjs` 同步到当前发布目录并重启 `swjtu-cache-api.service`。18:02:59（Asia/Tokyo）完成启动同步，健康状态为 `cache=ready`。
- 原文件备份：`/www/backup/swjtu-cache-teacher-filter-20261013T090127Z/timetable.mjs`。更新后文件 SHA256：`5ff942e89bb1dfb3c40fb84416f8e4f88a71cb04432426ee77e93f87adaeacf2`。
- 姓名按包含关系筛选，忽略首尾空格与英文大小写；可与课程、星期等条件组合，且姓名搜索不受默认前 60 名限制。
- 正式域名 HTTPS 接口验证：姓名“张”返回 145 位；“高等数学 + 张”返回 4 位；“周一 + 张”返回 39 位；不存在的姓名返回空数组；清空条件恢复 60 位默认推荐。成功查询均为 200 / HIT，超长姓名返回 400。
- 新增回归测试在旧线上模块上复现失败，在当前模块上通过。本地后端 23 项、前端服务 36 项测试及 TypeScript 检查通过；服务器候选模块的 5 项课表测试通过后才替换。

## 2026-10-13 缓存刷新与当前访问入口（Asia/Tokyo）

- 当前 HTTP 入口为 **80 端口**：`http://47.108.145.230/`；正式域名支持 `https://huoshui3.top/`（443 端口）。6099 是历史端口，已不再监听。
- 已通过重启 `swjtu-cache-api.service` 触发内置全量同步，17:52:48（Asia/Tokyo）完成；同步耗时约 87 秒，期间缓存 API 暂时不可用，随后恢复为 `cache=ready`。
- 已刷新 3,368 位教师、2 个学期，以及当前 `2026-2027第1学期` 的 4,602 个教学班、6,979 段安排。
- 163 个已缓存评价分组全部刷新，公开评价缓存从 2,568 条更新为 3,018 条；尚未缓存的教师评价继续在首次访问时回源加载。
- Redis 返回 PONG，所有业务缓存快照时间均晚于本次刷新开始时间。检查时 Redis 内存约 14.89MB，限额为 256MB。
- 教师列表、智能选课推荐和抽查评价接口均返回 200、`X-Cache: HIT`；已验证本机 3001 后端及正式域名的 Nginx HTTPS 入口。80 端口的 `temp.com` 教师接口同样返回 200、HIT。

当前验证命令：

```bash
curl --fail http://127.0.0.1:3001/health
curl --fail -H 'Host: temp.com' 'http://127.0.0.1:80/api/timetable/recommendations'
curl --fail -H 'Host: temp.com' 'http://127.0.0.1:80/api/teachers?pageSize=1'
curl --fail --resolve huoshui3.top:443:127.0.0.1 'https://huoshui3.top/api/teachers?pageSize=1'
```

下文为历史部署记录，当前端口、数据量及检查结果以上述记录为准。

## 2026-10-02 课表缓存更新（Asia/Tokyo）

- 已部署 Node 新版本：`/opt/swjtu-cache/releases/20261002-timetable-01`，`/opt/swjtu-cache/current` 已指向该目录，systemd 状态 active。
- 旧版本 `/opt/swjtu-cache/releases/20260927-01` 保留。环境配置、systemd 单元和原版本路径备份在 `/www/backup/swjtu-cache-20261002-timetable-01`，目录权限 0700。
- 生产依赖锁文件 SHA256 与旧版一致，复制现有 node_modules；没有升级 Node、Redis 软件或修改 Redis 密码、ACL、内存限额、Nginx 配置。
- 已刷新教师、学期、当前学期课表及已有评价组。当前学期为 `2026-2027第1学期`，ID 为 `002df550-11e0-4c64-bd46-82ce9f76aa06`。
- Redis 课表键：`swjtu:prod:cache:v1:timetable:002df550-11e0-4c64-bd46-82ce9f76aa06`；4,602 条选课记录，6,979 段安排，教师目录 3,368 人。
- 服务器后端测试 20 项全部通过。线上健康状态 cache=ready；经实际 Nginx 站点检查，默认推荐返回 60 位教师，周一筛选返回 743 位教师，均为 HIT；原教师列表与评价接口均正常并命中缓存。
- 预热检查时 Redis 使用约 12.45MB，记录峰值约 18.11MB，限额仍为 256MB；最终检查 API systemd 内存为 97,865,728 字节（约 93.3MiB）。这些是检查时读数。
- 当时站点监听 6099 端口。首次按 80 端口检查遇到 404，验证流程自动回滚；确认当时的实际端口后再次切换并通过。2026-10-13 已确认当前改用 80 端口。
- 前端站点文件未上传或覆盖；新前端需要另行上传才能调用新选课 API。数据库课表、评价、用户、积分未修改。

验证命令（访问端口已按当前配置更新为 80）：

```bash
curl http://127.0.0.1:3001/health
curl -H 'Host: temp.com' 'http://127.0.0.1:80/api/timetable/recommendations'
curl -H 'Host: temp.com' 'http://127.0.0.1:80/api/teachers?pageSize=1'
```

下文保留 2026-09-27 的历史记录，数据量和路径应以上述本次记录为准。

部署日期：2026-09-27。服务器：47.108.145.230。目标宝塔站点：temp.com。

接口参数、调用示例、缓存字段和更新机制详见 [Redis 缓存与 Node API 使用说明](redis-cache-api-guide.md)。

## 已部署后端

- Redis 8.2.10，仅监听 `127.0.0.1:6379`，保护模式开启。
- 运行时与磁盘配置均已设置 `maxmemory 256mb`、`maxmemory-policy allkeys-lru`，密码认证已生效。
- API 使用专用 Redis ACL 账号 `swjtu-cache`，仅允许访问 `swjtu:prod:cache:v1:*`。
- 后端目录：`/opt/swjtu-cache/releases/20260927-01`，当前版本链接：`/opt/swjtu-cache/current`。
- systemd 服务：`swjtu-cache-api.service`，使用非 root 账号 `swjtu-cache`，监听 `127.0.0.1:3001`，开机启动、异常自动重启。
- 服务端配置：`/etc/swjtu-cache-api.env`，权限 0600。凭据没有写入前端或本地上传包。
- Nginx 仅在 `html_temp.com.conf` 中增加 API include，文件为 `/www/server/nginx/conf/swjtu-cache-api.inc`。
- 初始配置备份：`/www/backup/swjtu-cache-20260927T112142Z`。
- 本次未覆盖 `/www/wwwroot/temp.com` 内的任何前端文件，也未修改另一个 huoshui3.top 站点。

## 缓存行为

全部教师按 ID 存入一个 Redis Hash；目前共 2,624 位。搜索、筛选、排序及分页在 API 中完成，浏览器仍按需读取。

已审核通过的评价按教师分组缓存，首次访问时分批读完该教师全部公开评价，之后从缓存分页返回。待审核评价、个人信息和个人点赞状态不进入公共缓存；邮箱、用户 ID、审核人员等字段不对外返回。

审核、撤回、删除、编辑、点赞通过 API 转发用户 JWT，仍由现有 Supabase RLS/RPC 校验权限。数据库提交成功后读取受影响的单条评价与教师统计并更新缓存，普通变更不会下载全站数据。尚未建立完整快照的分组不会被单条增量误标记为完整。

过期时间为 7 天，每小时校准全部教师及已缓存的评价分组。直接在 Supabase 后台修改数据可能等待下一次校准。管理员可携带有效用户 JWT 调用 `POST /api/cache/refresh` 提前同步。

新前端上传前，旧前端仍直接访问 Supabase，不会触发 API 的即时更新；待上传新版后完整启用。已有旧页面需要刷新以载入新版本。

## 前端手动上传

1. 上传包为 `release/redis-cache-20260927/temp.com-frontend.zip`，只含前端静态文件。
2. 先备份宝塔 `temp.com` 站点现有文件。
3. 将压缩包解压后的内容上传到 `/www/wwwroot/temp.com/`。`index.html` 和 `assets/` 应直接位于该目录，不要再套一层 `dist/`。
4. 覆盖同名文件，暂时保留旧的带哈希名称的 assets 文件，方便旧页面和回滚使用。
5. 刷新浏览器，检查教师列表和历史评价。网络面板中的 `/api/teachers` 及 `/api/teachers/<id>/reviews` 应返回 200，重复查询响应头 `X-Cache` 应为 `HIT`。

以后重新打包使用 `npm run build:cache`。它调用 Vite build，同时启用 `VITE_CACHE_API_ENABLED=true` 和同域 `/api`。普通 `npm run build` 仍保留原有构建行为，是否启用缓存取决于环境变量。

`temp.com` 是服务器站点配置名；公网访问应使用实际绑定到该站点的地址。本次浏览器验证通过 SSH 隧道连接该虚拟主机，没有修改公网域名或证书。

## 验证记录

- 原有测试及新增前端服务测试：51 项。
- 后端查询、隐私、权限、并发刷新及增量缓存测试：15 项。
- TypeScript 检查与缓存版前端构建通过；后端生产依赖 npm audit 为 0 个已知漏洞。
- 线上教师总数、前两页排序、课程搜索和学期过滤已与 Supabase 对照。
- 抽查赵春明的 120 条历史评价，所有分页完整、不重复，公开响应无私人字段；首次 MISS，后续 HIT。
- 已在真实 Redis 的独立临时键中验证单条更新与删除，测试键已清除。
- 桌面和手机浏览器无脚本错误；历史评价弹窗及下一页已通过真实 API 验证。
- 未使用真实用户账号执行审核、点赞或删除，没有改动线上评价、用户或积分。写操作的权限与缓存刷新通过本地测试验证。
- 上线检查时 Redis 使用内存约 4.8MB，API systemd 内存约 40MB，具体值随使用变化。

## 运维

```bash
systemctl status swjtu-cache-api
journalctl -u swjtu-cache-api -n 50 --no-pager
curl http://127.0.0.1:3001/health
curl -H 'Host: temp.com' 'http://127.0.0.1/api/teachers?pageSize=1'
```

前端需要回滚时恢复上传前的静态文件备份即可，旧版本继续直接访问 Supabase。后端可独立停止；停止前先确保使用 API 的前端已回滚。此次没有数据库迁移。
