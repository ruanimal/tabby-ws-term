#!/usr/bin/env python3
"""
K8s Dashboard WebSocket 连接验证脚本

对应 src/protocols/k8s-dashboard.handler.ts 中 prepareConnection 和 WebSocket 消息收发逻辑。

协议流程：
  1. GET /api/v1/pod/{namespace}/{pod}/shell[/{container}]  -> { "id": "<session_id>" }
  2. 连接 WebSocket: wss://host/api/sockjs/{server_id}/{session_id_short}/websocket?{session_id}
  3. 收到 "o"  -> 发送 bind 消息: ["{\"Op\":\"bind\",\"SessionID\":\"...\"}"]
  4. 发送 resize: ["{\"Op\":\"resize\",\"Cols\":80,\"Rows\":24}"]
  5. 收发 stdin/stdout: ["{\"Op\":\"stdin\",\"Data\":\"...\"}"]
  6. 服务端数据帧以 "a" 开头，心跳帧为 "h"

依赖：
  pip install websockets requests

用法示例：
  # 基本（无认证）
  python k8s-dashboard-ws-test.py --host http://localhost:8080 --pod nginx --namespace default

  # 带 JWT 认证
  python k8s-dashboard-ws-test.py \\
      --host https://dashboard.example.com \\
      --pod nginx --namespace default \\
      --jwe-token "eyJ..." \\
      --allow-insecure

  # 使用 K8s bearer token 自动登录（推荐，避免 jweToken 过期）
  python k8s-dashboard-ws-test.py \\
      --host https://dashboard.example.com \\
      --pod nginx --namespace default \\
      --k8s-token "eyJhbGciOiJSUzI1NiIs..." \\
      --allow-insecure

  # 完整参数
  python k8s-dashboard-ws-test.py \\
      --host https://dashboard.example.com \\
      --pod nginx --namespace default --container main --shell bash \\
      --username admin --auth-mode token --jwe-token "eyJ..." \\
      --cols 120 --rows 40 \\
      --allow-insecure \\
      --cmd "echo hello && ls -la"
"""

import argparse
import asyncio
import json
import math
import random
import re
import ssl
import string
import sys
import urllib.parse
import urllib.request
from datetime import datetime

try:
    import websockets
    import websockets.exceptions
except ImportError:
    print("缺少依赖，请先安装：pip install websockets")
    sys.exit(1)

try:
    import requests as req_lib
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("缺少依赖，请先安装：pip install requests")
    sys.exit(1)


# ──────────────────────────────────────────────
# 辅助：日志
# ──────────────────────────────────────────────

def log(direction: str, msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{ts}] {direction} {msg}")


# ──────────────────────────────────────────────
# 创建 requests.Session（自动维护 cookie）
# ──────────────────────────────────────────────

def create_http_session(allow_insecure: bool) -> req_lib.Session:
    """创建 HTTP session，自动维护 cookie。"""
    session = req_lib.Session()
    session.verify = not allow_insecure
    session.headers.update({
        "Accept": "application/json",
    })
    # 抑制 InsecureRequestWarning
    if allow_insecure:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    return session


# ──────────────────────────────────────────────
# Step 0: 登录 Dashboard 获取 jweToken
# ──────────────────────────────────────────────

def dashboard_login(
    session: req_lib.Session,
    base_url: str,
    k8s_token: str,
) -> None:
    """
    调用 K8s Dashboard 登录 API，用 K8s bearer token 换取 jweToken。
    登录后 cookie 自动保存在 session 中。
    """
    # 1) 先获取 CSRF token
    csrf_url = base_url.rstrip("/") + "/api/v1/csrftoken/login"
    log(">>", f"GET {csrf_url}")
    resp = session.get(csrf_url)
    log("<<", f"HTTP {resp.status_code}  body: {resp.text}")
    resp.raise_for_status()
    csrf_token = resp.json().get("token", "")

    # 2) 带 CSRF token 登录
    login_url = base_url.rstrip("/") + "/api/v1/login"
    log(">>", f"POST {login_url}")
    resp = session.post(
        login_url,
        json={"token": k8s_token},
        headers={"X-CSRF-TOKEN": csrf_token},
    )
    body = resp.text
    log("<<", f"HTTP {resp.status_code}  body: {body[:200]}..." if len(body) > 200 else f"HTTP {resp.status_code}  body: {body}")
    resp.raise_for_status()

    # 调试：打印所有 Set-Cookie 响应头
    for k, v in resp.headers.items():
        if k.lower() == "set-cookie":
            log("  ", f"Set-Cookie: {v[:200]}")

    # 打印 session 中自动保存的所有 cookie
    log("  ", f"session cookies: {dict(session.cookies)}")

    # 如果 requests 没有自动捕获 cookie（IP 地址 + Secure 等原因），
    # 从响应头手动提取并设置
    jwe_token = session.cookies.get("jweToken")
    if not jwe_token:
        log("  ", "requests 未自动捕获 cookie，从响应头/body 手动提取...")
        parsed = urllib.parse.urlparse(base_url)
        # 从 Set-Cookie 头提取
        # 从 Set-Cookie 头提取（requests 的 resp.headers 会合并同名头，用 resp.raw 获取全部）
        set_cookie_headers = resp.raw.headers.getlist("Set-Cookie") if resp.raw else []
        if not set_cookie_headers:
            # fallback: 从合并的 headers 中取
            sc = resp.headers.get("Set-Cookie", "")
            if sc:
                set_cookie_headers = [sc]
        log("  ", f"raw Set-Cookie headers ({len(set_cookie_headers)}): {[h[:120] for h in set_cookie_headers]}")
        for v in set_cookie_headers:
            if not v:
                continue
            if "jweToken=" in v:
                match = re.search(r"jweToken=([^;]+)", v)
                if match:
                    session.cookies.set("jweToken", urllib.parse.unquote(match.group(1)), domain=parsed.hostname)
            if "authMode=" in v:
                match = re.search(r"authMode=([^;]+)", v)
                if match:
                    session.cookies.set("authMode", match.group(1), domain=parsed.hostname)
            if "username=" in v:
                match = re.search(r"username=([^;]+)", v)
                if match:
                    session.cookies.set("username", match.group(1), domain=parsed.hostname)
        # 也尝试从 body 提取
        if not session.cookies.get("jweToken"):
            data = resp.json()
            if data.get("jweToken"):
                # 关键：jweToken 必须 URL 编码！
                # 浏览器前端 JS: document.cookie = 'jweToken=' + encodeURIComponent(value)
                # 所以 Cookie 头中的值是 URL 编码的
                session.cookies.set("jweToken", urllib.parse.quote(data["jweToken"], safe=""), domain=parsed.hostname)
            if data.get("name"):
                session.cookies.set("username", data["name"], domain=parsed.hostname)
            session.cookies.set("authMode", "token", domain=parsed.hostname)
        log("  ", f"session cookies (after manual): {dict(session.cookies)}")

    jwe_token = session.cookies.get("jweToken")
    if not jwe_token:
        raise RuntimeError(f"登录成功但仍无 jweToken，cookies: {dict(session.cookies)}")
    log("  ", f"jweToken = {jwe_token[:80]}...")


# ──────────────────────────────────────────────
# Step 1: 创建 exec session（对应 prepareConnection 中 httpGet 部分）
# ──────────────────────────────────────────────

def create_session(
    session: req_lib.Session,
    base_url: str,
    pod: str,
    namespace: str,
    container: str | None,
    shell: str | None,
) -> tuple[str, dict[str, str]]:
    """
    调用 Dashboard HTTP API 创建 exec session。
    使用 requests.Session 自动携带登录后的 cookie。
    返回 (ws_url, ws_headers)。
    """
    container_path = f"/{container}" if container else ""
    api_path = f"/api/v1/pod/{namespace}/{pod}/shell{container_path}"
    if shell:
        api_path += f"?shell={urllib.parse.quote(shell)}"

    api_url = base_url.rstrip("/") + api_path
    log(">>", f"GET {api_url}")
    log("  ", f"request cookies: {dict(session.cookies)}")

    # Dashboard 前端的 HTTP 拦截器会从 cookie 读 jweToken 并设置 jwetoken 请求头
    # API 模块通过 jwetoken 头（而非 Cookie）进行认证
    jwe_token_raw = session.cookies.get("jweToken")
    extra_headers: dict[str, str] = {}
    if jwe_token_raw:
        # Cookie 中的值是 URL 编码的，header 中需要原始 JSON
        extra_headers["jwetoken"] = urllib.parse.unquote(jwe_token_raw)
        log("  ", f"jwetoken header (first 120): {extra_headers['jwetoken'][:120]}...")

    resp = session.get(api_url, headers=extra_headers)
    body = resp.text
    log("<<", f"HTTP {resp.status_code}  body: {body}")

    # 打印实际发送的请求头（调试用）
    if resp.request.headers:
        cookie_sent = resp.request.headers.get("Cookie", "(none)")
        log("  ", f"actual Cookie sent: {cookie_sent[:200]}")
        jwetoken_sent = resp.request.headers.get("jwetoken", "(none)")
        log("  ", f"actual jwetoken header sent: {jwetoken_sent[:120] if jwetoken_sent != '(none)' else '(none)'}...")

    resp.raise_for_status()

    data = resp.json()
    session_id: str = data.get("id", "")
    if not session_id:
        raise RuntimeError(f"响应中没有 session ID: {body}")

    log("  ", f"session_id = {session_id}")

    # WebSocket 不需要认证，session ID 就是凭据
    parsed = urllib.parse.urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    ws_headers: dict[str, str] = {"Origin": origin}

    # 构建 SockJS WebSocket URL
    ws_scheme = "wss" if parsed.scheme in ("https", "wss") else "ws"
    server_id = str(math.floor(random.random() * 1000))
    base36_digits = string.digits + string.ascii_lowercase
    frac = random.random()
    chars: list[str] = []
    for _ in range(11):
        frac *= 36
        chars.append(base36_digits[int(frac) % 36])
        frac -= int(frac)
    session_id_short = "".join(chars[2:11])

    ws_url = (
        f"{ws_scheme}://{parsed.netloc}"
        f"/api/sockjs/{server_id}/{session_id_short}/websocket"
        f"?{session_id}"
    )

    log("  ", f"ws_headers = {ws_headers}")
    log("  ", f"ws_url     = {ws_url}")
    return ws_url, ws_headers


# ──────────────────────────────────────────────
# 消息编解码（对应 handler 中 encode*/decode）
# ──────────────────────────────────────────────

def encode_bind(session_id: str) -> str:
    inner = json.dumps({"Op": "bind", "SessionID": session_id})
    return json.dumps([inner])


def encode_resize(cols: int, rows: int) -> str:
    inner = json.dumps({"Op": "resize", "Cols": cols, "Rows": rows})
    return json.dumps([inner])


def encode_stdin(data: str, cols: int, rows: int) -> str:
    inner = json.dumps({"Op": "stdin", "Data": data, "Cols": cols, "Rows": rows})
    return json.dumps([inner])


def decode_message(raw: str) -> list[dict]:
    """
    将服务端帧解析为结构化消息列表，对应 handler.decode()
    """
    results = []
    if raw == "o":
        results.append({"type": "open"})
    elif raw == "h":
        results.append({"type": "heartbeat"})
    elif raw.startswith("a"):
        try:
            outer = json.loads(raw[1:])
        except json.JSONDecodeError:
            return results
        if not isinstance(outer, list) or not outer:
            return results
        inner_json = outer[0]
        if not isinstance(inner_json, str):
            return results
        try:
            inner = json.loads(inner_json)
        except json.JSONDecodeError:
            results.append({"type": "output", "data": inner_json})
            return results
        op = inner.get("Op")
        if op == "stdout":
            results.append({"type": "output", "data": inner.get("Data", "")})
        elif op == "toast":
            results.append({"type": "toast", "data": inner.get("Data", "")})
        else:
            results.append({"type": "unknown_op", "op": op, "raw": inner})
    else:
        results.append({"type": "unknown_frame", "raw": raw})
    return results


# ──────────────────────────────────────────────
# Step 2 & 3: WebSocket 连接（对应 session.ts start()）
# ──────────────────────────────────────────────

async def connect_and_interact(
    ws_url: str,
    ws_headers: dict[str, str],
    cols: int,
    rows: int,
    cmd: str | None,
    allow_insecure: bool,
    timeout: float,
) -> None:
    # ws_url 由 create_session 构建完毕，对应 prepareConnection 返回的 wsUrl
    # query string 即为 session_id，用于 bind 消息
    session_id = urllib.parse.urlparse(ws_url).query
    ws_scheme = urllib.parse.urlparse(ws_url).scheme
    ws_headers["Pragma"] = "no-cache"  # 避免某些环境下的缓存问题

    log(">>", f"WebSocket connect: {ws_url}")
    log("  ", f"headers: {ws_headers}")

    ssl_ctx = None
    if allow_insecure and ws_scheme == "wss":
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

    try:
        async with websockets.connect(
            ws_url,
            additional_headers=ws_headers,
            ssl=ssl_ctx,
            ping_interval=None,  # 由服务端心跳驱动
        ) as ws:
            log("  ", "WebSocket 连接已建立")
            received_open = False

            async def sender():
                nonlocal received_open
                # 等待收到 "o" 后再发送初始化消息
                while not received_open:
                    await asyncio.sleep(0.05)

                # 发送 bind（对应 encodeConnect）
                bind_msg = encode_bind(session_id)
                log(">>", f"bind: {bind_msg}")
                await ws.send(bind_msg)

                # 发送 resize
                resize_msg = encode_resize(cols, rows)
                log(">>", f"resize: {resize_msg}")
                await ws.send(resize_msg)

                # 发送用户命令（可选）
                if cmd:
                    await asyncio.sleep(0.3)
                    stdin_msg = encode_stdin(cmd + "\r", cols, rows)
                    log(">>", f"stdin: {stdin_msg}")
                    await ws.send(stdin_msg)

            async def receiver():
                nonlocal received_open
                deadline = asyncio.get_event_loop().time() + timeout
                while asyncio.get_event_loop().time() < deadline:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                        log("<<", f"raw: {raw!r}")
                        for decoded in decode_message(raw):
                            if decoded["type"] == "open":
                                received_open = True
                                log("  ", "收到 open 消息 (\"o\")")
                            elif decoded["type"] == "heartbeat":
                                log("  ", "收到心跳 (\"h\")")
                            elif decoded["type"] == "output":
                                # 打印终端输出（去掉 ANSI 转义序列后显示）
                                data = decoded["data"]
                                clean = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", data)
                                log("<<", f"stdout: {clean!r}")
                            elif decoded["type"] == "toast":
                                log("<<", f"toast: {decoded['data']}")
                            else:
                                log("<<", f"other: {decoded}")
                    except asyncio.TimeoutError:
                        continue
                    except websockets.exceptions.ConnectionClosed as e:
                        log("!!", f"连接关闭: {e}")
                        break

            await asyncio.gather(sender(), receiver())

    except OSError as e:
        log("!!", f"连接失败: {e}")
        sys.exit(1)


# ──────────────────────────────────────────────
# 入口
# ──────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="K8s Dashboard WebSocket 连接验证脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--host", required=True,
                        help="Dashboard 基础 URL，如 https://dashboard.example.com")
    parser.add_argument("--pod", required=True, help="Pod 名称")
    parser.add_argument("--namespace", required=True, help="Namespace")
    parser.add_argument("--container", default=None, help="容器名称（可选）")
    parser.add_argument("--shell", default=None, help="Shell 类型，如 bash（可选）")
    parser.add_argument("--k8s-token", default=None,
                        help="K8s bearer token（自动登录 Dashboard 获取 jweToken）")
    parser.add_argument("--jwe-token", default=None, help="JWE Token（认证，直接提供）")
    parser.add_argument("--username", default=None, help="用户名（认证）")
    parser.add_argument("--auth-mode", default=None, help="认证模式，如 token")
    parser.add_argument("--cols", type=int, default=80, help="终端列数（默认 80）")
    parser.add_argument("--rows", type=int, default=24, help="终端行数（默认 24）")
    parser.add_argument("--cmd", default=None, help="连接后发送的命令（可选）")
    parser.add_argument("--allow-insecure", action="store_true",
                        help="跳过 TLS 证书验证（自签名证书）")
    parser.add_argument("--timeout", type=float, default=15.0,
                        help="WebSocket 接收超时秒数（默认 15）")
    args = parser.parse_args()

    print("=" * 60)
    print("K8s Dashboard WebSocket 验证")
    print("=" * 60)

    # 创建 HTTP session（自动维护 cookie）
    http_session = create_http_session(allow_insecure=args.allow_insecure)

    # Step 0: 登录
    k8s_token = args.k8s_token
    if k8s_token:
        try:
            dashboard_login(
                session=http_session,
                base_url=args.host,
                k8s_token=k8s_token,
            )
        except Exception as e:
            log("!!", str(e))
            sys.exit(1)
        print()
    elif args.jwe_token:
        # 手动设置 cookie（兼容直接传 jweToken 的场景）
        from http.cookiejar import Cookie as CookieObj
        parsed = urllib.parse.urlparse(args.host)
        domain = parsed.hostname
        if args.auth_mode:
            http_session.cookies.set("authMode", args.auth_mode, domain=domain)
        if args.username:
            http_session.cookies.set("username", args.username, domain=domain)
        http_session.cookies.set("jweToken", args.jwe_token, domain=domain)
        log("  ", f"手动设置 cookies: {dict(http_session.cookies)}")
    else:
        log("  ", "未提供 --k8s-token 或 --jwe-token，将以无认证模式连接")

    # Step 1: 创建 session（cookie 由 http_session 自动携带）
    try:
        ws_url, ws_headers = create_session(
            session=http_session,
            base_url=args.host,
            pod=args.pod,
            namespace=args.namespace,
            container=args.container,
            shell=args.shell,
        )
    except Exception as e:
        log("!!", str(e))
        sys.exit(1)

    print()

    # Step 2 & 3: WebSocket 连接与交互
    asyncio.run(connect_and_interact(
        ws_url=ws_url,
        ws_headers=ws_headers,
        cols=args.cols,
        rows=args.rows,
        cmd=args.cmd,
        allow_insecure=args.allow_insecure,
        timeout=args.timeout,
    ))


if __name__ == "__main__":
    main()
