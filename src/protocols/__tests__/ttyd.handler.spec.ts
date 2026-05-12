/**
 * ttyd 协议处理器测试
 * @module protocols/__tests__/ttyd.handler.spec.ts
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { TtydHandler } from '../ttyd.handler'
import { TerminalSize, TTYD_PREFIX } from '../types'

describe('TtydHandler', () => {
    const handler = new TtydHandler()

    describe('Unit Tests', () => {
        describe('encodeConnect', () => {
            it('should return a Buffer', () => {
                const size: TerminalSize = { columns: 127, rows: 32 }
                const result = handler.encodeConnect(size)
                expect(result).toBeInstanceOf(Buffer)
            })

            it('should contain valid JSON with AuthToken, columns, rows', () => {
                const size: TerminalSize = { columns: 120, rows: 40 }
                const result = handler.encodeConnect(size)
                const parsed = JSON.parse(result.toString())
                expect(parsed).toHaveProperty('AuthToken')
                expect(parsed).toHaveProperty('columns')
                expect(parsed).toHaveProperty('rows')
                expect(parsed.columns).toBe(120)
                expect(parsed.rows).toBe(40)
                expect(parsed.AuthToken).toBe('')
            })

            it('should use provided authToken', () => {
                const size: TerminalSize = { columns: 80, rows: 24 }
                const result = handler.encodeConnect(size, 'my-token')
                const parsed = JSON.parse(result.toString())
                expect(parsed.AuthToken).toBe('my-token')
            })

            it('should use empty authToken by default', () => {
                const size: TerminalSize = { columns: 80, rows: 24 }
                const result = handler.encodeConnect(size)
                const parsed = JSON.parse(result.toString())
                expect(parsed.AuthToken).toBe('')
            })
        })

        describe('encodeResize', () => {
            it('should return string starting with "1" prefix', () => {
                const size: TerminalSize = { columns: 80, rows: 24 }
                const result = handler.encodeResize(size)
                expect(result.startsWith(TTYD_PREFIX.RESIZE)).toBe(true)
            })

            it('should contain valid JSON after prefix', () => {
                const size: TerminalSize = { columns: 120, rows: 40 }
                const result = handler.encodeResize(size)
                const jsonPart = result.slice(1)
                expect(() => JSON.parse(jsonPart)).not.toThrow()
            })

            it('should contain correct columns and rows in JSON', () => {
                const size: TerminalSize = { columns: 100, rows: 30 }
                const result = handler.encodeResize(size)
                const jsonPart = result.slice(1)
                const parsed = JSON.parse(jsonPart)
                expect(parsed.columns).toBe(100)
                expect(parsed.rows).toBe(30)
            })
        })

        describe('encodeKeepalive', () => {
            it('should use resize message format for keepalive', () => {
                const size: TerminalSize = { columns: 80, rows: 24 }
                const keepaliveResult = handler.encodeKeepalive(size)
                const resizeResult = handler.encodeResize(size)
                expect(keepaliveResult).toBe(resizeResult)
            })

            it('should start with "1" prefix', () => {
                const size: TerminalSize = { columns: 80, rows: 24 }
                const result = handler.encodeKeepalive(size)
                expect(result.startsWith(TTYD_PREFIX.RESIZE)).toBe(true)
            })
        })
    })

    describe('Property-Based Tests', () => {
        /**
         * Property: ttyd encodeConnect 正确性
         * 
         * 对于任意有效的终端尺寸和 authToken，
         * TtydHandler.encodeConnect SHALL 返回一个 Buffer，
         * 内容为包含 AuthToken、columns、rows 字段的有效 JSON。
         */
        describe('Property: ttyd encodeConnect correctness', () => {
            const terminalSizeArbitrary = fc.record({
                columns: fc.integer({ min: 1, max: 9999 }),
                rows: fc.integer({ min: 1, max: 9999 }),
            })

            it('encodeConnect should return a Buffer for any size', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeConnect(size)
                        return Buffer.isBuffer(result)
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeConnect should contain valid JSON', () => {
                fc.assert(
                    fc.property(
                        terminalSizeArbitrary,
                        fc.string({ maxLength: 100 }),
                        (size, token) => {
                            const result = handler.encodeConnect(size, token)
                            try {
                                const parsed = JSON.parse(result.toString())
                                return parsed.AuthToken === token
                                    && parsed.columns === size.columns
                                    && parsed.rows === size.rows
                            } catch {
                                return false
                            }
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        /**
         * Property 6: ttyd 输入编码正确性
         * 
         * 对于任意用户输入数据，TtydHandler.encodeInput SHALL 返回以 '0' 开头的字符串，
         * 且前缀之后的内容与原始数据一致。
         * 
         * **Validates: Requirements 3.1**
         */
        describe('Property 6: ttyd input encoding correctness', () => {
            it('encodeInput should return string starting with "0" prefix', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (inputData) => {
                            const originalData = Buffer.from(inputData)
                            const result = handler.encodeInput(originalData)
                            return result.startsWith(TTYD_PREFIX.INPUT)
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('encodeInput should return content after prefix matching original data', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (inputData) => {
                            const originalData = Buffer.from(inputData)
                            const result = handler.encodeInput(originalData)
                            const payload = result.slice(1)
                            return payload === inputData
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('encodeInput should return correctly formatted message for any input', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (inputData) => {
                            const originalData = Buffer.from(inputData)
                            const encoded = handler.encodeInput(originalData)
                            
                            // 检查返回值类型
                            if (typeof encoded !== 'string') return false
                            
                            // 检查以 '0' 开头
                            if (!encoded.startsWith(TTYD_PREFIX.INPUT)) return false
                            
                            // 检查内容与原始数据一致
                            const payload = encoded.slice(1)
                            return payload === inputData
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('encodeInput should handle empty data', () => {
                const emptyData = Buffer.from('')
                const result = handler.encodeInput(emptyData)
                
                expect(result.startsWith(TTYD_PREFIX.INPUT)).toBe(true)
                expect(result.slice(1)).toBe('')
            })

            it('encodeInput should handle special characters', () => {
                const specialChars = ['\n', '\r', '\t', '\\', '"', '\'', '`', '€', '中', '🎉']
                
                fc.assert(
                    fc.property(
                        fc.array(fc.constantFrom(...specialChars), { maxLength: 100 }),
                        (chars) => {
                            const inputString = chars.join('')
                            const originalData = Buffer.from(inputString)
                            const result = handler.encodeInput(originalData)
                            
                            if (!result.startsWith(TTYD_PREFIX.INPUT)) return false
                            
                            const payload = result.slice(1)
                            return payload === inputString
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('encodeInput should handle binary-like data (valid UTF-8 range)', () => {
                // ttyd 协议是基于文本的协议，encodeInput 使用 Buffer.toString() 
                // 将 Buffer 转换为字符串。对于有效的 UTF-8 数据（如 ASCII 字符），
                // 编码后的内容应与原始数据一致。
                // 注意：非 UTF-8 兼容的二进制数据不在 ttyd 协议的设计范围内。
                fc.assert(
                    fc.property(
                        fc.array(fc.integer({ min: 32, max: 126 }), { maxLength: 1000 }),
                        (byteValues) => {
                            const buffer = Buffer.from(byteValues)
                            const result = handler.encodeInput(buffer)
                            
                            // 检查以 '0' 开头
                            if (!result.startsWith(TTYD_PREFIX.INPUT)) return false
                            
                            // 检查内容一致
                            const payload = result.slice(1)
                            const inputString = buffer.toString()
                            return payload === inputString
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        /**
         * Property 7: ttyd resize 编码正确性
         * 
         * 对于任意有效的终端尺寸，TtydHandler.encodeResize 和 
         * TtydHandler.encodeKeepalive SHALL 返回以 '1' 开头的字符串，
         * 且前缀之后是包含正确 columns 和 rows 字段的有效 JSON。
         * 
         * **Validates: Requirements 3.2, 7.1**
         */
        describe('Property 7: ttyd resize encoding correctness', () => {
            // 生成有效的终端尺寸（正整数，符合 Requirement 3.2 中 columns 和 rows 为正整数的要求）
            const terminalSizeArbitrary = fc.record({
                columns: fc.integer({ min: 1, max: 9999 }),
                rows: fc.integer({ min: 1, max: 9999 }),
            })

            it('encodeResize should return string starting with "1" prefix', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeResize(size)
                        return result.startsWith(TTYD_PREFIX.RESIZE)
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeResize should return valid JSON after prefix', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeResize(size)
                        const jsonPart = result.slice(1)
                        try {
                            JSON.parse(jsonPart)
                            return true
                        } catch {
                            return false
                        }
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeResize should contain correct columns and rows in JSON', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeResize(size)
                        const jsonPart = result.slice(1)
                        const parsed = JSON.parse(jsonPart)
                        return parsed.columns === size.columns && parsed.rows === size.rows
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeKeepalive should return string starting with "1" prefix', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeKeepalive(size)
                        return result.startsWith(TTYD_PREFIX.RESIZE)
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeKeepalive should return valid JSON after prefix', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeKeepalive(size)
                        const jsonPart = result.slice(1)
                        try {
                            JSON.parse(jsonPart)
                            return true
                        } catch {
                            return false
                        }
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeKeepalive should contain correct columns and rows in JSON', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const result = handler.encodeKeepalive(size)
                        const jsonPart = result.slice(1)
                        const parsed = JSON.parse(jsonPart)
                        return parsed.columns === size.columns && parsed.rows === size.rows
                    }),
                    { numRuns: 100 }
                )
            })

            it('encodeKeepalive should be equivalent to encodeResize', () => {
                fc.assert(
                    fc.property(terminalSizeArbitrary, (size: TerminalSize) => {
                        const keepaliveResult = handler.encodeKeepalive(size)
                        const resizeResult = handler.encodeResize(size)
                        return keepaliveResult === resizeResult
                    }),
                    { numRuns: 100 }
                )
            })
        })

        /**
         * Property 10: 编码解码往返一致性
         * 
         * 对于任意用户输入数据，TtydHandler 的 encodeInput 方法
         * 返回的消息经 decode 解码后，提取的输出数据应与原始数据一致。
         * 
         * **Validates: Requirements 3.1, 4.1**
         */
        describe('Property 10: encode-decode round-trip consistency', () => {
            it('should return original data after encode-decode round-trip', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (inputData) => {
                            const originalData = Buffer.from(inputData)
                            const encoded = handler.encodeInput(originalData)
                            const decoded = handler.decode(encoded)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === inputData
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should produce correctly formatted input message', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (inputData) => {
                            const originalData = Buffer.from(inputData)
                            const encoded = handler.encodeInput(originalData)
                            
                            if (typeof encoded !== 'string') return false
                            if (!encoded.startsWith(TTYD_PREFIX.INPUT)) return false
                            
                            const payload = encoded.slice(1)
                            return payload === inputData
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should correctly decode output messages with "0" prefix', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }).filter(s => s.length > 0),
                        (payload) => {
                            const message = TTYD_PREFIX.OUTPUT + payload
                            const decoded = handler.decode(message)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === payload
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should handle empty data in round-trip', () => {
                const emptyData = Buffer.from('')
                const encoded = handler.encodeInput(emptyData)
                const decoded = handler.decode(encoded)
                
                expect(decoded).toHaveLength(1)
                expect(decoded[0].type).toBe('output')
                
                const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                expect(outputMessage.data.toString()).toBe('')
            })

            it('should handle binary-like data in round-trip', () => {
                fc.assert(
                    fc.property(
                        fc.array(fc.integer({ min: 32, max: 126 }), { maxLength: 1000 }),
                        (charCodes) => {
                            const inputString = String.fromCharCode(...charCodes)
                            const originalData = Buffer.from(inputString)
                            
                            const encoded = handler.encodeInput(originalData)
                            const decoded = handler.decode(encoded)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === inputString
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should handle Buffer input in decode', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        (inputData) => {
                            const originalData = Buffer.from(inputData)
                            const encoded = handler.encodeInput(originalData)
                            const encodedBuffer = Buffer.from(encoded)
                            const decoded = handler.decode(encodedBuffer)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === inputData
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should handle special character data in round-trip', () => {
                const specialChars = ['\n', '\r', '\t', '\\', '"', '\'', '`', '€', '中', '🎉']
                
                fc.assert(
                    fc.property(
                        fc.array(fc.constantFrom(...specialChars), { maxLength: 100 }),
                        (chars) => {
                            const inputString = chars.join('')
                            const originalData = Buffer.from(inputString)
                            
                            const encoded = handler.encodeInput(originalData)
                            const decoded = handler.decode(encoded)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === inputString
                        }
                    ),
                    { numRuns: 200 }
                )
            })
        })

        /**
         * Property 8: ttyd 解码正确性
         * 
         * 对于任意以 '0'、'1'、'2' 开头的有效消息，TtydHandler.decode SHALL
         * 正确解析消息类型并提取内容：
         * - '0' 开头 → 返回 output 类型消息
         * - '1' 开头 → 返回 title 类型消息
         * - '2' 开头（有效 JSON）→ 返回 preferences 类型消息
         * 
         * **Validates: Requirements 4.1, 4.2, 4.3**
         */
        describe('Property 8: ttyd decode correctness', () => {
            it('should correctly decode "0" prefix messages as output type', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }).filter(s => s.length > 0),
                        (payload) => {
                            const message = TTYD_PREFIX.OUTPUT + payload
                            const decoded = handler.decode(message)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === payload
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should correctly decode "1" prefix messages as title type', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }).filter(s => s.length > 0),
                        (title) => {
                            const message = TTYD_PREFIX.SET_TITLE + title
                            const decoded = handler.decode(message)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'title') return false
                            
                            const titleMessage = decoded[0] as { type: 'title'; data: string }
                            return titleMessage.data === title
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should correctly decode "2" prefix messages with valid JSON as preferences type', () => {
                // 生成有效的 JSON 对象
                const jsonArbitrary = fc.oneof(
                    fc.constant({}),
                    fc.record({
                        theme: fc.option(fc.string(), { nil: undefined }),
                        fontSize: fc.option(fc.integer({ min: 8, max: 32 }), { nil: undefined }),
                        fontFamily: fc.option(fc.string(), { nil: undefined }),
                    }),
                    fc.dictionary(fc.string(), fc.jsonValue())
                )

                fc.assert(
                    fc.property(
                        jsonArbitrary,
                        (prefs) => {
                            const jsonString = JSON.stringify(prefs)
                            const message = TTYD_PREFIX.SET_PREFERENCES + jsonString
                            const decoded = handler.decode(message)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'preferences') return false
                            
                            const prefsMessage = decoded[0] as { type: 'preferences'; data: Record<string, unknown> }
                            // 深度比较解析后的对象
                            return JSON.stringify(prefsMessage.data) === jsonString
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should decode "0" prefix messages with empty payload', () => {
                const message = TTYD_PREFIX.OUTPUT
                const decoded = handler.decode(message)
                
                expect(decoded).toHaveLength(1)
                expect(decoded[0].type).toBe('output')
                
                const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                expect(outputMessage.data.toString()).toBe('')
            })

            it('should decode "1" prefix messages with empty payload', () => {
                const message = TTYD_PREFIX.SET_TITLE
                const decoded = handler.decode(message)
                
                expect(decoded).toHaveLength(1)
                expect(decoded[0].type).toBe('title')
                
                const titleMessage = decoded[0] as { type: 'title'; data: string }
                expect(titleMessage.data).toBe('')
            })

            it('should handle Buffer input for "0" prefix messages', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        (payload) => {
                            const message = TTYD_PREFIX.OUTPUT + payload
                            const messageBuffer = Buffer.from(message)
                            const decoded = handler.decode(messageBuffer)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false
                            
                            const outputMessage = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMessage.data.toString() === payload
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should handle Buffer input for "1" prefix messages', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        (title) => {
                            const message = TTYD_PREFIX.SET_TITLE + title
                            const messageBuffer = Buffer.from(message)
                            const decoded = handler.decode(messageBuffer)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'title') return false
                            
                            const titleMessage = decoded[0] as { type: 'title'; data: string }
                            return titleMessage.data === title
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should handle Buffer input for "2" prefix messages with valid JSON', () => {
                fc.assert(
                    fc.property(
                        fc.dictionary(fc.string(), fc.jsonValue()),
                        (prefs) => {
                            const jsonString = JSON.stringify(prefs)
                            const message = TTYD_PREFIX.SET_PREFERENCES + jsonString
                            const messageBuffer = Buffer.from(message)
                            const decoded = handler.decode(messageBuffer)
                            
                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'preferences') return false
                            
                            const prefsMessage = decoded[0] as { type: 'preferences'; data: Record<string, unknown> }
                            return JSON.stringify(prefsMessage.data) === jsonString
                        }
                    ),
                    { numRuns: 200 }
                )
            })
        })

        /**
         * Property 9: ttyd 无效消息忽略
         * 
         * 对于任意不以 '0'、'1'、'2' 开头的消息，或以 '2' 开头但包含无效 JSON 的消息，
         * TtydHandler.decode SHALL 返回空数组。
         * 
         * **Validates: Requirements 4.4, 4.5**
         */
        describe('Property 9: ttyd invalid message ignoring', () => {
            it('should return empty array for messages with invalid prefixes (not 0, 1, 2)', () => {
                // 生成不以 '0', '1', '2' 开头的字符串
                const invalidPrefixArbitrary = fc.string({ minLength: 1, maxLength: 100 })
                    .filter(s => !['0', '1', '2'].includes(s[0]))

                fc.assert(
                    fc.property(
                        invalidPrefixArbitrary,
                        (message) => {
                            const decoded = handler.decode(message)
                            return decoded.length === 0
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should return empty array for "2" prefix messages with invalid JSON', () => {
                // 生成无效的 JSON 字符串
                const invalidJsonArbitrary = fc.oneof(
                    fc.constant('{ invalid json }'),
                    fc.constant('not json at all'),
                    fc.constant('{ "broken": '),
                    fc.constant('{"unclosed": "string}'),
                    fc.constant('['),
                    fc.constant('}'),
                    fc.constant('random text with special chars !@#$%^&*()'),
                    fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
                        // 确保不是有效 JSON
                        try {
                            JSON.parse(s)
                            return false
                        } catch {
                            return true
                        }
                    })
                )

                fc.assert(
                    fc.property(
                        invalidJsonArbitrary,
                        (invalidJson) => {
                            const message = TTYD_PREFIX.SET_PREFERENCES + invalidJson
                            const decoded = handler.decode(message)
                            return decoded.length === 0
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should return empty array for empty messages', () => {
                const decoded = handler.decode('')
                expect(decoded).toHaveLength(0)
            })

            it('should return empty array for Buffer empty messages', () => {
                const decoded = handler.decode(Buffer.from(''))
                expect(decoded).toHaveLength(0)
            })

            it('should return empty array for messages starting with special characters', () => {
                const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 
                                      '-', '_', '=', '+', '[', ']', '{', '}', '|', '\\', 
                                      ':', ';', '"', "'", '<', '>', ',', '.', '?', '/', 
                                      '~', '`', 'a', 'A', 'z', 'Z', '9', ' ', '\n', '\t']
                
                fc.assert(
                    fc.property(
                        fc.constantFrom(...specialChars),
                        fc.string({ maxLength: 100 }),
                        (char, suffix) => {
                            // 确保生成的消息不以 '0', '1', '2' 开头
                            if (['0', '1', '2'].includes(char)) return true
                            
                            const message = char + suffix
                            const decoded = handler.decode(message)
                            return decoded.length === 0
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should return empty array for numeric prefixes other than 0, 1, 2', () => {
                const numericPrefixes = ['3', '4', '5', '6', '7', '8', '9']
                
                fc.assert(
                    fc.property(
                        fc.constantFrom(...numericPrefixes),
                        fc.string({ maxLength: 100 }),
                        (prefix, suffix) => {
                            const message = prefix + suffix
                            const decoded = handler.decode(message)
                            return decoded.length === 0
                        }
                    ),
                    { numRuns: 200 }
                )
            })

            it('should return empty array for ArrayBuffer input with invalid prefix', () => {
                const message = 'X' + 'some payload'
                const encoder = new TextEncoder()
                const arrayBuffer = encoder.encode(message).buffer
                
                const decoded = handler.decode(arrayBuffer)
                expect(decoded).toHaveLength(0)
            })

            it('should return empty array for messages with only whitespace after prefix', () => {
                // "2" + 空格/制表符等不是有效的 JSON
                const whitespacePayloads = [' ', '  ', '\t', '\n', ' \t\n']
                
                for (const whitespace of whitespacePayloads) {
                    const message = TTYD_PREFIX.SET_PREFERENCES + whitespace
                    const decoded = handler.decode(message)
                    expect(decoded).toHaveLength(0)
                }
            })

            it('should handle all valid printable ASCII prefixes except 0, 1, 2', () => {
                // 测试所有可打印 ASCII 字符（除了 '0', '1', '2'）
                const invalidPrefixes: string[] = []
                for (let i = 32; i < 127; i++) {
                    const char = String.fromCharCode(i)
                    if (!['0', '1', '2'].includes(char)) {
                        invalidPrefixes.push(char)
                    }
                }
                
                fc.assert(
                    fc.property(
                        fc.constantFrom(...invalidPrefixes),
                        fc.string({ maxLength: 50 }),
                        (prefix, suffix) => {
                            const message = prefix + suffix
                            const decoded = handler.decode(message)
                            return decoded.length === 0
                        }
                    ),
                    { numRuns: 200 }
                )
            })
        })
    })
})
