# Tabby WS Term

一个 tabby 插件，用于连接 云厂商 k8s 的 web terminal （xterm.js） 的 ws shell 连接.

连接后，可以像使用 tabby 原生tab 一样使用。

# 功能
- 可以通过 CLI 和 URL schema 快速连接 (需要修改 tabby 源码，尝试提交 PR中)
- 可以通过 profile 连接
- 支持连接时启动命令
- 支持连接保持
- 文件上传下载（使用 trzsz 插件）
    * 不要使用 `-b` 和 `-e` 参数，有兼容性问题
    * 建议设置 `-B 10K` 参数, 提升兼容性，防止上传失败

## Quick Connect 参数

使用 CLI `quickConnect` 或浏览器 Deep Link 时，可以在 WebSocket URL 中通过 URL 参数传递额外的 Profile 配置，这些参数在连接时会被自动提取并从原始 URL 中移除。

支持的参数：

- `ws-term.option.shell`: 指定连接后执行的 shell 命令。
- `ws-term.option.confirmDisconnect`: 是否在断开连接时显示确认弹窗 (`true`/`false`)。

### 示例

```bash
# cli
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"

# url schema
open "tabby://quickConnect?providerId=ws-term&query=ws%3A%2F%2Fexample.com%2Fws%3Fpod%3Dmy-pod%26ws-term.option.shell%3Dbash%26ws-term.option.confirmDisconnect%3Dfalse"
```
