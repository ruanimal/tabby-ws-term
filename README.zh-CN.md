# Tabby WS Term

一个 Tabby 插件，用于连接 WebSocket 终端会话，支持多种协议：

- **kube-exec**：Kubernetes `kubectl exec` 风格的 WebSocket 连接（默认）
- **ttyd**：[ttyd](https://github.com/tsl0922/ttyd) WebSocket 终端连接

连接后，可以像使用 Tabby 原生标签页一样使用。

## 功能特性

- 支持 CLI 和 URL scheme 快速连接
- 支持通过 Profile 连接
- 支持连接时执行启动命令
- 支持连接保持
- 支持文件上传下载（通过 `trzsz` 插件）
  - 不要使用 `-b` 和 `-e` 参数（存在兼容性问题）
  - 建议设置 `-B 10K` 以提升兼容性，防止上传失败

## 支持的协议

| 协议 | 说明 |
|------|------|
| `kube-exec` | Kubernetes `kubectl exec` 风格的 WebSocket 连接（默认） |
| `ttyd` | [ttyd](https://github.com/tsl0922/ttyd) WebSocket 终端连接 |
| `k8s-dashboard` | Kubernetes Dashboard（SockJS）终端会话；需要 `jweToken`/`jwetoken` 认证并遵循 SockJS 的 "o" 握手 |

## 快速连接参数

使用 CLI `quickConnect` 或 URL scheme 时，可以通过 URL 参数传递额外选项。这些参数在连接时会自动从 WebSocket URL 中提取并移除。

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `ws-term.option.protocol` | 连接协议（`kube-exec`、`ttyd` 或 `k8s-dashboard`） | `kube-exec` |
| `ws-term.option.shell` | 连接后执行的 shell 命令 | 服务端定义 |
| `ws-term.option.allowInsecure` | 是否允许自签名证书（跳过证书验证） | `false` |
| `ws-term.option.confirmDisconnect` | 断开连接时显示确认弹窗（`true`/`false`） | `true` |

### 使用示例

```bash
# CLI - kube-exec（默认）
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod"

# CLI - ttyd 协议
tabby quickConnect ws-term "ws://127.0.0.1:7681/ws?ws-term.option.protocol=ttyd"

# CLI - k8s-dashboard（示例）
# 传递 `pod` 和 `namespace`，并根据需要包含 `jweToken`/`authMode`/`username`
tabby quickConnect ws-term "wss://dashboard.example.com/?pod=my-pod&namespace=default&authMode=token&username=dashboard-admin&jweToken=..."

# CLI - 自定义 shell 并禁用确认弹窗
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"

# URL scheme
open "tabby://quickConnect?providerId=ws-term&query=ws%3A%2F%2Fexample.com%2Fws%3Fpod%3Dmy-pod"
```

## 浏览器 userscript

仓库包含一个配套的浏览器 userscript：`browser_scripts/k8s-dashboard-tabby.user.js`。

- 目的：从 Kubernetes Dashboard 的 cookie 中提取 `jweToken`、`authMode` 与 `username`，构造 `tabby://` quickConnect URL，便于在浏览器中一键启动 `k8s-dashboard` 会话。
- 使用方法：在浏览器中安装脚本（Tampermonkey/Violentmonkey），打开 Dashboard 页面，使用注入的 Tabby 链接即可把带认证参数的 URL 传给 Tabby。

