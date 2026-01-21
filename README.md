# Tabby WS Term

一个 tabby 插件，用于连接 云厂商 k8s 的 web terminal （xterm.js） 的 ws shell 连接.

连接后，可以像使用 tabby 原生tab 一样使用。

# 功能
- 可以通过 cli quickconnect 快速连接 (需要 tabby 放开限制)
- 可以通过 profile 连接
- 支持连接时启动命令
- 文件上传下载（使用 trzsz 插件）

## Quick Connect 参数

使用 CLI `quickConnect` 或浏览器 Deep Link 时，可以在 WebSocket URL 中通过 URL 参数传递额外的 Profile 配置，这些参数在连接时会被自动提取并从原始 URL 中移除。

支持的参数：

- `ws-term.option.shell`: 指定连接后执行的 shell 命令。
- `ws-term.option.confirmDisconnect`: 是否在断开连接时显示确认弹窗 (`true`/`false`)。

### 示例

```bash
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"
```
