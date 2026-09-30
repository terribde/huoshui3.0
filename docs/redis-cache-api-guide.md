# Redis 缓存与 Node API 使用说明

文档日期：2026-10-01。根据当前仓库代码整理，供前端调用、后端维护和服务器运维查阅。

本文描述实际实现，不代表本次重新检查了线上服务。部署信息引用 2026-09-27 的部署记录，历史数据量和内存用量不作为当前监控值。本次仅修改文档，不部署或改动业务代码，也不记录任何真实密码或令牌。

## 1. 架构与职责

    浏览器前端
      +-- 同域 /api/... --> Nginx --> Node API (127.0.0.1:3001)
      |                                  +--> Redis (127.0.0.1:6379)
      |                                  +--> Supabase
      +-- 原有 Supabase 调用 --> 登录、新评价提交、个人数据等

- Supabase 是主数据库，Redis 是公共数据缓存；业务变更最终仍写入 Supabase。
- Node API 负责鉴权、读缓存、回源查询、写数据库，以及更新缓存。
- 浏览器只调用同域 API，不连接 Redis，不接收 Redis 密码。无需开放公网 6379 或 3001。
- 教师搜索、筛选、排序和分页在 Node 内完成。浏览器只下载当前页，不会把整个 Redis 下载到本地。
- 当前按单个 Node 进程部署。前端静态文件、Node 服务和 Redis 是三个独立部分。

## 2. 缓存了什么

### 2.1 全部教师公开数据

默认键名：`swjtu:prod:cache:v1:teachers`，类型为 Hash。每个教师 ID 是一个 field，value 是该教师公开对象的 JSON 字符串。

| 类别 | 缓存字段 |
| --- | --- |
| 基本信息 | id、name、title、college、college_id、campus |
| 授课展示 | courses、is_teaching_this_term、recent_term_courses |
| 总体统计 | overall_score、review_count、has_historical_data、tags、rating_version |
| 六维评分 | attendance_strictness、grading_leniency、effort_matters、workload_difficulty、approachability、teaching_quality |
| 学院关联 | colleges: { id, name }，无关联时为 null |
| 授课关联 | course_offerings[]：course_id、term_id、courses: { id, name }、terms: { id, year_term, is_current } |

字段经过公开白名单过滤，数据库没有提供的字段不会凭空补齐。部分学院、课程和学期关联信息随教师对象缓存，但这不代表所有学院、课程接口都走 Redis。

### 2.2 教师的公开评价，包括历史评价

默认键名：`swjtu:prod:cache:v1:reviews:<teacherId>`，类型为 Hash。每个评价 ID 是一个 field，value 是公开评价对象的 JSON 字符串。

| 类别 | 缓存字段 |
| --- | --- |
| 标识与学期 | id、teacher_id、course_id、year_term、rating_version |
| 六维评分 | 与教师对象所列的六个评分字段相同 |
| 展示信息 | comment、author_nickname、created_at、likes |
| 来源与状态 | is_historical_migrated、status（仅 approved） |
| 关联展示 | courses: { id, name }、teachers: { name } |

**历史评价已缓存。** 它与普通评价共用同一组 Hash、同一个接口，没有按年份截断；只要属于该教师且状态为 approved，就在该组完整快照中，历史标记也会返回。

但不是启动时预加载全站所有评价：第一次查看某位教师时，才加载并缓存该教师全部公开评价。已经存在的分组会参与定期校准。

以下内容不放入公共缓存：

- 待审核、被驳回的评价，个人评价列表和管理端审核列表。
- 邮箱、用户 ID、审核人员、驳回原因等私人或内部字段。公开昵称会返回。
- 登录会话、个人资料、积分、签到、个人点赞状态。公共点赞数 likes 会缓存。
- 评价全文搜索、跨教师评价列表等未接入本 API 的查询结果。

### 2.3 完整快照标记与临时键

每个 Hash 都有一个特殊 field：`__meta`，保存 `{ refreshedAt: 时间戳毫秒 }`。它表示整组数据已完整加载，不会作为业务记录返回。即使教师没有评价，也会缓存该标记，避免空查询反复回源。

完整发布时，先写 `swjtu:prod:cache:v1:staging:<随机UUID>`，设置 TTL，再通过 RENAME 替换正式键，避免暴露只加载了一半的数据。临时键也有过期时间。

## 3. 读取与更新机制

### 3.1 读取流程

1. 启动时尝试连接 Redis，并校准全部教师及 Redis 中已经存在的评价分组。
2. 读取教师时，先读取教师 Hash；没有完整快照则从 Supabase 分批加载全部教师。
3. 读取评价时，先读取该教师的 Hash；没有快照则加载该教师全部 approved 评价。
4. 数据库读取初始每批 500 条，并检查总数、页数完整性和重复 ID，避免仅缓存第一页。
5. Node 通过 HGETALL 取出整组，在内存中搜索、排序和分页，向前端只返回当前页。
6. 同进程内，相同键的并发首次加载会合并，避免重复回源。

这里没有针对每个搜索词或每一页建立独立键。教师详情也从整个教师快照中查找。这是适用于当前少量数据的简化方案，不是 Redis 原生搜索或原生分页。

### 3.2 写入后的主动单条更新

    前端携带用户 JWT 请求 Node API
      -> Node 验证用户
      -> 使用该 JWT 调用 Supabase RLS / RPC
      -> 数据库成功提交
      -> 重新读取单条公开评价，必要时读取该教师统计
      -> Lua 脚本更新已有完整缓存
      -> 返回结果

| 操作 | 数据库行为 | 缓存行为 |
| --- | --- | --- |
| 提交新评价 | 前端直接写 Supabase，状态 pending | 不进入公共缓存，等待审核 |
| 审核通过 | approve_review RPC | 加入/更新该评价，更新教师统计 |
| 驳回 | reject_review RPC | 移除不再公开的评价，更新教师统计 |
| 编辑自己的评价 | 更新允许字段，强制回到 pending | 从公共缓存移除，更新教师统计，等待重新审核 |
| 删除 | 用户 JWT + RLS 删除记录 | 移除评价，更新教师统计 |
| 点赞或取消点赞 | set_review_like RPC | 更新单条评价的 likes，不重新读取教师统计 |

**普通业务变更不是全量下载。** 通常只回读一条评价和一位教师；点赞只回读评价。尚未建立完整快照的 Hash 不会因为一次单条更新被错误地创建为“完整缓存”，下次读取仍会完整加载。

即时更新的含义是后续请求能读取更新后的缓存，不是向所有已打开页面主动推送刷新。页面需要重新请求；写入前已经开始的读请求仍可能读取旧快照。

### 3.3 过期与校准

| 配置或操作 | 当前默认行为 |
| --- | --- |
| TTL | 604800 秒，即 7 天，作用于整个 Hash |
| 重置 TTL | 完整发布快照时重置；读取和单条更新不延长 TTL |
| 校准周期 | 3600 秒，即 1 小时；进程每 60 秒检查是否到期 |
| 定时校准范围 | 全部教师 + 扫描到的已缓存评价分组 |
| 手动校准 | 管理员 POST /api/cache/refresh，范围与定时校准相同 |
| 已过期或淘汰的评价组 | 可能不在校准扫描结果中，再次访问时重建 |

**定时校准和手动刷新会全量回读上述范围，不是按修改时间拉增量。** 它们不会预加载从未缓存的所有教师评价。普通写接口的单条更新与这种完整校准是两条不同路径。

直接在 Supabase 管理台、旧前端或其他脚本修改数据，不会触发 Node 的即时缓存更新。正常情况下要等下一次校准执行完成，或管理员手动刷新。当前没有 webhook / Realtime 自动失效机制。长 TTL 不代表走写接口的变更需要等待 7 天。

### 3.4 故障处理与限制

- Redis 读取、发布或更新失败，进程进入 BYPASS 模式，由 Node 查询 Supabase。后台每分钟检查时尝试校准，完整成功后恢复缓存。
- 如果 Supabase 也不可用，接口会报错，不保证继续提供离线旧数据。
- 数据库写入成功但缓存更新失败，不会回滚数据库；代码会尝试删除相关缓存并旁路。这不是数据库和 Redis 的跨系统事务。
- RENAME 替换和 Lua 修改在 Redis 内原子执行；写操作和校准由进程内队列协调，长校准在评价分组之间允许排队写入执行。
- 队列不跨进程。扩大为多实例或多服务器前，需要另行处理跨实例一致性。
- 一次完整分组加载会占用队列。数据量显著增大后，需要重新评估 HGETALL 和全量校准的成本。

## 4. Node API 调用

### 4.1 基础规范

浏览器基础路径为同域 /api。Nginx 将 /api/ 原样代理至 http://127.0.0.1:3001。temp.com 是原部署的站点配置名，实际访问使用该站点绑定的地址，不要求浏览器使用服务器 IP 或 3001 端口。

业务成功响应包在 data 中，例如：

    { "data": { "items": [], "total": 0 } }

错误响应格式：

    { "message": "错误信息" }

受保护请求头：

    Authorization: Bearer <Supabase用户登录会话的access_token>
    Content-Type: application/json

Content-Type 用于带 JSON body 的请求，body 上限 32KB。token 不是 Redis 密码，也不是 Supabase anon key。Node 验证登录后，使用用户 JWT 执行数据库操作，继续由 RLS 和 RPC 校验权限，不使用服务角色密钥绕过权限。

| 状态码 | 说明 |
| --- | --- |
| 200 | 成功；教师详情不存在时也返回 200，data 为 null |
| 400 | 参数错误，或经接口包装的 Supabase 操作错误 |
| 401 | 未登录、令牌无效或会话过期 |
| 403 | 权限不足或业务操作被拒绝 |
| 404 | 评价不存在/不可见，或 API 路径不存在 |
| 503 | 未分类服务错误，对外返回通用提示 |

请求体过大等解析错误还可能返回中间件的其他 4xx 状态。所有响应带 Cache-Control: no-store，避免浏览器 HTTP 缓存掩盖数据变化。

三个公开 GET 接口另带 X-Cache：HIT 表示命中 Redis；MISS 表示回源并成功建缓存；BYPASS 表示缓存旁路，直接由 Node 查询数据库。这不是浏览器静态文件缓存状态。

### 4.2 接口总表

| 方法 | 路径 | 权限和用途 |
| --- | --- | --- |
| GET | /api/teachers | 公开，教师搜索/筛选/分页 |
| GET | /api/teachers/:id | 公开，教师详情 |
| GET | /api/teachers/:id/reviews | 公开，包含历史评价的已审核评价分页 |
| POST | /api/reviews/:id/approve | 登录，RPC 检查审核权限 |
| POST | /api/reviews/:id/reject | 登录，RPC 检查审核权限 |
| POST | /api/reviews/:id/like | 登录，RPC 检查操作权限 |
| PATCH | /api/reviews/:id | 登录且为作者，另受数据库规则约束 |
| DELETE | /api/reviews/:id | 登录，删除权限由 RLS 校验 |
| POST | /api/cache/refresh | 登录且 get_my_admin_status 返回 is_admin: true |
| GET | /health | Node 内网健康检查路由 |

路径 ID 只能包含 1 至 128 位英文字母、数字、下划线或连字符，不允许保留值 __meta。当前没有 POST /api/reviews，也没有 /api/health。

### 4.3 教师查询参数

示例：GET /api/teachers?page=0&pageSize=20&sortBy=overall&onlyThisTerm=true。

| 参数 | 默认 | 规则 |
| --- | --- | --- |
| page | 0 | 从 0 开始的整数，最大 100000 |
| pageSize | 20 | 整数，1 至 100 |
| query | 空 | 去除首尾空格，最多 200 字符 |
| collegeId | 空 | 最多 200 字符；空或 all 不限学院 |
| sortBy | overall | overall / leniency / quality / attendance |
| onlyThisTerm | false | 只接受字符串 true / false |
| courseOnly | false | 只接受字符串 true / false |

搜索支持教师名、课程名的不区分大小写包含匹配，以及标签的完整文本匹配。courseOnly=true 时只匹配课程名。onlyThisTerm=true 检查授课关联的 terms.is_current。

排序字段依次对应 overall_score、grading_leniency、teaching_quality、attendance_strictness，均降序，空分数排后；同分按评价数降序，再按 ID 升序。attendance 不额外反转数值方向。

列表 data 为 { items: 教师对象数组, total: 筛选后总数 }。详情 data 为教师对象或 null。接口字段使用数据库风格的 snake_case，不是前端业务层映射后的 camelCase。

### 4.4 评价与历史评价查询

    GET /api/teachers/<teacherId>/reviews?page=0&pageSize=20

分页参数与教师列表一致，data 为 { items, total }。按 created_at 降序，同时间按 ID 升序。无论历史还是新评价，都只返回 approved。

该接口没有 historyOnly、学年或评价关键词过滤参数。合法教师 ID 没有可见评价时返回空列表，并不会先检查教师是否存在。不要把它当作任意条件的全站评价搜索接口。

### 4.5 写接口参数

| 操作 | 请求 body | data 返回值 |
| --- | --- | --- |
| approve | 无需 body | approve_review RPC 结果，仅 success: true 视为业务成功 |
| reject | { "reason": "驳回原因" } | reject_review RPC 结果，仅 success: true 视为业务成功 |
| like | { "liked": true } 或 { "liked": false } | set_review_like RPC 数据原样返回 |
| PATCH | 必须有 rating_version: 2，可带下面列出的字段 | { "success": true } |
| DELETE | 无需 body | { "success": true } |
| cache/refresh | 无需 body | { "success": true }，等待校准完成 |

reason 必须是字符串、最多 2000 字符，空字符串使用默认驳回说明。liked 必须为 JSON 布尔值，不接受字符串。

PATCH 允许字段：rating_version、course_id、year_term、六个评分字段、comment。服务端强制 status=pending、reject_reason=null，忽略其他请求字段。评分范围等进一步约束依赖数据库规则。

调用写接口超时并不代表数据库没有提交。审核、编辑、删除等操作重试前应先核实业务结果。

### 4.6 前端代码示例

在项目内复用 src/lib/cacheApi.ts 的 cacheRequest，它会自动处理 JSON、错误响应；authenticated=true 时获取当前 Supabase 会话并发送 JWT。返回值已经解包 data。

    // 按调用文件的位置调整 import 路径。
    import { cacheQuery, cacheRequest } from './src/lib/cacheApi';

    const teachers = await cacheRequest('/teachers?' + cacheQuery({
      page: 0, pageSize: 20, sortBy: 'overall',
    }));

    const teacherId = '替换为实际教师ID';
    const history = await cacheRequest(
      '/teachers/' + encodeURIComponent(teacherId) + '/reviews?page=0&pageSize=20'
    );

    const reviewId = '替换为实际评价ID';
    await cacheRequest('/reviews/' + encodeURIComponent(reviewId) + '/like', {
      method: 'POST', authenticated: true, body: { liked: true },
    });

    // 管理员操作：完整校准，不是单条增量刷新。
    await cacheRequest('/cache/refresh', {
      method: 'POST', authenticated: true,
    });

已有业务分流在 src/services/supabaseService.ts。教师查询开关开启后使用 API；评价查询只有同时满足 teacherId 存在、status==='approved'、没有 userId 且没有 query 时才使用缓存 API，其他查询保留 Supabase 直连。

### 4.7 服务器检查示例

以下 Bash 命令在服务器执行，不需要开放 Redis 或 Node 公网端口，只读取数据：

    curl -sS 'http://127.0.0.1:3001/health'
    curl -i -H 'Host: temp.com' 'http://127.0.0.1/api/teachers?page=0&pageSize=1'
    curl -i -H 'Host: temp.com' 'http://127.0.0.1/api/teachers/TEACHER_ID/reviews?page=0&pageSize=20'

第三条中的 TEACHER_ID 需替换为实际 ID；重复执行观察 X-Cache。

/health 返回形如 { ok: true, cache: 'ready', lastSync: 时间戳毫秒 }；旁路时 cache='bypass'。它读取进程状态，不会每次实时 ping Redis 或检测 Supabase，因此 HTTP 200 / ok=true 不能证明全部依赖正常。lastSync 是最后一次完整校准成功时间，不是最近一次评价更新时间。

## 5. 配置与部署

### 5.1 服务端环境变量

| 变量 | 默认值或说明 |
| --- | --- |
| HOST / PORT | 127.0.0.1 / 3001 |
| SUPABASE_URL | 必填，Supabase 项目地址 |
| SUPABASE_ANON_KEY | 必填，anon / publishable key；用户写入另带 JWT |
| REDIS_HOST / REDIS_PORT | 127.0.0.1 / 6379 |
| REDIS_USERNAME | 代码默认 default；部署记录使用 swjtu-cache |
| REDIS_PASSWORD | 必填，仅保存在受保护的服务端配置 |
| CACHE_PREFIX | swjtu:prod:cache:v1:；修改时需匹配 ACL 键权限 |
| CACHE_TTL_SECONDS | 604800 |
| CACHE_SYNC_SECONDS | 3600 |

模板为 server/.env.example。线上 systemd 从 /etc/swjtu-cache-api.env 加载环境变量，文件权限在部署记录中为 0600。不要把 Redis 凭据写入 Git、前端 VITE_* 变量或文档。

### 5.2 已有部署记录

- Redis 8.2.10，仅监听回环地址，启用密码和专用 ACL；maxmemory=256MB，maxmemory-policy=allkeys-lru。内存达到限制时键可能先于 TTL 被淘汰，下次读取重建。
- Node 服务目录 /opt/swjtu-cache/current，systemd 名称 swjtu-cache-api.service，非 root 账号运行。
- systemd MemoryMax=384M，Node --max-old-space-size=192；这与 Redis 的 256MB 限额分别计算。
- Nginx include：/www/server/nginx/conf/swjtu-cache-api.inc；站点配置：/www/server/panel/vhost/nginx/html_temp.com.conf。
- 前端目录：/www/wwwroot/temp.com，由用户手动上传。本文没有重新核验线上配置。

### 5.3 npm 构建与 Redis 的关系

当前 package.json 中 build 为 vite build，build:cache 为 node scripts/build-cache-frontend.mjs。

确保启用缓存接入的现有命令：

    npm run build:cache

该脚本在构建前设置 VITE_CACHE_API_ENABLED=true、VITE_API_BASE_URL=/api。普通 npm run build 是否启用缓存取决于构建环境；当前不能声称普通构建已默认强制开启。本次只记录实际代码，没有修改构建命令。

构建得到的 dist/ 只包含静态页面和 API 调用代码，不会把 Redis 服务、Node 进程或 Redis 密码打包进去。上传时把 dist/ 的内容放在站点根目录，index.html 和 assets/ 不要再嵌套一层 dist。Redis、Node 和 Nginx 代理需要独立运行。

修改前端开关后需要重新构建并上传，不能只修改服务器环境变量就改变已有 JS。当前 Vite 开发配置没有 /api 代理，本地启用缓存开关前需要安排合适的同域代理或访问环境。

前端 cacheRequest 遇到 API 错误会报错，不会自动改为直连 Supabase；Redis 故障旁路是 Node 内部的行为。

## 6. 运维与排查

    systemctl status swjtu-cache-api
    journalctl -u swjtu-cache-api -n 50 --no-pager
    curl -sS http://127.0.0.1:3001/health

| 现象 | 优先检查 |
| --- | --- |
| 教师查询仍直连 Supabase | 构建开关、新 dist 是否上传、旧页面是否刷新 |
| /api 返回 404 或 HTML | 是否进入正确站点、Nginx 代理是否加载 |
| /api 返回 502 | Node 进程和 127.0.0.1:3001 |
| X-Cache 为 BYPASS | Redis 连接、密码、ACL、日志和校准结果 |
| 首次评价查询较慢，后续 HIT | 首次加载该教师完整评价组，属于预期行为 |
| 后台改数据后仍看到旧值 | 是否绕过 Node 更新路径、校准是否成功、是否需管理员刷新 |
| 401 / 403 | 登录会话、作者身份、管理员权限和数据库 RLS / RPC |
| 点赞数与个人点赞状态不同步 | 公共 likes 与个人点赞状态是两个数据来源，后者不在公共缓存中 |

检查 Redis 时，在受控服务器终端使用 SCAN、HLEN、TTL。HLEN 包含一个 __meta，业务记录数需要减 1。不要为了测试开放公网 6379，不要把密码放入共享命令或截图。

回滚时先恢复不依赖 API 的前端，再考虑停止 Node；已启用缓存 API 的前端不会因为停止后端自动恢复直连。

## 7. 实现文件索引

| 文件 | 职责 |
| --- | --- |
| server/index.mjs | 环境配置、客户端初始化、启动校准、定时检查、服务监听 |
| server/app.mjs | 路由、参数校验、用户鉴权、数据库写入 |
| server/cache.mjs | Hash 缓存、完整发布、单条更新、队列、校准、旁路 |
| server/data.mjs | 字段白名单、分批回源、搜索排序分页 |
| src/lib/cacheApi.ts | 前端开关、查询参数、JWT 和 fetch 封装 |
| src/services/supabaseService.ts | 业务接口的缓存/直连分流 |
| scripts/build-cache-frontend.mjs | 缓存版前端构建 |
| server/.env.example | 不含真实密码的服务端配置模板 |
| server/deploy/nginx-cache.conf | Nginx 代理模板 |
| server/deploy/swjtu-cache-api.service | 单进程 systemd 模板 |
| docs/redis-cache-deployment.md | 原部署和验证记录 |

变更 API、字段、构建命令或缓存策略后，应同步更新本文。
