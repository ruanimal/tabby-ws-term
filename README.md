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
| `ws-term.option.title` | Tab title displayed in Tabby | `host + pathname` |
| `ws-term.option.allowInsecure` | Allow self-signed certificates (skip TLS verification) | `false` |
| `ws-term.option.confirmDisconnect` | Show confirmation dialog on disconnect (`true`/`false`) | `true` |

### URL Format

The WebSocket URL follows a structured convention with prefixed parameters for extensibility:

```
wss://host/path?<business_params>&<cookie.*>&<header.*>&<ws-term.option.*>
```

| Prefix | Purpose | Example |
|--------|---------|---------|
| *(none)* | Business parameters consumed by the protocol handler | `pod=nginx&namespace=default` |
| `cookie.*` | Passed as Cookie header on HTTP/WebSocket requests | `cookie.Authorization=eyJ...` |
| `header.*` | Passed as custom HTTP request headers | `header.jwetoken={"protected":...}` |
| `ws-term.option.*` | Plugin options (handled by the plugin, not sent to server) | `ws-term.option.protocol=k8s-dashboard` |

The `cookie.*` and `header.*` parameters are generic — any key after the prefix is forwarded as-is. This means adding new auth fields (e.g. a gateway session cookie) only requires the caller to add a parameter; no handler code changes are needed.

### Examples

```bash
# CLI - kube-exec (default)
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod"

# CLI - ttyd protocol
tabby quickConnect ws-term "ws://127.0.0.1:7681/ws?ws-term.option.protocol=ttyd"

# CLI - k8s-dashboard with cookie/header convention
tabby quickConnect ws-term "wss://dashboard.example.com/?pod=my-pod&namespace=default&cookie.authMode=token&cookie.username=dashboard-admin&cookie.jweToken=...&header.jwetoken=..."

# CLI - k8s-dashboard behind reverse proxy (path preserved as base)
tabby quickConnect ws-term "wss://gateway.example.com/proxy/k8s/cluster1?pod=nginx&namespace=default&cookie.Authorization=eyJ...&cookie.jweToken=...&header.jwetoken=..."

# CLI - with custom shell and disable confirm dialog
tabby quickConnect ws-term "ws://example.com/ws?pod=my-pod&ws-term.option.shell=bash&ws-term.option.confirmDisconnect=false"

# URL schema
open "tabby://quickConnect?providerId=ws-term&query=ws%3A%2F%2Fexample.com%2Fws%3Fpod%3Dmy-pod"
```

## Browser userscript

There is a companion browser userscript at `browser_scripts/k8s-dashboard-tabby.user.js`.

- Purpose: extract auth cookies from Kubernetes Dashboard and construct a `tabby://` quickConnect URL using the `cookie.*` / `header.*` convention so Tabby can open a `k8s-dashboard` session.
- Usage: install the userscript in the browser (Tampermonkey/Violentmonkey), open Dashboard, and use the injected button to launch Tabby with the required auth parameters.

