/**
 * 协议处理器模块入口
 * @module protocols
 */

import { ProtocolHandler } from './interface'
import { ProtocolType } from './types'
import { KubeExecHandler } from './kube-exec.handler'
import { TtydHandler } from './ttyd.handler'
import { K8sDashboardHandler } from './k8s-dashboard.handler'

// 导出所有类型和接口
export * from './interface'
export * from './types'

// 导出协议处理器实现
export * from './kube-exec.handler'
export * from './ttyd.handler'
export * from './k8s-dashboard.handler'

/**
 * 所有可用的协议处理器类
 * 按优先级排序：K8sDashboard > Ttyd > KubeExec
 * KubeExec 是默认协议，总是返回 true，所以放在最后
 */
const handlerClasses = [
    K8sDashboardHandler,
    TtydHandler,
    KubeExecHandler,
]

/**
 * 创建协议处理器实例
 * 
 * 如果指定了协议类型，则创建对应类型的处理器。
 * 如果未指定协议类型（undefined 或无效值），则根据 URL 自动识别：
 * 遍历所有 handler，找到第一个能处理该 URL 的 handler。
 * 
 * @param protocolType 协议类型（可选）
 * @param wsUrl WebSocket URL（用于自动识别协议类型和 K8sDashboardHandler 提取 SessionID）
 * @returns 对应的协议处理器实例
 * @throws {Error} 当协议类型未知时抛出错误
 */
export function createProtocolHandler(protocolType?: ProtocolType, wsUrl?: string): ProtocolHandler {
    // 如果指定了有效的协议类型，直接创建对应的处理器
    if (protocolType && isValidProtocolType(protocolType)) {
        return createHandlerByType(protocolType, wsUrl)
    }

    // 未指定协议类型或协议类型无效，根据 URL 自动识别
    if (wsUrl) {
        // 遍历所有 handler，找到第一个能处理该 URL 的 handler
        for (const HandlerClass of handlerClasses) {
            // 创建临时实例用于检测
            const tempHandler = new HandlerClass(wsUrl)
            if (tempHandler.canHandle(wsUrl)) {
                return tempHandler
            }
        }
    }

    // 默认返回 kube-exec 处理器
    return new KubeExecHandler()
}

/**
 * 根据协议类型创建处理器实例
 * @param protocolType 协议类型
 * @param wsUrl WebSocket URL（可选，用于 K8sDashboardHandler 提取 SessionID）
 * @returns 对应的协议处理器实例
 */
function createHandlerByType(protocolType: ProtocolType, wsUrl?: string): ProtocolHandler {
    switch (protocolType) {
        case 'kube-exec':
            return new KubeExecHandler()
        case 'ttyd':
            return new TtydHandler()
        case 'k8s-dashboard':
            return new K8sDashboardHandler(wsUrl)
        default:
            // 类型保护，确保处理所有可能的值
            const _exhaustiveCheck: never = protocolType
            throw new Error(`Unknown protocol type: ${_exhaustiveCheck}`)
    }
}

/**
 * 验证协议类型是否有效
 * @param value 待验证的值
 * @returns 是否为有效的协议类型
 */
export function isValidProtocolType(value: unknown): value is ProtocolType {
    return value === 'kube-exec' || value === 'ttyd' || value === 'k8s-dashboard'
}

/**
 * 规范化协议类型
 * @param value 输入值
 * @returns 有效的协议类型（无效值返回默认值 'kube-exec'）
 */
export function normalizeProtocolType(value: unknown): ProtocolType {
    if (isValidProtocolType(value)) {
        return value
    }
    return 'kube-exec'
}

/**
 * 检查 URL 是否为 K8s Dashboard WebSocket URL
 * @param url WebSocket URL
 * @returns 是否为 K8s Dashboard 协议的 URL
 *
 * 检测规则：
 * 1. URL 路径包含 "/api/sockjs/" 或 "/sockjs/"
 * 2. URL 查询参数名称匹配 32 位十六进制格式
 * 
 * @deprecated 请使用 K8sDashboardHandler.canHandle(url) 代替
 */
export function isK8sDashboardUrl(url: string): boolean {
    const handler = new K8sDashboardHandler()
    return handler.canHandle(url)
}

/**
 * 根据 URL 特征自动检测协议类型
 * @param wsUrl WebSocket URL
 * @returns 检测到的协议类型，默认返回 'kube-exec'
 *
 * 检测逻辑：
 * - 如果 URL 匹配 K8s Dashboard 特征，返回 'k8s-dashboard'
 * - 否则返回默认协议类型 'kube-exec'
 * 
 * @deprecated 请使用 createProtocolHandler(undefined, wsUrl) 代替
 */
export function detectProtocolType(wsUrl: string): ProtocolType {
    const handler = createProtocolHandler(undefined, wsUrl)
    return handler.protocolType
}
