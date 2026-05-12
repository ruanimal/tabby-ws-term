/**
 * kube-exec 协议处理器属性测试
 * @module protocols/__tests__/kube-exec.handler.spec
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { KubeExecHandler } from '../kube-exec.handler'
import { KUBE_EXEC_OP } from '../types'

describe('KubeExecHandler', () => {
    const handler = new KubeExecHandler()

    describe('Property 2: kube-exec 输入编码正确性', () => {
        /**
         * Property 2: 对于任意用户输入数据，KubeExecHandler.encodeInput SHALL 返回有效的 JSON 字符串，
         * 且解析后包含 Op: "stdin" 和正确的 Data 字段。
         *
         * Validates: Requirements 2.2
         */
        it('encodeInput 返回有效 JSON，包含正确的 Op 和 Data 字段', () => {
            fc.assert(
                fc.property(
                    // 生成任意字符串作为用户输入
                    fc.string({ maxLength: 10000 }),
                    (input) => {
                        const encoded = handler.encodeInput(Buffer.from(input))

                        // 验证返回值是字符串
                        if (typeof encoded !== 'string') {
                            return false
                        }

                        // 验证是有效的 JSON
                        let parsed: unknown
                        try {
                            parsed = JSON.parse(encoded)
                        } catch {
                            return false
                        }

                        // 验证解析结果是对象
                        if (typeof parsed !== 'object' || parsed === null) {
                            return false
                        }

                        // 验证 Op 字段为 "stdin"
                        const msg = parsed as Record<string, unknown>
                        if (msg.Op !== KUBE_EXEC_OP.STDIN) {
                            return false
                        }

                        // 验证 Data 字段与原始输入一致
                        if (msg.Data !== input) {
                            return false
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 2.1: encodeInput 处理包含特殊字符的输入
         *
         * Validates: Requirements 2.2
         */
        it('encodeInput 正确处理包含特殊字符的输入', () => {
            fc.assert(
                fc.property(
                    // 生成包含特殊字符的字符串
                    fc.tuple(
                        fc.string({ maxLength: 1000 }),
                        fc.constantFrom('"', '\\', '\n', '\t', '\r', '{', '}', '[', ']'),
                        fc.string({ maxLength: 1000 })
                    ),
                    ([prefix, special, suffix]) => {
                        const input = prefix + special + suffix
                        const encoded = handler.encodeInput(Buffer.from(input))

                        // 验证是有效的 JSON
                        let parsed: unknown
                        try {
                            parsed = JSON.parse(encoded)
                        } catch {
                            return false
                        }

                        const msg = parsed as Record<string, unknown>
                        return msg.Op === KUBE_EXEC_OP.STDIN && msg.Data === input
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 2.2: encodeInput 处理二进制数据转字符串
         *
         * Validates: Requirements 2.2
         */
        it('encodeInput 正确处理 Buffer 数据', () => {
            fc.assert(
                fc.property(
                    // 生成任意字节数组
                    fc.uint8Array({ minLength: 0, maxLength: 1000 }),
                    (bytes) => {
                        const buffer = Buffer.from(bytes)
                        const encoded = handler.encodeInput(buffer)

                        // 验证是有效的 JSON
                        let parsed: unknown
                        try {
                            parsed = JSON.parse(encoded)
                        } catch {
                            return false
                        }

                        const msg = parsed as Record<string, unknown>
                        if (msg.Op !== KUBE_EXEC_OP.STDIN) {
                            return false
                        }

                        // 验证 Data 字段与 Buffer 转换后的字符串一致
                        if (msg.Data !== buffer.toString()) {
                            return false
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 2.3: encodeInput 处理空输入
         *
         * Validates: Requirements 2.2
         */
        it('encodeInput 正确处理空输入', () => {
            const encoded = handler.encodeInput(Buffer.from(''))

            // 验证是有效的 JSON
            const parsed = JSON.parse(encoded) as Record<string, unknown>

            expect(parsed.Op).toBe(KUBE_EXEC_OP.STDIN)
            expect(parsed.Data).toBe('')
        })

        /**
         * Property 2.4: encodeInput 处理 Unicode 字符
         *
         * Validates: Requirements 2.2
         */
        it('encodeInput 正确处理 Unicode 字符', () => {
            fc.assert(
                fc.property(
                    // 生成包含 Unicode 字符的字符串（使用 grapheme unit）
                    fc.string({ unit: 'grapheme', maxLength: 1000 }),
                    (input) => {
                        const encoded = handler.encodeInput(Buffer.from(input))

                        // 验证是有效的 JSON
                        let parsed: unknown
                        try {
                            parsed = JSON.parse(encoded)
                        } catch {
                            return false
                        }

                        const msg = parsed as Record<string, unknown>
                        return msg.Op === KUBE_EXEC_OP.STDIN && msg.Data === input
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 10: 编码解码往返一致性', () => {
        /**
         * Property 10: 对于任意用户输入数据，协议处理器的编码和解码操作 SHALL 满足以下往返属性：
         * kube-exec: decode(encodeInput(data)) 提取的 Data 与原始数据一致（当作为 stdout 消息解码时）
         *
         * Validates: Requirements 2.2, 2.4
         */
        it('decode(encodeInputAsStdout(data)) 提取的数据与原始数据一致', () => {
            fc.assert(
                fc.property(
                    // 生成任意字符串数据（限制长度以避免性能问题）
                    fc.string({ maxLength: 10000 }),
                    (inputData) => {
                        // 1. 使用 handler 的 encodeInput 编码数据
                        const encodedMsg = handler.encodeInput(Buffer.from(inputData))

                        // 2. 解析编码后的 JSON
                        const parsed = JSON.parse(encodedMsg)

                        // 3. 构造 stdout 消息（模拟服务器返回相同数据）
                        const stdoutMsg = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: parsed.Data,
                        })

                        // 4. 解码 stdout 消息
                        const decoded = handler.decode(stdoutMsg)

                        // 5. 验证解码结果
                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputData = (decoded[0] as { type: 'output'; data: Buffer }).data
                        return outputData.toString() === inputData
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 10.1: 有效 UTF-8 二进制数据的往返一致性
         * 
         * 注意：kube-exec 协议使用 JSON 格式传输数据，Data 字段为字符串类型。
         * 通过 Buffer.toString() 转换二进制数据时，无效的 UTF-8 序列会被替换。
         * 因此，此测试仅验证有效 UTF-8 数据的往返一致性。
         *
         * Validates: Requirements 2.2, 2.4
         */
        it('decode(encodeInputAsStdout(buffer)) 处理有效 UTF-8 二进制数据保持一致', () => {
            fc.assert(
                fc.property(
                    // 生成有效的 UTF-8 字符串，然后转换为 Buffer
                    fc.string({ unit: 'grapheme', maxLength: 500 }),
                    (utf8String) => {
                        const inputBuffer = Buffer.from(utf8String)

                        // 1. 编码
                        const encodedMsg = handler.encodeInput(inputBuffer)
                        const parsed = JSON.parse(encodedMsg)

                        // 2. 构造 stdout 消息
                        const stdoutMsg = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: parsed.Data,
                        })

                        // 3. 解码
                        const decoded = handler.decode(stdoutMsg)

                        // 4. 验证
                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputData = (decoded[0] as { type: 'output'; data: Buffer }).data
                        return outputData.toString() === utf8String
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 10.2: 特殊字符的往返一致性
         * 确保包含特殊字符（如换行、制表符、引号等）的数据能正确往返
         *
         * Validates: Requirements 2.2, 2.4
         */
        it('decode(encodeInputAsStdout(data)) 正确处理特殊字符', () => {
            fc.assert(
                fc.property(
                    // 生成包含特殊字符的字符串
                    fc.tuple(
                        fc.string({ maxLength: 500 }),
                        fc.constantFrom('"', '\\', '\n', '\t', '\r', '{', '}', '[', ']'),
                        fc.string({ maxLength: 500 })
                    ),
                    ([prefix, special, suffix]) => {
                        const inputData = prefix + special + suffix

                        const encodedMsg = handler.encodeInput(Buffer.from(inputData))
                        const parsed = JSON.parse(encodedMsg)

                        const stdoutMsg = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: parsed.Data,
                        })

                        const decoded = handler.decode(stdoutMsg)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputData = (decoded[0] as { type: 'output'; data: Buffer }).data
                        return outputData.toString() === inputData
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 10.3: 多语言字符的往返一致性
         * 测试中文、日文、emoji 等多语言字符
         *
         * Validates: Requirements 2.2, 2.4
         */
        it('decode(encodeInputAsStdout(data)) 正确处理多语言字符', () => {
            fc.assert(
                fc.property(
                    // 从预定义的多语言字符串中选择
                    fc.constantFrom(
                        '中文测试',
                        '日本語テスト',
                        '한국어 테스트',
                        '🎉🚀💻',
                        'Привет мир',
                        'مرحبا بالعالم',
                        'שלום עולם',
                        'Γειά σου Κόσμε',
                        '你好世界',
                        '안녕하세요'
                    ),
                    (inputData) => {
                        const encodedMsg = handler.encodeInput(Buffer.from(inputData))
                        const parsed = JSON.parse(encodedMsg)

                        const stdoutMsg = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: parsed.Data,
                        })

                        const decoded = handler.decode(stdoutMsg)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputData = (decoded[0] as { type: 'output'; data: Buffer }).data
                        return outputData.toString() === inputData
                    }
                ),
                { numRuns: 50 }
            )
        })

        /**
         * Property 10.4: 边界情况的往返一致性
         * 测试空字符串、单字符等边界情况
         *
         * Validates: Requirements 2.2, 2.4
         */
        it('decode(encodeInputAsStdout(data)) 正确处理边界情况', () => {
            fc.assert(
                fc.property(
                    // 生成边界情况的字符串
                    fc.oneof(
                        fc.constant(''),
                        fc.string({ minLength: 0, maxLength: 1 }),
                        fc.string({ minLength: 1, maxLength: 1 }),
                        fc.constant(' '),
                        fc.constant('  '),
                        fc.constant('\n'),
                        fc.constant('\t')
                    ),
                    (inputData) => {
                        const encodedMsg = handler.encodeInput(Buffer.from(inputData))
                        const parsed = JSON.parse(encodedMsg)

                        const stdoutMsg = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: parsed.Data,
                        })

                        const decoded = handler.decode(stdoutMsg)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputData = (decoded[0] as { type: 'output'; data: Buffer }).data
                        return outputData.toString() === inputData
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 3: kube-exec resize 编码正确性', () => {
        /**
         * Property 3: 对于任意有效的终端尺寸（列数和行数为正整数），
         * KubeExecHandler.encodeResize SHALL 返回有效的 JSON 字符串，
         * 且解析后包含 Op: "resize" 和正确的 Cols、Rows 字段。
         *
         * Validates: Requirements 2.3
         */
        it('encodeResize 返回有效 JSON，包含正确的 Op、Cols、Rows 字段', () => {
            fc.assert(
                fc.property(
                    // 生成有效的终端尺寸（正整数）
                    // 根据 Requirements 2.3，N 为 1 到 9999 之间的正整数
                    fc.integer({ min: 1, max: 9999 }),
                    fc.integer({ min: 1, max: 9999 }),
                    (columns, rows) => {
                        const size = { columns, rows }
                        const encoded = handler.encodeResize(size)

                        // 验证返回值是字符串
                        if (typeof encoded !== 'string') {
                            return false
                        }

                        // 验证是有效的 JSON
                        let parsed: unknown
                        try {
                            parsed = JSON.parse(encoded)
                        } catch {
                            return false
                        }

                        // 验证解析结果是对象
                        if (typeof parsed !== 'object' || parsed === null) {
                            return false
                        }

                        // 验证 Op 字段为 "resize"
                        const msg = parsed as Record<string, unknown>
                        if (msg.Op !== KUBE_EXEC_OP.RESIZE) {
                            return false
                        }

                        // 验证 Cols 字段与输入一致
                        if (msg.Cols !== columns) {
                            return false
                        }

                        // 验证 Rows 字段与输入一致
                        if (msg.Rows !== rows) {
                            return false
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 3.1: encodeResize 处理边界值
         *
         * Validates: Requirements 2.3
         */
        it('encodeResize 正确处理边界值', () => {
            // 测试最小值
            const minSize = { columns: 1, rows: 1 }
            const minEncoded = handler.encodeResize(minSize)
            const minParsed = JSON.parse(minEncoded) as Record<string, unknown>
            expect(minParsed.Op).toBe(KUBE_EXEC_OP.RESIZE)
            expect(minParsed.Cols).toBe(1)
            expect(minParsed.Rows).toBe(1)

            // 测试最大值
            const maxSize = { columns: 9999, rows: 9999 }
            const maxEncoded = handler.encodeResize(maxSize)
            const maxParsed = JSON.parse(maxEncoded) as Record<string, unknown>
            expect(maxParsed.Op).toBe(KUBE_EXEC_OP.RESIZE)
            expect(maxParsed.Cols).toBe(9999)
            expect(maxParsed.Rows).toBe(9999)
        })

        /**
         * Property 3.2: encodeResize 处理常见终端尺寸
         *
         * Validates: Requirements 2.3
         */
        it('encodeResize 正确处理常见终端尺寸', () => {
            const commonSizes = [
                { columns: 80, rows: 24 },   // 标准 VT100
                { columns: 80, rows: 25 },   // 标准 DOS
                { columns: 132, rows: 43 },  // 大终端
                { columns: 120, rows: 30 },  // 现代终端
            ]

            for (const size of commonSizes) {
                const encoded = handler.encodeResize(size)
                const parsed = JSON.parse(encoded) as Record<string, unknown>
                expect(parsed.Op).toBe(KUBE_EXEC_OP.RESIZE)
                expect(parsed.Cols).toBe(size.columns)
                expect(parsed.Rows).toBe(size.rows)
            }
        })

        /**
         * Property 3.3: encodeResize 不包含 Data 字段
         *
         * Validates: Requirements 2.3
         */
        it('encodeResize 不包含 Data 字段', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 9999 }),
                    fc.integer({ min: 1, max: 9999 }),
                    (columns, rows) => {
                        const size = { columns, rows }
                        const encoded = handler.encodeResize(size)
                        const parsed = JSON.parse(encoded) as Record<string, unknown>

                        // resize 消息不应包含 Data 字段
                        return !('Data' in parsed)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 4: kube-exec 解码正确性', () => {
        /**
         * Property 4: 对于任意格式为 `{"Op":"stdout","Data":"..."}` 或 `{"Op":"toast","Data":"..."}`
         * 的有效 JSON 消息，KubeExecHandler.decode SHALL 正确提取 Data 内容并返回对应类型的解码消息。
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确解析 stdout 消息', () => {
            fc.assert(
                fc.property(
                    // 生成任意字符串作为 Data 内容
                    fc.string({ maxLength: 10000 }),
                    (dataContent) => {
                        const message = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: dataContent,
                        })

                        const decoded = handler.decode(message)

                        // 验证返回结果
                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === dataContent
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 4.1: decode 正确解析 toast 消息
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确解析 toast 消息', () => {
            fc.assert(
                fc.property(
                    // 生成任意字符串作为 Data 内容
                    fc.string({ maxLength: 10000 }),
                    (dataContent) => {
                        const message = JSON.stringify({
                            Op: KUBE_EXEC_OP.TOAST,
                            Data: dataContent,
                        })

                        const decoded = handler.decode(message)

                        // 验证返回结果
                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'toast') return false

                        const toastMsg = decoded[0] as { type: 'toast'; data: string }
                        return toastMsg.data === dataContent
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 4.2: decode 处理 stdout 消息中的特殊字符
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确处理 stdout 消息中的特殊字符', () => {
            fc.assert(
                fc.property(
                    // 生成包含特殊字符的字符串
                    fc.tuple(
                        fc.string({ maxLength: 1000 }),
                        fc.constantFrom('"', '\\', '\n', '\t', '\r', '{', '}', '[', ']'),
                        fc.string({ maxLength: 1000 })
                    ),
                    ([prefix, special, suffix]) => {
                        const dataContent = prefix + special + suffix
                        const message = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: dataContent,
                        })

                        const decoded = handler.decode(message)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === dataContent
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 4.3: decode 处理 toast 消息中的特殊字符
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确处理 toast 消息中的特殊字符', () => {
            fc.assert(
                fc.property(
                    // 生成包含特殊字符的字符串
                    fc.tuple(
                        fc.string({ maxLength: 1000 }),
                        fc.constantFrom('"', '\\', '\n', '\t', '\r', '{', '}', '[', ']'),
                        fc.string({ maxLength: 1000 })
                    ),
                    ([prefix, special, suffix]) => {
                        const dataContent = prefix + special + suffix
                        const message = JSON.stringify({
                            Op: KUBE_EXEC_OP.TOAST,
                            Data: dataContent,
                        })

                        const decoded = handler.decode(message)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'toast') return false

                        const toastMsg = decoded[0] as { type: 'toast'; data: string }
                        return toastMsg.data === dataContent
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 4.4: decode 处理多语言字符
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确处理多语言字符', () => {
            fc.assert(
                fc.property(
                    // 从预定义的多语言字符串中选择
                    fc.constantFrom(
                        '中文测试',
                        '日本語テスト',
                        '한국어 테스트',
                        '🎉🚀💻',
                        'Привет мир',
                        'مرحبا بالعالم',
                        'שלום עולם',
                        'Γειά σου Κόσμε',
                        '你好世界',
                        '안녕하세요'
                    ),
                    fc.constantFrom(KUBE_EXEC_OP.STDOUT, KUBE_EXEC_OP.TOAST),
                    (dataContent, op) => {
                        const message = JSON.stringify({
                            Op: op,
                            Data: dataContent,
                        })

                        const decoded = handler.decode(message)

                        if (decoded.length !== 1) return false

                        if (op === KUBE_EXEC_OP.STDOUT) {
                            if (decoded[0].type !== 'output') return false
                            const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMsg.data.toString() === dataContent
                        } else {
                            if (decoded[0].type !== 'toast') return false
                            const toastMsg = decoded[0] as { type: 'toast'; data: string }
                            return toastMsg.data === dataContent
                        }
                    }
                ),
                { numRuns: 50 }
            )
        })

        /**
         * Property 4.5: decode 忽略 Data 为 undefined 的消息
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 忽略 Data 为 undefined 的消息', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(KUBE_EXEC_OP.STDOUT, KUBE_EXEC_OP.TOAST),
                    (op) => {
                        const message = JSON.stringify({
                            Op: op,
                            // 不包含 Data 字段
                        })

                        const decoded = handler.decode(message)

                        // 应该返回空数组
                        return decoded.length === 0
                    }
                ),
                { numRuns: 10 }
            )
        })

        /**
         * Property 4.6: decode 忽略未知 Op 类型
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 忽略未知 Op 类型', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.string({ maxLength: 1000 }),
                    (unknownOp, dataContent) => {
                        // 排除已知的 Op 类型
                        fc.pre(unknownOp !== KUBE_EXEC_OP.STDIN)
                        fc.pre(unknownOp !== KUBE_EXEC_OP.STDOUT)
                        fc.pre(unknownOp !== KUBE_EXEC_OP.RESIZE)
                        fc.pre(unknownOp !== KUBE_EXEC_OP.TOAST)

                        const message = JSON.stringify({
                            Op: unknownOp,
                            Data: dataContent,
                        })

                        const decoded = handler.decode(message)

                        // 应该返回空数组
                        return decoded.length === 0
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 4.7: decode 处理空 Data 字段
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确处理空 Data 字段', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(KUBE_EXEC_OP.STDOUT, KUBE_EXEC_OP.TOAST),
                    (op) => {
                        const message = JSON.stringify({
                            Op: op,
                            Data: '',
                        })

                        const decoded = handler.decode(message)

                        if (decoded.length !== 1) return false

                        if (op === KUBE_EXEC_OP.STDOUT) {
                            if (decoded[0].type !== 'output') return false
                            const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMsg.data.toString() === ''
                        } else {
                            if (decoded[0].type !== 'toast') return false
                            const toastMsg = decoded[0] as { type: 'toast'; data: string }
                            return toastMsg.data === ''
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        /**
         * Property 4.8: decode 处理 Buffer 类型的消息
         *
         * Validates: Requirements 2.1, 2.4, 2.5
         */
        it('decode 正确处理 Buffer 类型的消息', () => {
            fc.assert(
                fc.property(
                    fc.string({ maxLength: 1000 }),
                    (dataContent) => {
                        const message = JSON.stringify({
                            Op: KUBE_EXEC_OP.STDOUT,
                            Data: dataContent,
                        })
                        const buffer = Buffer.from(message)

                        const decoded = handler.decode(buffer)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === dataContent
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 5: kube-exec 非 JSON 消息降级', () => {
        /**
         * Property 5: 对于任意非 JSON 格式的消息，KubeExecHandler.decode SHALL
         * 将消息作为原始输出处理，返回 `output` 类型的解码消息。
         *
         * Validates: Requirements 2.1
         */
        it('decode 将非 JSON 消息作为原始输出处理', () => {
            fc.assert(
                fc.property(
                    // 生成非 JSON 字符串
                    fc.oneof(
                        // 纯文本（不以 { 或 [ 开头，且不是有效的 JSON 值如 true/false/null/数字）
                        fc.string({ maxLength: 1000 }).filter(s => {
                            // 过滤掉有效的 JSON 值
                            try {
                                JSON.parse(s)
                                return false
                            } catch {
                                return true
                            }
                        }),
                        // 无效 JSON（缺少闭合括号）
                        fc.tuple(
                            fc.string({ maxLength: 500 }),
                            fc.constant('{"Op":"stdout","Data":"test"')
                        ).map(([prefix, invalidJson]) => prefix + invalidJson),
                        // 纯文本带特殊字符
                        fc.string({ maxLength: 1000 }).filter(s => {
                            // 确保不是以 JSON 格式开头
                            if (s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) {
                                return false
                            }
                            // 确保不是有效的 JSON 值
                            try {
                                JSON.parse(s)
                                return false
                            } catch {
                                return true
                            }
                        })
                    ),
                    (nonJsonText) => {
                        const decoded = handler.decode(nonJsonText)

                        // 应该返回单个 output 消息
                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === nonJsonText
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 5.1: decode 处理纯文本消息
         *
         * Validates: Requirements 2.1
         */
        it('decode 将纯文本消息作为原始输出处理', () => {
            fc.assert(
                fc.property(
                    // 生成不包含 JSON 结构的纯文本
                    fc.string({ maxLength: 1000 }).filter(s => {
                        // 过滤掉看起来像 JSON 的字符串
                        if (s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) {
                            return false
                        }
                        // 过滤掉有效的 JSON 值（数字、true、false、null）
                        try {
                            JSON.parse(s)
                            return false // 是有效的 JSON，应该被过滤掉
                        } catch {
                            return true // 不是有效的 JSON，保留
                        }
                    }),
                    (plainText) => {
                        const decoded = handler.decode(plainText)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === plainText
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 5.2: decode 处理终端转义序列
         *
         * Validates: Requirements 2.1
         */
        it('decode 正确处理终端转义序列', () => {
            fc.assert(
                fc.property(
                    // 生成包含终端转义序列的字符串
                    fc.tuple(
                        fc.string({ maxLength: 500 }),
                        fc.constantFrom(
                            '\x1b[31m', // 红色
                            '\x1b[0m',  // 重置
                            '\x1b[2J',  // 清屏
                            '\x1b[H',   // 光标归位
                            '\x1b[?25h', // 显示光标
                            '\x1b[?25l'  // 隐藏光标
                        ),
                        fc.string({ maxLength: 500 })
                    ),
                    ([prefix, escapeSeq, suffix]) => {
                        const terminalOutput = prefix + escapeSeq + suffix

                        const decoded = handler.decode(terminalOutput)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === terminalOutput
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 5.3: decode 处理二进制数据转字符串
         *
         * 注意：kube-exec 协议使用 JSON 格式传输数据，二进制数据需要通过 Buffer.toString() 转换。
         * 无效的 UTF-8 序列会被替换字符（U+FFFD）替换，因此此测试仅验证有效 UTF-8 数据。
         *
         * Validates: Requirements 2.1
         */
        it('decode 正确处理有效 UTF-8 二进制数据', () => {
            fc.assert(
                fc.property(
                    // 生成有效的 UTF-8 字符串，然后转换为 Buffer
                    fc.string({ unit: 'grapheme', maxLength: 500 }),
                    (utf8String) => {
                        const buffer = Buffer.from(utf8String)

                        const decoded = handler.decode(buffer)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        // 验证解码后的数据与原始字符串一致
                        return outputMsg.data.toString() === utf8String
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 5.4: decode 处理部分 JSON 格式的消息
         *
         * Validates: Requirements 2.1
         */
        it('decode 将部分 JSON 格式的消息作为原始输出处理', () => {
            const partialJsonMessages = [
                '{"Op":"stdout"',  // 缺少闭合
                '"Op":"stdout"}',  // 缺少开始
                '{"Op":"stdout"',  // 缺少 Data
                '{"Op":}',         // 格式错误
                '{"Data":"test"',  // 缺少 Op
                'Op: stdout',      // 不是 JSON 格式
            ]

            for (const partialJson of partialJsonMessages) {
                const decoded = handler.decode(partialJson)

                expect(decoded.length).toBe(1)
                expect(decoded[0].type).toBe('output')

                const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                expect(outputMsg.data.toString()).toBe(partialJson)
            }
        })

        /**
         * Property 5.5: decode 处理空消息
         *
         * Validates: Requirements 2.1
         */
        it('decode 正确处理空消息', () => {
            const decoded = handler.decode('')

            expect(decoded.length).toBe(1)
            expect(decoded[0].type).toBe('output')

            const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
            expect(outputMsg.data.toString()).toBe('')
        })

        /**
         * Property 5.6: decode 处理 Uint8Array 类型的消息
         *
         * Validates: Requirements 2.1
         */
        it('decode 正确处理 Uint8Array 类型的消息', () => {
            fc.assert(
                fc.property(
                    fc.string({ maxLength: 1000 }),
                    (dataContent) => {
                        // 构造一个非 JSON 的消息
                        const nonJsonText = 'plain text: ' + dataContent
                        const uint8Array = new TextEncoder().encode(nonJsonText)

                        const decoded = handler.decode(uint8Array)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === nonJsonText
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property 5.7: decode 处理 ArrayBuffer 类型的消息
         *
         * Validates: Requirements 2.1
         */
        it('decode 正确处理 ArrayBuffer 类型的消息', () => {
            fc.assert(
                fc.property(
                    fc.string({ maxLength: 1000 }),
                    (dataContent) => {
                        const nonJsonText = 'raw output: ' + dataContent
                        const buffer = Buffer.from(nonJsonText)
                        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

                        const decoded = handler.decode(arrayBuffer)

                        if (decoded.length !== 1) return false
                        if (decoded[0].type !== 'output') return false

                        const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                        return outputMsg.data.toString() === nonJsonText
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
