# Implementation Plan: ttyd-protocol-support

## Overview

本实现计划为 tabby-ws-term 插件添加 ttyd 协议支持，核心是引入协议处理器抽象层。采用策略模式，将协议相关的编解码逻辑从会话层分离，使添加新协议只需实现协议处理器接口。

## Tasks

- [x] 1. 创建协议处理器模块基础结构
  - [x] 1.1 创建类型定义文件 src/protocols/types.ts
    - 定义 ProtocolType 类型（'kube-exec' | 'ttyd'）
    - 定义 TerminalSize 接口
    - 定义 DecodedMessage 联合类型（output, title, toast, preferences）
    - 定义常量 TTYD_PREFIX 和 KUBE_EXEC_OP
    - _Requirements: 1.3, 8.2_

  - [x] 1.2 创建协议处理器接口 src/protocols/interface.ts
    - 定义 ProtocolHandler 接口
    - 包含 protocolType 只读属性
    - 包含 encodeInput、encodeResize、encodeKeepalive、decode 方法签名
    - _Requirements: 8.2_

  - [x] 1.3 创建模块导出和工厂函数 src/protocols/index.ts
    - 导出所有类型和接口
    - 实现 createProtocolHandler 工厂函数
    - 实现 isValidProtocolType 验证函数
    - 实现 normalizeProtocolType 规范化函数
    - _Requirements: 8.4, 1.4_

  - [x] 1.4 编写工厂函数的单元测试
    - 测试 createProtocolHandler 为各协议类型创建正确的处理器
    - 测试 isValidProtocolType 正确验证协议类型
    - 测试 normalizeProtocolType 正确规范化各种输入
    - _Requirements: 1.4, 8.4_

- [x] 2. 实现 kube-exec 协议处理器
  - [x] 2.1 实现 KubeExecHandler 类 src/protocols/kube-exec.handler.ts
    - 实现 encodeInput 方法，生成 `{"Op":"stdin","Data":"..."}` 格式
    - 实现 encodeResize 方法，生成 `{"Op":"resize","Cols":N,"Rows":N}` 格式
    - 实现 encodeKeepalive 方法，使用 resize 消息格式
    - 实现 decode 方法，解析 stdout 和 toast 消息，处理非 JSON 消息降级
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 编写 kube-exec 输入编码属性测试
    - **Property 2: kube-exec 输入编码正确性**
    - 验证 encodeInput 返回有效 JSON，包含正确的 Op 和 Data 字段
    - **Validates: Requirements 2.2**

  - [x] 2.3 编写 kube-exec resize 编码属性测试
    - **Property 3: kube-exec resize 编码正确性**
    - 验证 encodeResize 返回有效 JSON，包含正确的 Op、Cols、Rows 字段
    - **Validates: Requirements 2.3**

  - [x] 2.4 编写 kube-exec 解码属性测试
    - **Property 4: kube-exec 解码正确性**
    - 验证 decode 正确解析 stdout 和 toast 消息
    - **Property 5: kube-exec 非 JSON 消息降级**
    - 验证 decode 将非 JSON 消息作为原始输出处理
    - **Validates: Requirements 2.1, 2.4, 2.5**

  - [x] 2.5 编写 kube-exec 往返一致性属性测试
    - **Property 10: 编码解码往返一致性**
    - 验证 decode(encodeInput(data)) 提取的数据与原始数据一致
    - **Validates: Requirements 2.2, 2.4**

- [x] 3. 实现 ttyd 协议处理器
  - [x] 3.1 实现 TtydHandler 类 src/protocols/ttyd.handler.ts
    - 实现 encodeInput 方法，生成 '0' + data 格式
    - 实现 encodeResize 方法，生成 '1' + JSON{columns, rows} 格式
    - 实现 encodeKeepalive 方法，使用 resize 消息格式
    - 实现 decode 方法，处理 '0'、'1'、'2' 前缀消息，忽略无效消息
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.2 编写 ttyd 输入编码属性测试
    - **Property 6: ttyd 输入编码正确性**
    - 验证 encodeInput 返回以 '0' 开头的字符串，内容与原始数据一致
    - **Validates: Requirements 3.1**

  - [x] 3.3 编写 ttyd resize 编码属性测试
    - **Property 7: ttyd resize 编码正确性**
    - 验证 encodeResize 和 encodeKeepalive 返回以 '1' 开头的字符串，包含有效 JSON
    - **Validates: Requirements 3.2, 7.1**

  - [x] 3.4 编写 ttyd 解码属性测试
    - **Property 8: ttyd 解码正确性**
    - 验证 decode 正确处理 '0'、'1'、'2' 前缀消息
    - **Property 9: ttyd 无效消息忽略**
    - 验证 decode 忽略无效前缀和无效 JSON
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

  - [x] 3.5 编写 ttyd 往返一致性属性测试
    - **Property 10: 编码解码往返一致性**
    - 验证 decode(encodeInput(data)) 提取的输出数据与原始数据一致
    - **Validates: Requirements 3.1, 4.1**

- [x] 4. 更新 Profile 定义
  - [x] 4.1 扩展 WSTermProfileOptions 接口
    - 在 src/profiles.ts 中添加 protocol?: ProtocolType 字段
    - 更新 configDefaults 添加 protocol: 'kube-exec' 默认值
    - _Requirements: 1.1, 1.2_

  - [x] 4.2 编写协议类型规范化属性测试
    - **Property 1: 协议类型规范化**
    - 验证 normalizeProtocolType 对各种输入返回正确的协议类型
    - **Validates: Requirements 1.4, 6.3, 9.4**

- [x] 5. 重构会话层使用协议处理器
  - [x] 5.1 重构 WSTermSession 使用协议处理器
    - 在构造函数中根据 profile.options.protocol 创建协议处理器实例
    - 修改 sendToWebSocket 方法使用 handler.encodeInput
    - 修改 resize 方法使用 handler.encodeResize
    - 修改 sendKeepalive 方法使用 handler.encodeKeepalive
    - 修改 handleMessage 方法使用 handler.decode
    - 处理解码后的各种消息类型（output, title, toast, preferences）
    - _Requirements: 2.1-2.6, 3.1-3.4, 4.1-4.5, 7.1-7.4, 8.1, 8.3_

  - [x] 5.2 实现协议类型规范化逻辑
    - 使用 normalizeProtocolType 处理 undefined、null、空字符串等情况
    - 确保无效协议类型回退到默认值 'kube-exec'
    - _Requirements: 1.4, 9.1, 9.4_

  - [x] 5.3 编写会话层集成测试
    - 测试 kube-exec 协议的完整流程
    - 测试 ttyd 协议的完整流程
    - 测试无效协议类型回退到 kube-exec
    - _Requirements: 2.1-2.6, 3.1-3.4, 4.1-4.5_

- [x] 6. 添加配置界面协议选择
  - [x] 6.1 更新配置界面模板
    - 在 src/components/wsTermProfileSettings.component.pug 中添加协议类型选择下拉框
    - 提供 "kube-exec" 和 "ttyd" 两个选项
    - 默认选中 "kube-exec"
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 6.2 添加协议验证逻辑
    - 在保存配置时验证 protocol 字段值
    - 拒绝非 "kube-exec" 或 "ttyd" 的值并显示错误提示
    - _Requirements: 5.4, 5.5_

- [x] 7. 更新快速连接功能
  - [x] 7.1 扩展 quickConnect 方法解析 protocol 参数
    - 解析 URL 参数 ws-term.option.protocol
    - 验证有效值，无效值回退到默认值 'kube-exec'
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 扩展 intoQuickConnectString 方法
    - 当 protocol 为 'ttyd' 时，在 URL 中包含 protocol 参数
    - _Requirements: 6.4_

- [x] 8. Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 9. 验证向后兼容性
  - [x] 9.1 验证现有 Profile 无 protocol 字段时的行为
    - 测试不包含 protocol 字段的 Profile 正常加载
    - 验证默认使用 kube-exec 协议
    - _Requirements: 9.1, 9.2_

  - [x] 9.2 验证 kube-exec 协议消息格式兼容性
    - 确认 stdin、stdout、resize 消息格式与现有实现一致
    - _Requirements: 9.3_

- [x] 10. Final checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## Notes

- 任务标记 `*` 的是可选测试任务，可以跳过以加快 MVP 开发
- 每个任务引用具体的需求条款以确保可追溯性
- 属性测试验证协议处理器的通用正确性属性
- 单元测试验证具体示例和边界情况
- 设计文档使用 TypeScript，所有实现应使用 TypeScript
- 测试文件应放置在 src/protocols/__tests__/ 目录下

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["1.4", "2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "3.4", "3.5", "4.2"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1", "6.2", "7.1", "7.2"] },
    { "id": 5, "tasks": ["9.1", "9.2"] }
  ]
}
```
