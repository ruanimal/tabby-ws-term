# Tabby WS Term

[中文](README.zh-CN.md)

A Tabby plugin for connecting to WebSocket terminal sessions, supporting multiple protocols:

- **kube-exec**: Kubernetes `kubectl exec` style WebSocket connections (default)
- **ttyd**: [ttyd](https://github.com/tsl0922/ttyd) WebSocket terminal connections

Once connected, it functions just like a native Tabby tab.

## Features

- Quick connect via CLI and URL schema
- Connection via profiles
- Startup commands upon connection
- Keep-alive support
- File upload and download (via `trzsz` plugin)
  - Avoid using `-b` and `-e` parameters (compatibility issues)
  - Recommend setting `-B 10K` to improve compatibility and prevent upload failures

## Supported Protocols

| Protocol | Description |
|----------|-------------|
| `kube-exec` | Kubernetes `kubectl exec` style WebSocket connections (default) |
| `ttyd` | [ttyd](https://github.com/tsl0922/ttyd) WebSocket terminal connections |
| `k8s-dashboard` | Kubernetes Dashboard (SockJS) terminal sessions; requires `jweToken`/`jwetoken` authentication and SockJS "o" handshake |

## Quick Connect Parameters

When using CLI `quickConnect` or URL schema, extra options can be passed via URL parameters. These parameters are automatically extracted and removed from the WebSocket URL upon connection.

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ws-term.option.protocol` | Connection protocol (`kube-exec`, `ttyd`, or `k8s-dashboard`) | `kube-exec` |
| `ws-term.option.shell` | Shell command to execute after connecting | Server-defined |
| `ws-term.option.confirmDisconnect` | Show confirmation dialog on disconnect (`true`/`false`) | `true` |

### Examples

```bash
# CLI - kube-exec (default)
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod"

# CLI - ttyd protocol
tabby quickConnect ws-term "ws://127.0.0.1:7681/ws?ws-term.option.protocol=ttyd"

# CLI - k8s-dashboard (example)
# pass `pod` and `namespace`, and include `jweToken`/`authMode`/`username` as needed
tabby quickConnect ws-term "wss://dashboard.example.com/?pod=my-pod&namespace=default&authMode=token&username=dashboard-admin&jweToken=..."

# CLI - with custom shell and disable confirm dialog
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"

# URL schema
open "tabby://quickConnect?providerId=ws-term&query=ws%3A%2F%2Fexample.com%2Fws%3Fpod%3Dmy-pod"
```
