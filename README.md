# Tabby WS Term

[中文](README.zh-CN.md)

A Tabby plugin for connecting to cloud provider K8s Web Terminal (xterm.js) WebSocket shell sessions.

Once connected, it functions just like a native Tabby tab.

# Features
- quick connect via CLI and URL schema (requires change Tabby source code, try to submit PR)
- Connection via profiles
- Supports startup commands upon connection
- Supports keep-alive
- File upload and download (using `trzsz` plugin)
    * Do not use `-b` and `-e` parameters due to compatibility issues
    * Recommends setting `-B 10K` parameter to improve compatibility and prevent upload failures

## Quick Connect Parameters

When using CLI `quickConnect` or browser Deep Links, extra Profile configurations can be passed through URL parameters in the WebSocket URL. These parameters are automatically extracted and removed from the original URL upon connection.

Supported parameters:

- `ws-term.option.shell`: Specifies the shell command to execute after connecting.
- `ws-term.option.confirmDisconnect`: Whether to display a confirmation dialog when disconnecting (`true`/`false`).

### Example

```bash
# cli
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"

# url schema
open "tabby://quickConnect?providerId=ws-term&query=ws%3A%2F%2Fexample.com%2Fws%3Fpod%3Dmy-pod%26ws-term.option.shell%3Dbash%26ws-term.option.confirmDisconnect%3Dfalse"
```
