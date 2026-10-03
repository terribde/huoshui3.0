# AI 聊天服务

现已接入网站聊天框、Supabase 登录与动态积分、Redis 临时上下文。尚未接教师查询工具。
独立 npm 包，使用自身 package-lock.json；安装：`npm ci --omit=dev --ignore-scripts`。

## 服务器

- 地址：47.108.145.230，SSH 22。
- 目录：`/opt/swjtu-ai`。
- systemd：`swjtu-ai.service`，普通账号 `swjtu-ai`，开机启动。
- 配置：`/etc/swjtu-ai.env`，root 所有，权限 600；不要提交真实配置。
- 仅监听 `127.0.0.1:3002`；nginx 6099 网站 `/api/ai/` 转发此服务，没有开放新公网端口。
- 模型：deepseek-flash；Chat Completions；thinking enabled，reasoning_effort low。
- 仅发送最终回答文字；不发送 reasoning_content，不启用 OpenAI tracing。
- 请求总超时 120 秒，最大输出 4096 tokens（思考也可能消耗额度），并发最多 2，输入最多 1000 字符。
- 断开取消不能撤销已经产生的模型费用。网站失败/取消请求退积分；会话 Redis TTL 为一小时，最多八个已结算轮次、约两万历史字符，不写入持久聊天表。
- 网站开关 `AI_WEB_ENABLED=true`，配置 Supabase URL、后端 secret/service_role key、独立 Redis ACL 账号（仅 `swjtu:ai:v1:*`）。配置参考 `.env.example`。
- 网站验证 Bearer 登录凭证；每账号最多一条生成中请求、每分钟最多六次尝试、全局最多两个。费用只读取 `point_rules.ai_question`。
- 启动和每分钟调用过期退款 RPC；预扣五分钟到期，恢复通常在过期后下一次扫描完成。数据库故障会延迟恢复。
- Redis 保存暂存回答后才结算。后续上下文仅采纳数据库确认已结算的轮次；不保存 reasoning_content。

## 调试

SSH 登录服务器后运行（Key/token 不会显示）：

```bash
cd /opt/swjtu-ai
node --env-file=/etc/swjtu-ai.env ask.mjs '你现在能做什么？'
```

直接模型冒烟测试：`node --env-file=/etc/swjtu-ai.env smoke.mjs`。
`npm test` 使用模拟模型，不产生 API 费用。

如需本地 HTTP 客户端，通过 SSH 隧道：

```bash
ssh -N -L 13002:127.0.0.1:3002 root@47.108.145.230
```

本地健康检查地址为 `http://127.0.0.1:13002/health`。
开启网站模式后，内部调试接口为 `POST /internal/ai/chat`，JSON `{"prompt":"你好"}`，必须携带 `x-debug-token`；此路径不经 nginx 转发。
不要把 token 放入前端、Git、URL 或共享日志。
SSE 成功以 `data: [DONE]` 结束，失败发送 JSON error，不发送 DONE。
HTTP 200 仅表示已打开 SSE，客户端必须检查终止事件。

## 运维

```bash
systemctl status swjtu-ai --no-pager
journalctl -u swjtu-ai -n 30 --no-pager
systemctl restart swjtu-ai
```

通过安全终端编辑 `/etc/swjtu-ai.env` 后重启服务即可更换 Key。
发布时原地更新 `/opt/swjtu-ai`，安装锁定依赖后测试并重启；不创建版本备份目录。
安装依赖时使用 `umask 022`，代码和依赖必须允许服务账号读取；配置文件仍保持 600。
代码、锁文件、单元测试、systemd/nginx 模板及本文由用户自行提交 Git。

## 网站协议

- `GET /api/ai/config` 返回 available/cost/balance/maxLength；读取失败不提供默认价格。
- `POST /api/ai/chat`：prompt/conversationId/requestId/expectedCost。正文历史不由浏览器提交。
- SSE JSON 的 type 为 status/delta/done/error；只有 done 表示已结算成功。不同于内部调试接口的 DONE 字符串。
- `GET /api/ai/requests/:id`：仅查询当前用户的状态与余额，已结算回答可从短期缓存恢复。
- `POST /api/ai/requests/:id/cancel`：标记取消并终止活跃任务，返回数据库当前状态；pending 不代表已退款。
- 请求 ID 以用户隔离；SHA-256 输入为 conversationId 和规范化 prompt。重试必须复用 ID，主动重新生成使用新 ID。
- 前端支持 stop、Markdown（禁用原始 HTML 与远程图片）、清空、价格刷新和异常状态查询；刷新/换账号清空页面记录。

## 部署验证（2026-10-03）

Node 22.22.2；本地与服务器 16 项后端测试通过；项目 66 项测试、类型检查与生产构建通过。
真实流式 HTTP 200，首批内容约 1.7 秒，总耗时约 2 秒，以 DONE 正常结束，无思考字段。
另一次真实调用确认模型生成了非空 reasoning_content，仅检查长度，未打印内容。
服务重启后运行正常，内存约 52 MiB；缺失 token 返回 401。
真实临时账号验证：规则费用 2，初始 100，两轮成功后 96；第二轮记住首轮代号；重复请求 409；取消后仍为 96。测试账号、测试流水和 Redis 内容已清理。
桌面/390px 手机 UI 验证：流式显示、关闭重开保留、账号切换清空、刷新清空、停止退款、无横向溢出、原始 HTML 不执行。
现有 3001 API 健康检查正常，6099 网站返回 200。性能数字仅为单次冒烟结果。
