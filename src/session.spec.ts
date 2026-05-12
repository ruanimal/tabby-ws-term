/**
 * 会话层集成测试
 * 测试协议处理器的创建和使用流程
 * 
 * 由于 WSTermSession 继承自 BaseSession（来自 tabby-terminal），
 * 而 BaseSession 有 Angular 依赖，直接测试 WSTermSession 会遇到
 * Angular JIT 编译问题。因此，本测试文件专注于测试协议处理器的
 * 创建逻辑和会话层相关的协议处理行为。
 * 
 * **Validates: Requirements 2.1-2.6, 3.1-3.4, 4.1-4.5**
 */

import { describe, it, expect } from 'vitest'
import {
    createProtocolHandler,
    normalizeProtocolType,
    isValidProtocolType,
} from './protocols'
import { KubeExecHandler } from './protocols/kube-exec.handler'
import { TtydHandler } from './protocols/ttyd.handler'

describe('会话层协议处理器集成测试', () => {
    describe('协议处理器创建 - 基于 profile.options.protocol 的场景', () => {
        /**
         * 模拟 WSTermSession 构造函数中的协议处理器创建逻辑：
         * const normalizedProtocol = normalizeProtocolType(profile.options.protocol)
         * this.protocolHandler = createProtocolHandler(normalizedProtocol)
         */

        it('当 protocol 为 "kube-exec" 时，创建 KubeExecHandler 实例', () => {
            // 模拟 profile.options.protocol = 'kube-exec'
            const protocol = 'kube-exec'
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为 "ttyd" 时，创建 TtydHandler 实例', () => {
            // 模拟 profile.options.protocol = 'ttyd'
            const protocol = 'ttyd'
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(TtydHandler)
            expect(handler.protocolType).toBe('ttyd')
        })

        it('当 protocol 为 undefined 时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = undefined
            const protocol = undefined
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为 null 时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = null
            const protocol = null
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为空字符串时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = ''
            const protocol = ''
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为无效字符串值时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = 'invalid-protocol'
            const protocol = 'invalid-protocol'
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为数字时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = 123（错误类型）
            const protocol = 123
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为对象时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = { type: 'kube-exec' }（错误类型）
            const protocol = { type: 'kube-exec' }
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })

        it('当 protocol 为布尔值时，回退到 kube-exec', () => {
            // 模拟 profile.options.protocol = true（错误类型）
            const protocol = true
            const normalizedProtocol = normalizeProtocolType(protocol)
            const handler = createProtocolHandler(normalizedProtocol)

            expect(handler).toBeInstanceOf(KubeExecHandler)
            expect(handler.protocolType).toBe('kube-exec')
        })
    })

    describe('kube-exec 协议完整流程', () => {
        it('encodeInput 返回正确格式的 JSON 消息', () => {
            const handler = createProtocolHandler('kube-exec')

            // 测试输入编码
            const inputData = Buffer.from('ls -la\n')
            const encoded = handler.encodeInput(inputData)

            expect(typeof encoded).toBe('string')

            const parsed = JSON.parse(encoded as string)
            expect(parsed.Op).toBe('stdin')
            expect(parsed.Data).toBe('ls -la\n')
        })

        it('encodeResize 返回正确格式的 JSON 消息', () => {
            const handler = createProtocolHandler('kube-exec')

            // 测试 resize 编码
            const size = { columns: 120, rows: 40 }
            const encoded = handler.encodeResize(size)

            expect(typeof encoded).toBe('string')

            const parsed = JSON.parse(encoded as string)
            expect(parsed.Op).toBe('resize')
            expect(parsed.Cols).toBe(120)
            expect(parsed.Rows).toBe(40)
        })

        it('decode 正确解析 stdout 消息', () => {
            const handler = createProtocolHandler('kube-exec')

            // 测试消息解码
            const serverMessage = JSON.stringify({
                Op: 'stdout',
                Data: 'Hello, World!',
            })

            const decoded = handler.decode(serverMessage)

            expect(decoded).toHaveLength(1)
            expect(decoded[0].type).toBe('output')
            expect((decoded[0] as any).data.toString()).toBe('Hello, World!')
        })

        it('decode 正确解析 toast 消息', () => {
            const handler = createProtocolHandler('kube-exec')

            const serverMessage = JSON.stringify({
                Op: 'toast',
                Data: 'Connection established',
            })

            const decoded = handler.decode(serverMessage)

            expect(decoded).toHaveLength(1)
            expect(decoded[0].type).toBe('toast')
            expect((decoded[0] as any).data).toBe('Connection established')
        })

        it('encodeKeepalive 使用 resize 消息格式', () => {
            const handler = createProtocolHandler('kube-exec')

            const size = { columns: 80, rows: 24 }
            const keepaliveMsg = handler.encodeKeepalive(size)
            const resizeMsg = handler.encodeResize(size)

            expect(keepaliveMsg).toBe(resizeMsg)
        })

        it('处理包含特殊字符的输入', () => {
            const handler = createProtocolHandler('kube-exec')

            // 测试包含特殊字符的输入
            const specialInputs = [
                'echo "hello world"\n',
                'cat file.txt | grep "pattern"\n',
                'echo $HOME\n',
                'ls -la && echo "done"\n',
            ]

            for (const input of specialInputs) {
                const encoded = handler.encodeInput(Buffer.from(input))
                const parsed = JSON.parse(encoded as string)
                expect(parsed.Data).toBe(input)
            }
        })

        it('处理非 JSON 消息降级', () => {
            const handler = createProtocolHandler('kube-exec')

            // 测试非 JSON 消息
            const rawMessage = 'Raw text output'
            const decoded = handler.decode(rawMessage)

            expect(decoded).toHaveLength(1)
            expect(decoded[0].type).toBe('output')
            expect((decoded[0] as any).data.toString()).toBe('Raw text output')
        })
    })

    describe('ttyd 协议完整流程', () => {
        it('encodeInput 返回正确格式的字符串消息', () => {
            const handler = createProtocolHandler('ttyd')

            // 测试输入编码
            const inputData = Buffer.from('ls -la\n')
            const encoded = handler.encodeInput(inputData)

            expect(typeof encoded).toBe('string')
            expect((encoded as string).startsWith('0')).toBe(true)
            expect((encoded as string).slice(1)).toBe('ls -la\n')
        })

        it('encodeResize 返回正确格式的字符串消息', () => {
            const handler = createProtocolHandler('ttyd')

            // 测试 resize 编码
            const size = { columns: 120, rows: 40 }
            const encoded = handler.encodeResize(size)

            expect(typeof encoded).toBe('string')
            expect((encoded as string).startsWith('1')).toBe(true)

            const jsonPart = (encoded as string).slice(1)
            const parsed = JSON.parse(jsonPart)
            expect(parsed.columns).toBe(120)
            expect(parsed.rows).toBe(40)
        })

        it('decode 正确解析 output 消息 (前缀 "0")', () => {
            const handler = createProtocolHandler('ttyd')

            // 测试消息解码
            const serverMessage = '0Hello, World!'

            const decoded = handler.decode(serverMessage)

            expect(decoded).toHaveLength(1)
            expect(decoded[0].type).toBe('output')
            expect((decoded[0] as any).data.toString()).toBe('Hello, World!')
        })

        it('decode 正确解析 title 消息 (前缀 "1")', () => {
            const handler = createProtocolHandler('ttyd')

            const serverMessage = '1My Terminal Title'

            const decoded = handler.decode(serverMessage)

            expect(decoded).toHaveLength(1)
            expect(decoded[0].type).toBe('title')
            expect((decoded[0] as any).data).toBe('My Terminal Title')
        })

        it('decode 正确解析 preferences 消息 (前缀 "2")', () => {
            const handler = createProtocolHandler('ttyd')

            const prefs = { theme: 'dark', fontSize: 14 }
            const serverMessage = '2' + JSON.stringify(prefs)

            const decoded = handler.decode(serverMessage)

            expect(decoded).toHaveLength(1)
            expect(decoded[0].type).toBe('preferences')
            expect((decoded[0] as any).data).toEqual(prefs)
        })

        it('encodeKeepalive 使用 resize 消息格式', () => {
            const handler = createProtocolHandler('ttyd')

            const size = { columns: 80, rows: 24 }
            const keepaliveMsg = handler.encodeKeepalive(size)
            const resizeMsg = handler.encodeResize(size)

            expect(keepaliveMsg).toBe(resizeMsg)
        })

        it('处理包含特殊字符的输入', () => {
            const handler = createProtocolHandler('ttyd')

            // 测试包含特殊字符的输入
            const specialInputs = [
                'echo "hello world"\n',
                'cat file.txt | grep "pattern"\n',
                'echo $HOME\n',
                'ls -la && echo "done"\n',
            ]

            for (const input of specialInputs) {
                const encoded = handler.encodeInput(Buffer.from(input))
                expect((encoded as string).startsWith('0')).toBe(true)
                expect((encoded as string).slice(1)).toBe(input)
            }
        })

        it('忽略无效前缀的消息', () => {
            const handler = createProtocolHandler('ttyd')

            // 测试无效前缀
            const invalidMessages = ['3invalid', 'Xinvalid', 'invalid']

            for (const msg of invalidMessages) {
                const decoded = handler.decode(msg)
                expect(decoded).toHaveLength(0)
            }
        })
    })

    describe('协议处理器的行为一致性', () => {
        it('kube-exec 和 ttyd 都能处理空输入', () => {
            const kubeExecHandler = createProtocolHandler('kube-exec')
            const ttydHandler = createProtocolHandler('ttyd')

            // 两者都应该能处理空输入
            expect(() => kubeExecHandler.encodeInput(Buffer.from(''))).not.toThrow()
            expect(() => ttydHandler.encodeInput(Buffer.from(''))).not.toThrow()
        })

        it('kube-exec 和 ttyd 都能处理有效尺寸', () => {
            const kubeExecHandler = createProtocolHandler('kube-exec')
            const ttydHandler = createProtocolHandler('ttyd')

            const size = { columns: 80, rows: 24 }

            // 两者都应该能处理有效尺寸
            expect(() => kubeExecHandler.encodeResize(size)).not.toThrow()
            expect(() => ttydHandler.encodeResize(size)).not.toThrow()
        })

        it('kube-exec 和 ttyd 都使用 resize 作为 keepalive', () => {
            const kubeExecHandler = createProtocolHandler('kube-exec')
            const ttydHandler = createProtocolHandler('ttyd')

            const size = { columns: 80, rows: 24 }

            // 两者的 keepalive 都应该与 resize 相同
            expect(kubeExecHandler.encodeKeepalive(size)).toBe(kubeExecHandler.encodeResize(size))
            expect(ttydHandler.encodeKeepalive(size)).toBe(ttydHandler.encodeResize(size))
        })
    })

    describe('normalizeProtocolType 行为验证', () => {
        it('对有效值返回原值', () => {
            expect(normalizeProtocolType('kube-exec')).toBe('kube-exec')
            expect(normalizeProtocolType('ttyd')).toBe('ttyd')
        })

        it('对无效值返回默认值 kube-exec', () => {
            expect(normalizeProtocolType(undefined)).toBe('kube-exec')
            expect(normalizeProtocolType(null)).toBe('kube-exec')
            expect(normalizeProtocolType('')).toBe('kube-exec')
            expect(normalizeProtocolType('invalid')).toBe('kube-exec')
            expect(normalizeProtocolType(123)).toBe('kube-exec')
            expect(normalizeProtocolType(true)).toBe('kube-exec')
            expect(normalizeProtocolType({})).toBe('kube-exec')
        })

        it('返回值始终是有效的协议类型', () => {
            const testValues = [
                'kube-exec',
                'ttyd',
                undefined,
                null,
                '',
                'invalid',
                123,
                true,
                {},
                [],
            ]

            for (const value of testValues) {
                const result = normalizeProtocolType(value)
                expect(['kube-exec', 'ttyd']).toContain(result)
            }
        })

        it('幂等性：对结果再次调用返回相同值', () => {
            const testValues = ['kube-exec', 'ttyd', undefined, null, 'invalid']

            for (const value of testValues) {
                const result1 = normalizeProtocolType(value)
                const result2 = normalizeProtocolType(result1)
                expect(result2).toBe(result1)
            }
        })
    })

    describe('isValidProtocolType 行为验证', () => {
        it('对有效值返回 true', () => {
            expect(isValidProtocolType('kube-exec')).toBe(true)
            expect(isValidProtocolType('ttyd')).toBe(true)
        })

        it('对无效值返回 false', () => {
            expect(isValidProtocolType(undefined)).toBe(false)
            expect(isValidProtocolType(null)).toBe(false)
            expect(isValidProtocolType('')).toBe(false)
            expect(isValidProtocolType('invalid')).toBe(false)
            expect(isValidProtocolType(123)).toBe(false)
            expect(isValidProtocolType(true)).toBe(false)
            expect(isValidProtocolType({})).toBe(false)
            expect(isValidProtocolType([])).toBe(false)
        })
    })
})
