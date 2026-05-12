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

## 快速连接参数

使用 CLI `quickConnect` 或 URL scheme 时，可以通过 URL 参数传递额外选项。这些参数在连接时会自动从 WebSocket URL 中提取并移除。

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `ws-term.option.protocol` | 连接协议（`kube-exec` 或 `ttyd`） | `kube-exec` |
| `ws-term.option.shell` | 连接后执行的 shell 命令 | 服务端定义 |
| `ws-term.option.confirmDisconnect` | 断开连接时显示确认弹窗（`true`/`false`） | `true` |

### 使用示例

```bash
# CLI - kube-exec（默认）
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod"

# CLI - ttyd 协议
tabby quickConnect ws-term "ws://127.0.0.1:7681/ws?ws-term.option.protocol=ttyd"

# CLI - 自定义 shell 并禁用确认弹窗
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"

# URL scheme
open "tabby://quickConnect?providerId=ws-term&query=ws%3A%2F%2Fexample.com%2Fws%3Fpod%3Dmy-pod"
```