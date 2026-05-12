# Requirements Document

## Introduction

为 tabby-ws-term 插件添加 ttyd 格式的 WebSocket 协议支持。当前插件仅支持 kube-exec 格式的 WebSocket 协议（JSON 格式消息），需要扩展以支持 ttyd 协议格式，从而允许用户连接到 ttyd 服务器。

## Glossary

- **WSTerm_Plugin**: tabby-ws-term 插件，用于通过 WebSocket 连接到远程终端服务
- **kube-exec_Protocol**: 基于 Kubernetes exec 的 WebSocket 终端协议，使用 JSON 格式消息
- **ttyd_Protocol**: ttyd 项目定义的 WebSocket 终端协议，使用带前缀的文本格式消息
- **Protocol_Type**: 协议类型，用于区分不同的 WebSocket 消息格式（kube-exec 或 ttyd）
- **Input_Message**: 用户输入消息，从客户端发送到服务器
- **Output_Message**: 终端输出消息，从服务器发送到客户端
- **Resize_Message**: 终端大小调整消息，用于通知服务器终端窗口尺寸变化
- **Keepalive_Message**: 保活消息，用于维持 WebSocket 连接活跃状态

## Requirements

### Requirement 1

**User Story:** 作为用户，我希望能够选择 WebSocket 终端的协议类型，以便连接到不同类型的服务器。

#### Acceptance Criteria

1. THE WSTermProfileOptions SHALL 包含一个 protocol 字段用于指定协议类型
2. THE protocol 字段 SHALL 默认值为 "kube-exec"，保持与现有行为兼容
3. THE protocol 字段 SHALL 仅支持 "kube-exec" 和 "ttyd" 两个有效值
4. IF protocol 字段值为 undefined、null、空字符串或非 "kube-exec"/"ttyd" 的值，THEN THE WSTerm_Plugin SHALL 将 protocol 值替换为默认值 "kube-exec"

### Requirement 2

**User Story:** 作为用户，我希望使用 kube-exec 协议时插件能够正确处理消息，以便与 Kubernetes 终端服务正常通信。

#### Acceptance Criteria

1. WHERE protocol 设置为 "kube-exec"，THE WSTermSession SHALL 使用 JSON 格式解析所有接收到的消息，并丢弃无法解析的非 JSON 消息
2. WHEN 用户输入数据且 protocol 为 "kube-exec"，THE WSTermSession SHALL 发送格式为 `{"Op":"stdin","Data":"..."}` 的 JSON 消息
3. WHEN 终端大小改变且 protocol 为 "kube-exec"，THE WSTermSession SHALL 发送格式为 `{"Op":"resize","Cols":N,"Rows":N}` 的 JSON 消息，其中 N 为 1 到 9999 之间的正整数
4. WHEN 收到 `{"Op":"stdout","Data":"..."}` 消息，THE WSTermSession SHALL 将 Data 内容输出到终端
5. WHEN 收到 `{"Op":"toast","Data":"..."}` 消息，THE WSTermSession SHALL 将 Data 内容作为服务消息显示给用户
6. WHILE 连接保持打开状态且 protocol 为 "kube-exec"，THE WSTermSession SHALL 每隔 30000 毫秒发送一次保活消息，使用 resize 或 stdin 消息格式

### Requirement 3

**User Story:** 作为用户，我希望使用 ttyd 协议时能够正确发送用户输入，以便与 ttyd 服务器正常交互。

#### Acceptance Criteria

1. WHEN protocol 设置为 "ttyd" 且用户输入数据，THE WSTermSession SHALL 发送格式为 '0' + data 的文本消息
2. WHEN protocol 设置为 "ttyd" 且终端大小改变，THE WSTermSession SHALL 发送格式为 '1' + JSON{columns, rows} 的文本消息，其中 columns 和 rows 为正整数
3. WHEN protocol 设置为 "ttyd" 且用户暂停终端，THE WSTermSession SHALL 发送字符 '2'
4. WHEN protocol 设置为 "ttyd" 且用户恢复终端，THE WSTermSession SHALL 发送字符 '3'

### Requirement 4

**User Story:** 作为用户，我希望使用 ttyd 协议时能够正确接收服务器输出，以便在终端中查看内容。

#### Acceptance Criteria

1. WHEN protocol 设置为 "ttyd" 且收到以 '0' 开头的消息，THE WSTermSession SHALL 将第一个字符之后的所有内容作为终端输出显示
2. WHEN protocol 设置为 "ttyd" 且收到以 '1' 开头的消息，THE WSTermSession SHALL 将第一个字符之后的内容设置为窗口标题
3. WHEN protocol 设置为 "ttyd" 且收到以 '2' 开头的消息，THE WSTermSession SHALL 解析第一个字符之后的 JSON 内容作为终端偏好设置
4. WHEN protocol 设置为 "ttyd" 且收到以非 '0'、'1'、'2' 字符开头的消息，THE WSTermSession SHALL 记录警告日志并丢弃该消息
5. WHEN protocol 设置为 "ttyd" 且收到以 '2' 开头的消息但 JSON 解析失败，THE WSTermSession SHALL 记录错误日志并忽略该消息

### Requirement 5

**User Story:** 作为用户，我希望在配置界面中能够选择协议类型，以便方便地配置连接参数。

#### Acceptance Criteria

1. THE 配置界面 SHALL 始终显示协议类型选择控件
2. THE 协议类型选择控件 SHALL 提供 "kube-exec" 和 "ttyd" 两个选项
3. THE 协议类型选择控件 SHALL 默认选中 "kube-exec"
4. WHEN 用户选择协议类型，THE 配置界面 SHALL 保存选择到 Profile 配置的 protocol 字段中
5. IF protocol 字段的值不是 "kube-exec" 或 "ttyd"，THE 配置界面 SHALL 拒绝保存并显示错误提示

### Requirement 6

**User Story:** 作为用户，我希望通过快速连接功能时能够指定协议类型，以便快速连接到不同类型的服务器。

#### Acceptance Criteria

1. THE 快速连接功能 SHALL 解析并验证 `ws-term.option.protocol` URL 参数，有效值为 "kube-exec" 和 "ttyd"
2. WHEN URL 中包含 `ws-term.option.protocol=ttyd` 参数，THE WSTerm_Plugin SHALL 使用 ttyd 协议建立连接
3. IF URL 中包含的 protocol 参数值不是 "kube-exec" 或 "ttyd"，THEN THE WSTerm_Plugin SHALL 使用默认值 "kube-exec" 协议
4. WHEN 将 Profile 转换为快速连接字符串且 protocol 值为 "ttyd"，THE WSTerm_Plugin SHALL 在 URL 中包含 protocol 参数

### Requirement 7

**User Story:** 作为用户，我希望在使用 ttyd 协议时保活机制能够正常工作，以便保持连接稳定。

#### Acceptance Criteria

1. WHERE protocol 设置为 "ttyd" 且 keepaliveInterval 大于 0，THE WSTermSession SHALL 发送格式为 '1' + JSON{columns, rows} 的 resize 消息作为保活消息
2. WHILE keepaliveInterval 大于 0 且连接保持打开，THE WSTermSession SHALL 按配置的间隔定期发送保活消息
3. WHEN socket 未打开或 readyState 不是 OPEN，THE WSTermSession SHALL 跳过保活消息发送并记录调试日志
4. WHEN 保活消息发送失败，THE WSTermSession SHALL 记录错误日志并允许 socket 的 error 事件处理器处理后续逻辑

### Requirement 8

**User Story:** 作为开发者，我希望协议处理代码具有抽象层次，以便后续添加其他类型的协议时无需大量修改现有代码。

#### Acceptance Criteria

1. THE WSTermSession SHALL 使用协议处理器（Protocol Handler）抽象层来处理不同协议的消息格式
2. THE 协议处理器抽象层 SHALL 定义统一的接口，包括 encode、decode、encodeResize、encodeKeepalive 等方法
3. WHEN 添加新协议类型，THE 开发者 SHALL 只需实现协议处理器接口，无需修改 WSTermSession 的核心逻辑
4. THE 协议处理器的选择 SHALL 基于 Profile 中的 protocol 字段动态决定

### Requirement 9

**User Story:** 作为现有用户，我希望升级后现有的 Profile 配置仍然能够正常工作，以便不影响我的使用。

#### Acceptance Criteria

1. WHEN Profile 不包含 protocol 字段，THE WSTerm_Plugin SHALL 默认使用 "kube-exec" 协议并继续加载 Profile
2. WHEN 现有 Profile 升级后首次加载，THE WSTerm_Plugin SHALL 保持原有字段（wsUrl、shell、confirmDisconnect、keepaliveInterval）不变
3. THE kube-exec 协议的消息格式 SHALL 与现有实现保持一致，支持 stdin、stdout、resize 三种 Op 类型的 JSON 格式消息
4. IF Profile 中的 protocol 字段值不是 "kube-exec" 或 "ttyd"，THE WSTerm_Plugin SHALL 将其替换为默认值 "kube-exec" 并正常加载 Profile
