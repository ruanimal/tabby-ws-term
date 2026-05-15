# K8s Dashboard 集成总结

## 概览
本文档记录将 Kubernetes Dashboard 终端接入 Tabby 的实现过程、遇到的问题、已采取的修复与注意事项，便于后续维护与排障。

## 关键文件
- [src/protocols/k8s-dashboard.handler.ts](src/protocols/k8s-dashboard.handler.ts)
- [src/session.ts](src/session.ts)
- [src/protocols/__tests__/k8s-dashboard.handler.spec.ts](src/protocols/__tests__/k8s-dashboard.handler.spec.ts)
- [docs/k8s-dashboard-ws-test.py](docs/k8s-dashboard-ws-test.py)
- [docs/k8s-dashboard-ws-test-run.sh](docs/k8s-dashboard-ws-test-run.sh)

## 架构要点
- Dashboard 的终端流程由两部分组成：
  1. HTTP API：创建 exec session（返回 session id）。
  2. SockJS/WebSocket：基于 session id 建立实时通道并发送 bind/resize/stdin。
- 浏览器端登录后把加密的 `jweToken` 写入 Cookie（URL 编码），前端 HTTP 拦截器会把解码后的原始 JSON 放到请求头 `jwetoken`（未编码），再调用 shell API。
- 后端 API 模块并不直接从 Cookie 解密 jweToken；它读取 `jwetoken` 头或 `Authorization` 头来认证请求。

## 遇到的问题与修复
1. 认证失败（HTTP 401）
   - 症状：handler 使用 Cookie-only 创建 session 时返回 401；Python 测试脚本传 `Authorization: Bearer <k8s_token>` 则成功。
   - 原因：后端期望 `jwetoken` 请求头或 `Authorization`，而仅有 Cookie（URL 编码）并不能直接被后端使用。
   - 处理：在 [src/protocols/k8s-dashboard.handler.ts](src/protocols/k8s-dashboard.handler.ts) 的 `prepareConnection()` 中同时设置：
     - `Cookie: jweToken=<URL encoded>`（保持浏览器一致）
     - `jwetoken: <original jweToken JSON>`（模拟浏览器拦截器）
   - 测试：已在 `docs/k8s-dashboard-ws-test.py` 中用 `requests.Session` 自动维护 Cookie，并添加 `jwetoken` 头，创建 session 成功（HTTP 200）。

2. SockJS `c` 关闭帧未处理
   - 症状：服务端返回 `c[2,"Unauthorized"]` 等关闭帧时，客户端日志只看到连接关闭，缺失关闭原因，排查困难。
   - 修复：在 `decode()` 中解析 `c` 帧并生成可见服务消息（toast）。文件：[src/protocols/k8s-dashboard.handler.ts](src/protocols/k8s-dashboard.handler.ts)。

3. `a` 帧只处理第一条消息（丢消息）
   - 症状：SockJS 批量消息 `a["m1","m2"]` 时，只处理第一个元素，导致输出丢失或乱序。
   - 修复：遍历 `outerArray` 的所有元素并逐条处理。文件：[src/protocols/k8s-dashboard.handler.ts](src/protocols/k8s-dashboard.handler.ts)。

4. 初始化时序导致 bind 丢失（关键）
   - 症状：在 WebSocket `open` 事件后客户端立即发送 resize 或其它消息，可能在 SockJS 服务器发送 `"o"` 帧之前把 `resize` 当作第一条消息，导致服务器端 `handleTerminalSession` 没有收到 `bind`（它期望 bind 是第一条），连接被关闭；恢复 tab 时偶现能工作（取决于 resize 时机）。
   - 修复：在 `session.ts` 中引入 `receivedOpenMessage` 标志：
     - 对于 k8s-dashboard（SockJS）协议，**等待接收到服务端的 `"o"` 帧后**再发送 `bind`、`resize`、`stdin`。
     - 对于其他协议（非 k8s-dashboard），保持原行为：open 后立即发送初始化消息。
   - 文件：[src/session.ts](src/session.ts)

## 测试覆盖
- 已补充/新增单元测试覆盖 `a` 帧批处理、`c` 帧解析、`extractJweToken()` 等，所有相关测试均通过（见 [src/protocols/__tests__/k8s-dashboard.handler.spec.ts](src/protocols/__tests__/k8s-dashboard.handler.spec.ts)）。
- 集成测试脚本：`docs/k8s-dashboard-ws-test.py`（使用 `requests.Session` + `jwetoken` 头）成功创建 session 并连接 WebSocket；运行脚本见 `docs/k8s-dashboard-ws-test-run.sh`。

## 可复现步骤（快速验证）
1. 用浏览器登录 Dashboard，确认 cookie 中有 `jweToken`。
2. 在项目根目录运行测试脚本：

```bash
bash docs/k8s-dashboard-ws-test-run.sh
```

3. 查看脚本输出：应看到 HTTP 200 `/api/v1/pod/.../shell`、返回 `id`，以及后续 WebSocket 的 `o`/stdout 输出。

## 运行时注意事项
- `jweToken` 是有过期时间的（JWE 中 `aad`/`exp`），需要考虑长会话的刷新或重新登录逻辑。
- 不要在 WebSocket 握手/升级请求中携带过多认证头或 Cookie（可能触发网关的额外校验），对 SockJS 使用 session id（query）+ bind 消息作为凭据。
- 将 `c` 帧信息暴露为服务消息以便运维快速定位问题。

## 建议的后续工作
- 在仓库中加入本文件（已保存）。
- 在 CI 中加入对关键集成测试脚本的运行（可选），以防 Dashboard 侧变化导致兼容性回归。
- 在生产部署下验证 Tabby 到 Dashboard 的流量是否经过同样的 auth 中间件（避免直接内网路由绕过解密）。

---
文档由实现与调试过程整理生成。如需我将其提交为 PR 或放入特定位置（不同文件名/语言），我可以继续处理。
