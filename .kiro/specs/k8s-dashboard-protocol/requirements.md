# Requirements Document

## Introduction

本需求文档描述了 K8s Dashboard WebSocket 协议支持功能的实现要求。该功能旨在让 tabby-ws-term 插件能够正确识别和处理 Kubernetes Dashboard 的 WebSocket 终端协议，实现与 K8s Dashboard 的终端会话连接和交互。

K8s Dashboard 使用基于 SockJS 的 WebSocket 协议，具有独特的消息格式和连接流程，包括连接打开消息（"o"）、心跳消息（"h"）、数据消息（"a[...]"）以及需要发送 bind 消息进行会话绑定。

## Glossary

- **K8s Dashboard**: Kubernetes Dashboard，Kubernetes 集群的 Web 管理界面
- **WebSocket**: 一种在单个 TCP 连接上进行全双工通信的协议
- **SockJS**: 一个浏览器 JavaScript 库，提供类似 WebSocket 的对象，用于处理跨浏览器的实时通信
- **SessionID**: 会话标识符，用于标识唯一的终端会话，格式为 32 位十六进制字符串
- **ProtocolHandler**: 协议处理器，负责编解码特定协议的 WebSocket 消息
- **TerminalSize**: 终端尺寸，包含列数和行数
- **DecodedMessage**: 解码后的消息，包含类型和数据
- **bind 消息**: 客户端发送的绑定会话标识符的消息
- **resize 消息**: 客户端发送的调整终端尺寸的消息
- **stdin 消息**: 客户端发送的用户输入数据消息
- **stdout 消息**: 服务器发送的终端输出数据消息
- **心跳消息**: 服务器定期发送的保持连接活跃的消息，格式为单个字符 "h"

## Requirements

### Requirement 1: 协议识别

**User Story:** 作为用户，我希望系统能够自动识别 K8s Dashboard WebSocket 协议，以便我无需手动配置协议类型即可连接到 K8s Dashboard 终端。

#### Acceptance Criteria

1. IF 用户未通过 `ws-term.option.protocol` 参数指定协议类型且 WebSocket URL 路径包含子字符串 "/api/sockjs/" 或 "/sockjs/"，THEN THE WSTerm_Plugin SHALL 自动识别该连接为 K8s Dashboard 协议
2. IF 用户未通过 `ws-term.option.protocol` 参数指定协议类型且 WebSocket URL 查询参数名称匹配 32 位十六进制字符串格式（正则表达式：`/^[a-f0-9]{32}$/`），THEN THE WSTerm_Plugin SHALL 自动识别该连接为 K8s Dashboard 协议
3. IF 用户已通过 `ws-term.option.protocol` 参数指定协议类型，THEN THE WSTerm_Plugin SHALL 使用用户指定的协议类型，不进行自动识别
4. IF URL 不匹配 K8s Dashboard 协议模式且用户未指定协议类型，THEN THE WSTerm_Plugin SHALL 使用默认协议类型（kube-exec）

### Requirement 2: SessionID 提取

**User Story:** 作为系统，我需要从 WebSocket URL 中提取 SessionID，以便在建立连接后发送 bind 消息进行会话绑定。

#### Acceptance Criteria

1. WHEN WebSocket URL 包含查询参数，THE ProtocolHandler SHALL 从查询参数名称中提取 SessionID
2. THE SessionID SHALL 为 32 位十六进制字符串格式，匹配正则表达式 `/^[a-f0-9]{32}$/`
3. IF URL 不包含有效的 SessionID（不为 32 位十六进制字符串），THEN THE ProtocolHandler SHALL 使用空字符串作为默认值

### Requirement 3: 连接初始化

**User Story:** 作为用户，我希望在 WebSocket 连接建立后自动发送必要的初始化消息，以便终端会话能够正常工作。

#### Acceptance Criteria

1. WHEN WebSocket 连接成功建立且收到 "o" 消息，THE ProtocolHandler SHALL 在 1000 毫秒内发送 bind 消息进行会话绑定
2. THE bind 消息格式 SHALL 为 JSON 数组包装的 JSON 字符串：`["{\"Op\":\"bind\",\"SessionID\":\"<session_id>\"}"]`
3. WHEN 发送 bind 消息后，THE ProtocolHandler SHALL 在 100 毫秒内发送初始 resize 消息设置终端尺寸
4. THE resize 消息格式 SHALL 为 JSON 数组包装的 JSON 字符串：`["{\"Op\":\"resize\",\"Cols\":<cols>,\"Rows\":<rows>}"]`，其中 Cols 和 Rows 为 1 到 9999 之间的正整数
5. IF WebSocket 连接失败，THEN THE ProtocolHandler SHALL 不发送 bind 消息或 resize 消息
6. IF 在超时时间内未收到 "o" 消息，THEN THE ProtocolHandler SHALL 记录错误日志并等待连接关闭
7. IF SessionID 无效或为空，THEN THE ProtocolHandler SHALL 发送包含空 SessionID 的 bind 消息

### Requirement 4: 心跳消息处理

**User Story:** 作为系统，我需要正确处理服务器发送的心跳消息，以便保持连接的活跃状态。

#### Acceptance Criteria

1. WHEN 服务器发送字符串 "h"（精确匹配，区分大小写），THE ProtocolHandler decode 方法 SHALL 返回空数组 []
2. THE 心跳消息 SHALL 不产生任何终端输出
3. THE ProtocolHandler SHALL 不对心跳消息进行响应或发送任何回复消息
4. WHILE 处理心跳消息过程中发生任何异常，THE ProtocolHandler SHALL 仍然返回空数组 [] 且不抛出异常

### Requirement 5: 数据消息编码

**User Story:** 作为用户，我希望我输入的内容能够正确编码并通过 WebSocket 发送到服务器，以便终端能够接收我的命令。

#### Acceptance Criteria

1. WHEN 用户输入数据，THE ProtocolHandler SHALL 将数据编码为 JSON 数组包装的字符串格式，其中包含 Op 字段值为 "stdin"、Data 字段包含用户输入内容、Cols 字段包含终端列数、Rows 字段包含终端行数
2. WHEN 编码用户输入数据，THE ProtocolHandler SHALL 对 Data 字段中的 JSON 特殊字符（双引号、反斜杠、换行符、制表符等）进行转义处理
3. IF 终端尺寸发生变化，THEN THE ProtocolHandler SHALL 使用变化后的终端列数和行数更新消息中的 Cols 和 Rows 字段
4. WHERE 终端列数和行数可用，THE ProtocolHandler SHALL 在 Cols 字段填入 1 到 999 之间的整数值，在 Rows 字段填入 1 到 999 之间的整数值
5. IF 用户输入数据包含空内容，THEN THE ProtocolHandler SHALL 生成包含空 Data 字段的有效消息格式

### Requirement 6: 数据消息解码

**User Story:** 作为用户，我希望服务器发送的终端输出能够正确解码并显示，以便我能够看到命令执行的结果。

#### Acceptance Criteria

1. WHEN 服务器发送数据消息，THE ProtocolHandler SHALL 识别消息前缀 "a"
2. WHEN 消息以 "a" 前缀开头，THE ProtocolHandler SHALL 解析前缀后的 JSON 数组，提取数组中第 1 个元素作为内部 JSON 字符串
3. IF JSON 数组解析失败或数组为空，THEN THE ProtocolHandler SHALL 丢弃该消息并返回空数组
4. WHEN 成功提取内部 JSON 字符串，THE ProtocolHandler SHALL 将该字符串解析为 JSON 对象
5. WHEN 解析成功且 Op 字段为 "stdout"，THE ProtocolHandler SHALL 返回包含 Data 字段内容的 OutputMessage
6. WHEN 解析成功且 Op 字段为 "toast"，THE ProtocolHandler SHALL 返回包含 Data 字段内容的 ToastMessage
7. IF 内部 JSON 解析失败，THEN THE ProtocolHandler SHALL 将原始消息内容作为终端输出返回（降级处理）
8. IF JSON 对象不包含 Op 字段或 Op 字段为未知值，THEN THE ProtocolHandler SHALL 忽略该消息并返回空数组
9. IF JSON 对象不包含 Data 字段或 Data 字段为 null，THEN THE ProtocolHandler SHALL 忽略该消息并返回空数组

### Requirement 7: 终端尺寸调整

**User Story:** 作为用户，我希望当我调整终端窗口大小时，系统能够正确发送 resize 消息，以便服务器端终端能够适应新的尺寸。

#### Acceptance Criteria

1. WHEN 终端尺寸发生变化，THE ProtocolHandler SHALL 发送 resize 消息
2. THE resize 消息格式 SHALL 为 JSON 数组包装的 JSON 字符串，格式为 `["{\"Op\":\"resize\",\"Cols\":<cols>,\"Rows\":<rows>}"]`，其中 `<cols>` 和 `<rows>` 为非负整数值，范围为 0 至 9999
3. IF WebSocket 连接未处于 OPEN 状态，THEN THE ProtocolHandler SHALL 不发送 resize 消息并保持最后记录的尺寸值
4. WHEN 终端尺寸为零，THE ProtocolHandler SHALL 发送包含 Cols 为 0 且 Rows 为 0 的 resize 消息

### Requirement 8: 协议类型扩展

**User Story:** 作为开发者，我需要在系统中注册新的协议类型，以便支持 K8s Dashboard 协议。

#### Acceptance Criteria

1. THE ProtocolType 类型定义 SHALL 包含 `k8s-dashboard` 类型
2. THE K8sDashboardHandler 类 SHALL 实现 ProtocolHandler 接口的所有方法，包括 protocolType、getWebSocketOptions、encodeInput、encodeResize、encodeKeepalive、encodeConnect 和 decode 方法
3. THE protocolType 属性 SHALL 返回字符串 `k8s-dashboard`
4. WHEN createProtocolHandler 函数接收 `k8s-dashboard` 参数，THE 函数 SHALL 返回 K8sDashboardHandler 实例
5. WHEN isValidProtocolType 函数接收 `k8s-dashboard` 参数，THE 函数 SHALL 返回 true

### Requirement 9: WebSocket 连接选项

**User Story:** 作为用户，我希望能够通过 URL 参数传递认证信息，以便连接到需要认证的 K8s Dashboard 服务器。

#### Acceptance Criteria

1. THE getWebSocketOptions 方法 SHALL 从 wsUrl 的查询参数中提取认证信息
2. IF wsUrl 包含 `jweToken` 查询参数，THE getWebSocketOptions 方法 SHALL 将其添加到 Cookie 请求头中，格式为 `jweToken=<token_value>`
3. IF wsUrl 包含 `username` 查询参数，THE getWebSocketOptions 方法 SHALL 将其添加到 Cookie 请求头中，格式为 `username=<username_value>`
4. IF wsUrl 包含 `authMode` 查询参数，THE getWebSocketOptions 方法 SHALL 将其添加到 Cookie 请求头中，格式为 `authMode=<auth_mode_value>`
5. WHEN 多个认证参数同时存在，THE getWebSocketOptions 方法 SHALL 将它们组合成一个 Cookie 字符串，各参数之间用分号和空格分隔（例如：`authMode=token; username=admin; jweToken=xxx`）
6. THE getWebSocketOptions 方法 SHALL 返回包含 headers 字段的对象，其中 headers 包含 Cookie 和 Origin 头

### Requirement 10: 消息编解码器

**User Story:** 作为开发者，我需要一个健壮的消息编解码器，以便正确处理各种格式的 WebSocket 消息。

#### Acceptance Criteria
### Requirement 10: 消息编解码器

**User Story:** 作为开发者，我需要一个健壮的消息编解码器，以便正确处理各种格式的 WebSocket 消息。

#### Acceptance Criteria

1. THE 编码器 SHALL 将 JavaScript 对象转换为 K8s Dashboard 协议的消息格式（JSON 数组包装 JSON 字符串）
2. THE 解码器 SHALL 处理字符串、Buffer、ArrayBuffer、Uint8Array 等多种输入格式
3. WHEN 解码器收到消息 "o"，THE 解码器 SHALL 返回类型为 "open" 的消息对象，表示连接已建立
4. WHEN 解码器收到消息 "h"，THE 解码器 SHALL 返回空数组，表示心跳消息已忽略
5. WHEN 解码器收到以 "a" 开头的消息，THE 解码器 SHALL 解析后续的 JSON 数组并返回解码后的消息对象数组
6. FOR ALL stdin、resize 类型的消息，编码后再解码 SHALL 产生相同的 Op 字段值和相同语义的 Data/Cols/Rows 字段值
