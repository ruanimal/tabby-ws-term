# Implementation Plan: K8s Dashboard WebSocket 协议支持

## Overview

本实现计划为 tabby-ws-term 插件添加 Kubernetes Dashboard WebSocket 协议支持。K8s Dashboard 使用基于 SockJS 的 WebSocket 协议，具有独特的消息格式（"o" 连接打开、"h" 心跳、"a[...]" 数据消息）和连接流程（需要发送 bind 消息进行会话绑定）。

实现遵循现有架构模式，新增 `K8sDashboardHandler` 类实现 `ProtocolHandler` 接口，并通过自动协议识别提升用户体验。

## Tasks

- [x] 1. 更新类型定义
  - [x] 1.1 扩展 ProtocolType 类型
    - 在 `src/protocols/types.ts` 中添加 `'k8s-dashboard'` 到 `ProtocolType` 联合类型
    - _Requirements: 8.1_
  
  - [x] 1.2 添加 K8s Dashboard 协议常量
    - 添加 `K8S_DASHBOARD_OP` 常量对象，包含 BIND、STDIN、STDOUT、RESIZE、TOAST 操作类型
    - _Requirements: 5.1, 6.1_
  
  - [x] 1.3 添加 K8s Dashboard 消息接口
    - 定义 `K8sDashboardMessage` 接口（Op、Data?、SessionID?、Cols?、Rows?）
    - 定义 `OpenMessage` 接口（type: 'open'）
    - 更新 `DecodedMessage` 联合类型以包含 `OpenMessage`
    - _Requirements: 3.2, 10.3_

- [x] 2. 实现 K8sDashboardHandler 类
  - [x] 2.1 创建 K8sDashboardHandler 基础结构
    - 创建 `src/protocols/k8s-dashboard.handler.ts` 文件
    - 实现 `protocolType` 属性返回 `'k8s-dashboard'`
    - 定义私有属性 `sessionId` 和 `terminalSize`
    - 实现构造函数，接收可选的 `wsUrl` 参数并提取 SessionID
    - _Requirements: 8.2, 8.3_
  
  - [x] 2.2 实现 extractSessionId 私有方法
    - 从 URL 查询参数名称中提取 32 位十六进制 SessionID
    - 使用正则表达式 `/^[a-f0-9]{32}$/` 验证格式
    - 无效时返回空字符串
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 2.3 实现 getWebSocketOptions 方法
    - 从 URL 查询参数提取 `jweToken`、`username`、`authMode`
    - 组合成 Cookie 字符串（格式：`authMode=token; username=admin; jweToken=xxx`）
    - 返回包含 Cookie 和 Origin 头的对象
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  
  - [x] 2.4 实现 encodeMessage 私有方法
    - 通用消息编码方法，生成 JSON 数组包装的 JSON 字符串
    - 支持不同操作类型（stdin、resize、bind）
    - _Requirements: 5.1, 5.2_
  
  - [x] 2.5 实现 encodeConnect 方法
    - 返回 bind 消息，格式：`["{\"Op\":\"bind\",\"SessionID\":\"<session_id>\"}"]`
    - 使用构造函数中提取的 sessionId
    - _Requirements: 3.1, 3.2, 3.7_
  
  - [x] 2.6 实现 encodeInput 方法
    - 编码用户输入数据，格式：`["{\"Op\":\"stdin\",\"Data\":\"<data>\",\"Cols\":N,\"Rows\":N}"]`
    - 使用存储的 terminalSize
    - 处理空数据情况
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 2.7 实现 encodeResize 方法
    - 编码终端尺寸调整消息，格式：`["{\"Op\":\"resize\",\"Cols\":N,\"Rows\":N}"]`
    - 更新内部 terminalSize 状态
    - 支持 0 到 9999 范围的尺寸值
    - _Requirements: 7.2, 7.4_
  
  - [x] 2.8 实现 encodeKeepalive 方法
    - 使用 resize 消息作为保活消息
    - _Requirements: 7.1_
  
  - [x] 2.9 实现 dataToString 私有方法
    - 处理字符串、Buffer、ArrayBuffer、Uint8Array 等多种输入格式
    - 统一转换为字符串
    - _Requirements: 10.2_
  
  - [x] 2.10 实现 decode 方法
    - 处理 "o" 消息：返回 `{type: 'open'}` 消息
    - 处理 "h" 消息：返回空数组
    - 处理 "a" 前缀消息：解析 JSON 数组，提取内部 JSON，返回对应消息
    - 处理 stdout 消息：返回 OutputMessage
    - 处理 toast 消息：返回 ToastMessage
    - 处理格式错误：返回空数组或降级处理
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 10.3, 10.4, 10.5_

- [x] 3. 更新协议工厂和验证函数
  - [x] 3.1 更新 createProtocolHandler 函数
    - 添加 `'k8s-dashboard'` case，返回 `K8sDashboardHandler` 实例
    - 支持传递 `wsUrl` 参数给 `K8sDashboardHandler` 构造函数
    - _Requirements: 8.4_
  
  - [x] 3.2 更新 isValidProtocolType 函数
    - 添加 `'k8s-dashboard'` 验证
    - _Requirements: 8.5_
  
  - [x] 3.3 更新 normalizeProtocolType 函数
    - 保持现有行为，将无效值回退到 `'kube-exec'`
    - _Requirements: 1.4_

- [x] 4. 实现协议自动识别逻辑
  - [x] 4.1 创建 isK8sDashboardUrl 函数
    - 检查 URL 路径是否包含 "/api/sockjs/" 或 "/sockjs/"
    - 检查 URL 查询参数名称是否匹配 32 位十六进制格式
    - _Requirements: 1.1, 1.2_
  
  - [x] 4.2 创建 detectProtocolType 函数
    - 根据 URL 特征返回 `'k8s-dashboard'` 或 `'kube-exec'`
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [x] 4.3 更新 WSTermSession 使用自动识别
    - 在 `src/session.ts` 中，当用户未指定协议类型时调用 `detectProtocolType`
    - 确保用户指定的协议类型优先
    - _Requirements: 1.3, 1.4_

- [x] 5. 更新模块导出
  - [x] 5.1 更新 protocols/index.ts 导出
    - 导出 `K8sDashboardHandler` 类
    - 导出 `isK8sDashboardUrl` 和 `detectProtocolType` 函数
    - 导出新增的类型和常量
    - _Requirements: 8.2_

- [x] 6. Checkpoint - 基础实现完成
  - 确保所有类型定义正确，编译无错误，如有问题请询问用户。

- [x] 7. 编写测试
  - [x] 7.1 创建测试文件结构
    - 创建 `src/protocols/__tests__/k8s-dashboard.handler.spec.ts`
    - 设置测试框架（Vitest + fast-check）
    - _Requirements: 测试策略_
  
  - [x] 7.2 编写 protocolType 属性单元测试
    - 验证返回 `'k8s-dashboard'`
    - _Requirements: 8.3_
  
  - [x] 7.3 编写 getWebSocketOptions 单元测试
    - 测试提取单个认证参数
    - 测试提取多个认证参数组合
    - 测试无认证参数情况
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  
  - [x] 7.4 编写 extractSessionId 单元测试
    - 测试有效 SessionID 提取
    - 测试无效 SessionID 返回空字符串
    - 测试无 SessionID 参数情况
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.5 编写 encodeConnect 单元测试
    - 测试 bind 消息格式正确性
    - 测试空 SessionID 处理
    - _Requirements: 3.2, 3.7_
  
  - [x] 7.6 编写 encodeInput 单元测试
    - 测试标准输入编码
    - 测试空数据编码
    - 测试特殊字符转义
    - _Requirements: 5.1, 5.2, 5.5_
  
  - [x] 7.7 编写 encodeResize 单元测试
    - 测试标准尺寸编码
    - 测试边界值（0, 9999）
    - _Requirements: 7.2, 7.4_
  
  - [x] 7.8 编写 decode 单元测试
    - 测试 "o" 消息解析
    - 测试 "h" 消息忽略
    - 测试 stdout 消息解析
    - 测试 toast 消息解析
    - 测试格式错误处理
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1-6.9, 10.3, 10.4, 10.5_

- [x] 8. 编写属性测试
  - [x] 8.1 编写 Property 1: URL 模式识别正确性
    - **Property 1: URL 模式识别正确性**
    - **Validates: Requirements 1.1**
  
  - [x] 8.2 编写 Property 2-3: SessionID 提取正确性
    - **Property 2: SessionID 提取正确性**
    - **Property 3: 无效 SessionID 处理**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  
  - [x] 8.3 编写 Property 4: bind 消息编码正确性
    - **Property 4: bind 消息编码正确性**
    - **Validates: Requirements 3.2**
  
  - [x] 8.4 编写 Property 5: resize 消息编码正确性
    - **Property 5: resize 消息编码正确性**
    - **Validates: Requirements 3.4, 7.2**
  
  - [x] 8.5 编写 Property 6: stdin 消息编码正确性
    - **Property 6: stdin 消息编码正确性**
    - **Validates: Requirements 5.1, 5.2**
  
  - [x] 8.6 编写 Property 7: 消息编码往返一致性
    - **Property 7: 消息编码往返一致性**
    - **Validates: Requirements 10.6**
  
  - [x] 8.7 编写 Property 8-9: stdout/toast 消息解码正确性
    - **Property 8: stdout 消息解码正确性**
    - **Property 9: toast 消息解码正确性**
    - **Validates: Requirements 6.1, 6.2, 6.5, 6.6**
  
  - [x] 8.8 编写 Property 10-11: 心跳和连接打开消息处理
    - **Property 10: 心跳消息忽略**
    - **Property 11: 连接打开消息识别**
    - **Validates: Requirements 4.1, 4.2, 4.3, 10.3**
  
  - [x] 8.9 编写 Property 12: 错误消息处理
    - **Property 12: 错误消息处理**
    - **Validates: Requirements 6.3, 6.7, 6.8, 6.9**
  
  - [x] 8.10 编写 Property 13: 多格式输入解码一致性
    - **Property 13: 多格式输入解码一致性**
    - **Validates: Requirements 10.2**
  
  - [x] 8.11 编写 Property 14: 认证参数提取正确性
    - **Property 14: 认证参数提取正确性**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 9. Checkpoint - 测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 10. 更新 session.ts 集成
  - [x] 10.1 修改 WSTermSession 构造函数
    - 传递 `wsUrl` 给 `createProtocolHandler`
    - 使用自动协议识别（当用户未指定时）
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 10.2 更新 start 方法
    - 确保正确处理 "o" 消息后发送 bind 和 resize
    - 使用 `getWebSocketOptions` 获取认证选项
    - _Requirements: 3.1, 3.3, 9.1_

- [x] 11. 最终 Checkpoint
  - 运行所有测试确保通过，验证编译无错误，如有问题请询问用户。

## Notes

- 任务标记 `*` 表示可选的测试任务，可跳过以加快 MVP 开发
- 每个任务引用具体需求，确保可追溯性
- Checkpoint 确保增量验证，及时发现问题
- 属性测试验证通用正确性，单元测试验证特定场景和边界情况
- 实现遵循现有架构模式，与 `KubeExecHandler` 和 `TtydHandler` 保持一致

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1", "4.2", "5.1"] },
    { "id": 4, "tasks": ["4.3", "10.1"] },
    { "id": 5, "tasks": ["10.2"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "8.11"] }
  ]
}
```
