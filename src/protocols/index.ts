/**
 * 协议处理器模块入口
 * @module protocols
 */

import { ProtocolHandler } from './interface'
import { ProtocolType } from './types'
import { KubeExecHandler } from './kube-exec.handler'
import { TtydHandler } from './ttyd.handler'

// 导出所有类型和接口
export * from './interface'
export * from './types'

// 导出协议处理器实现
export * from './kube-exec.handler'
export * from './ttyd.handler'

/**
 * 创建协议处理器实例
 * @param protocolType 协议类型
 * @returns 对应的协议处理器实例
 * @throws {Error} 当协议类型未知时抛出错误
 */
export function createProtocolHandler(protocolType: ProtocolType): ProtocolHandler {
    switch (protocolType) {
        case 'kube-exec':
            return new KubeExecHandler()
        case 'ttyd':
            return new TtydHandler()
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
    return value === 'kube-exec' || value === 'ttyd'
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
