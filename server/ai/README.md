# 内部 AI 服务

一期仅验证 Agents SDK 与 DeepSeek，不接教师数据、工具、积分或网站入口。
独立 npm 包，使用自身 package-lock.json；安装：`npm ci --omit=dev --ignore-scripts`。

## 服务器

- 地址：47.108.145.230，SSH 22。
- 目录：`/opt/swjtu-ai`。
- systemd：`swjtu-ai.service`，普通账号 `swjtu-ai`，开机启动。
- 配置：`/etc/swjtu-ai.env`，root 所有，权限 600；不要提交真实配置。
- 仅监听 `127.0.0.1:3002`。没有新增 nginx 路由或公网端口。
- 模型：deepseek-flash；Chat Completions；thinking enabled，reasoning_effort low。
- 仅发送最终回答文字；不发送 reasoning_content，不启用 OpenAI tracing。
- 请求总超时 120 秒，最大输出 4096 tokens（思考也可能消耗额度），并发最多 2，输入最多 1000 字符。
- 断开取消不能撤销已经产生的模型费用。当前请求互相独立，不保存会话。

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
聊天接口为 `POST /api/ai/chat`，JSON `{"prompt":"你好"}`，必须携带配置中的 `x-debug-token`。
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
代码、锁文件、单元测试、systemd 模板及本文由用户自行提交 Git。

## 部署验证（2026-10-03）

Node 22.22.2；本地与服务器 6 项测试通过；真实非流式调用成功。
真实流式 HTTP 200，首批内容约 1.7 秒，总耗时约 2 秒，以 DONE 正常结束，无思考字段。
另一次真实调用确认模型生成了非空 reasoning_content，仅检查长度，未打印内容。
服务重启后运行正常，内存约 52 MiB；缺失 token 返回 401。
现有 3001 API 健康检查正常，6099 网站返回 200。性能数字仅为单次冒烟结果。
