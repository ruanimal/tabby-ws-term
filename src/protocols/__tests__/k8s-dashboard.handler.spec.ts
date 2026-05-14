/**
 * K8sDashboardHandler 单元测试和属性测试
 * @module protocols/__tests__/k8s-dashboard.handler.spec
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { K8sDashboardHandler } from '../k8s-dashboard.handler'
import { K8S_DASHBOARD_OP, TerminalSize } from '../types'

describe('K8sDashboardHandler', () => {
    describe('Unit Tests', () => {
        // ==========================================
        // 7.2 protocolType 属性单元测试
        // Validates: Requirements 8.3
        // ==========================================
        describe('protocolType', () => {
            it('should return "k8s-dashboard"', () => {
                const handler = new K8sDashboardHandler()
                expect(handler.protocolType).toBe('k8s-dashboard')
            })

            it('should always return "k8s-dashboard" regardless of constructor params', () => {
                const handler1 = new K8sDashboardHandler('ws://example.com')
                const handler2 = new K8sDashboardHandler()
                expect(handler1.protocolType).toBe('k8s-dashboard')
                expect(handler2.protocolType).toBe('k8s-dashboard')
            })
        })

        // ==========================================
        // 7.3 getWebSocketOptions 单元测试
        // Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
        // ==========================================
        describe('getWebSocketOptions', () => {
            it('should extract jweToken and build Cookie header', () => {
                const handler = new K8sDashboardHandler()
                const url = 'ws://example.com?jweToken=token123'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Cookie).toBe('jweToken=token123')
            })

            it('should extract username and build Cookie header', () => {
                const handler = new K8sDashboardHandler()
                const url = 'ws://example.com?username=admin'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Cookie).toBe('username=admin')
            })

            it('should extract authMode and build Cookie header', () => {
                const handler = new K8sDashboardHandler()
                const url = 'ws://example.com?authMode=token'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Cookie).toBe('authMode=token')
            })

            it('should combine multiple auth parameters in correct order', () => {
                const handler = new K8sDashboardHandler()
                const url = 'ws://example.com?jweToken=token123&username=admin&authMode=token'
                const result = handler.getWebSocketOptions(url)
                // 顺序应为 authMode, username, jweToken
                expect(result.headers?.Cookie).toBe('authMode=token; username=admin; jweToken=token123')
            })

            it('should handle missing auth parameters', () => {
                const handler = new K8sDashboardHandler()
                const url = 'ws://example.com'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Cookie).toBeUndefined()
            })

            it('should set Origin header from URL', () => {
                const handler = new K8sDashboardHandler()
                const url = 'wss://k8s.example.com/path?token=xxx'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Origin).toBe('wss://k8s.example.com')
            })

            it('should handle https URL with port', () => {
                const handler = new K8sDashboardHandler()
                const url = 'wss://example.com:8443/api/sockjs/123'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Origin).toBe('wss://example.com:8443')
            })
        })

        // ==========================================
        // 7.4 extractSessionId 单元测试
        // Validates: Requirements 2.1, 2.2, 2.3
        // ==========================================
        describe('extractSessionId (via encodeConnect)', () => {
            it('should extract valid 32-char hex SessionID from query param name', () => {
                const sessionId = 'abc123def456abc123def456abc12345'
                const url = `ws://example.com?${sessionId}=1`
                const handler = new K8sDashboardHandler(url)
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.SessionID).toBe(sessionId)
            })

            it('should return empty string when no 32-char hex param name exists', () => {
                const handler = new K8sDashboardHandler('ws://example.com?session=value')
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.SessionID).toBe('')
            })

            it('should return empty string when URL has no query params', () => {
                const handler = new K8sDashboardHandler('ws://example.com')
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.SessionID).toBe('')
            })

            it('should ignore non-hex characters in param name', () => {
                const handler = new K8sDashboardHandler('ws://example.com?sessionId=abc123')
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.SessionID).toBe('')
            })

            it('should extract first 32-char hex param name when multiple exist', () => {
                const sessionId1 = 'aaa123bbb456ccc789ddd012eee345ff'
                const sessionId2 = 'fff321eee654ddd987ccc210bbb765aa'
                const url = `ws://example.com?${sessionId1}=1&${sessionId2}=2`
                const handler = new K8sDashboardHandler(url)
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.SessionID).toBe(sessionId1)
            })

            it('should handle invalid URL gracefully', () => {
                const handler = new K8sDashboardHandler('not a valid url')
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.SessionID).toBe('')
            })
        })

        // ==========================================
        // 7.5 encodeConnect 单元测试
        // Validates: Requirements 3.2, 3.7
        // ==========================================
        describe('encodeConnect', () => {
            it('should return Buffer type', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                expect(result).toBeInstanceOf(Buffer)
            })

            it('should return bind message with correct format', () => {
                const sessionId = 'abc123def456abc123def456abc12345'
                const url = `ws://example.com?${sessionId}=1`
                const handler = new K8sDashboardHandler(url)
                const result = handler.encodeConnect({ columns: 80, rows: 24 })

                expect(result).not.toBeNull()
                const parsed = JSON.parse(result!.toString())
                expect(Array.isArray(parsed)).toBe(true)
                expect(parsed.length).toBe(1)

                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.BIND)
                expect(innerObj.SessionID).toBe(sessionId)
            })

            it('should return bind message with empty SessionID when not found', () => {
                const handler = new K8sDashboardHandler('ws://example.com')
                const result = handler.encodeConnect({ columns: 80, rows: 24 })

                expect(result).not.toBeNull()
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.BIND)
                expect(innerObj.SessionID).toBe('')
            })

            it('should not include Data, Cols, Rows fields in bind message', () => {
                const handler = new K8sDashboardHandler('ws://example.com')
                const result = handler.encodeConnect({ columns: 120, rows: 40 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Data).toBeUndefined()
                expect(innerObj.Cols).toBeUndefined()
                expect(innerObj.Rows).toBeUndefined()
            })
        })

        // ==========================================
        // 7.6 encodeInput 单元测试
        // Validates: Requirements 5.1, 5.2, 5.5
        // ==========================================
        describe('encodeInput', () => {
            it('should return string type', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeInput(Buffer.from('test'))
                expect(typeof result).toBe('string')
            })

            it('should encode stdin message with Op, Data, Cols, Rows', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeInput(Buffer.from('test input'))
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.STDIN)
                expect(innerObj.Data).toBe('test input')
                expect(typeof innerObj.Cols).toBe('number')
                expect(typeof innerObj.Rows).toBe('number')
            })

            it('should encode empty data correctly', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeInput(Buffer.from(''))
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.STDIN)
                expect(innerObj.Data).toBe('')
            })

            it('should escape special characters correctly', () => {
                const handler = new K8sDashboardHandler()
                const specialInput = 'hello "world"\nwith\\slash'
                const result = handler.encodeInput(Buffer.from(specialInput))
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Data).toBe(specialInput)
            })

            it('should use current terminal size after resize', () => {
                const handler = new K8sDashboardHandler()
                handler.encodeResize({ columns: 120, rows: 40 })
                const result = handler.encodeInput(Buffer.from('test'))
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Cols).toBe(120)
                expect(innerObj.Rows).toBe(40)
            })

            it('should handle Unicode characters', () => {
                const handler = new K8sDashboardHandler()
                const unicodeInput = '你好世界 🎉'
                const result = handler.encodeInput(Buffer.from(unicodeInput))
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Data).toBe(unicodeInput)
            })
        })

        // ==========================================
        // 7.7 encodeResize 单元测试
        // Validates: Requirements 7.2, 7.4
        // ==========================================
        describe('encodeResize', () => {
            it('should return string type', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeResize({ columns: 80, rows: 24 })
                expect(typeof result).toBe('string')
            })

            it('should encode resize message with Op, Cols, Rows', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeResize({ columns: 120, rows: 40 })
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.RESIZE)
                expect(innerObj.Cols).toBe(120)
                expect(innerObj.Rows).toBe(40)
            })

            it('should support zero size (Cols=0, Rows=0)', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeResize({ columns: 0, rows: 0 })
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Cols).toBe(0)
                expect(innerObj.Rows).toBe(0)
            })

            it('should support maximum size (Cols=9999, Rows=9999)', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeResize({ columns: 9999, rows: 9999 })
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Cols).toBe(9999)
                expect(innerObj.Rows).toBe(9999)
            })

            it('should not include Data field in resize message', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeResize({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Data).toBeUndefined()
            })

            it('should not include SessionID field in resize message', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeResize({ columns: 80, rows: 24 })
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.SessionID).toBeUndefined()
            })
        })

        // ==========================================
        // 7.8 decode 单元测试
        // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 6.1-6.9, 10.3, 10.4, 10.5
        // ==========================================
        describe('decode', () => {
            const handler = new K8sDashboardHandler()

            // Requirement 10.3: 连接打开消息 "o"
            describe('Requirement 10.3: 连接打开消息 "o"', () => {
                it('should return {type: "open"} for "o" message', () => {
                    const result = handler.decode('o')
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should return {type: "open"} for "o" as Buffer', () => {
                    const result = handler.decode(Buffer.from('o'))
                    expect(result).toEqual([{ type: 'open' }])
                })
            })

            // Requirements 4.1, 4.2, 4.3, 4.4: 心跳消息 "h"
            describe('Requirements 4.1, 4.2, 4.3, 4.4: 心跳消息 "h"', () => {
                it('should return empty array for "h" message', () => {
                    const result = handler.decode('h')
                    expect(result).toEqual([])
                })

                it('should return empty array for "h" as Buffer', () => {
                    const result = handler.decode(Buffer.from('h'))
                    expect(result).toEqual([])
                })

                it('should not respond to heartbeat message', () => {
                    const result = handler.decode('h')
                    expect(result.length).toBe(0)
                })
            })

            // Requirements 6.1, 6.2: 数据消息 "a" 前缀
            describe('Requirements 6.1, 6.2: 数据消息 "a" 前缀', () => {
                it('should parse stdout message correctly', () => {
                    const msg = `a["{\\"Op\\":\\"stdout\\",\\"Data\\":\\"hello world\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([{ type: 'output', data: Buffer.from('hello world') }])
                })

                it('should parse toast message correctly', () => {
                    const msg = `a["{\\"Op\\":\\"toast\\",\\"Data\\":\\"warning message\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([{ type: 'toast', data: 'warning message' }])
                })

                it('should handle stdout with special characters', () => {
                    const msg = 'a["{\\"Op\\":\\"stdout\\",\\"Data\\":\\"hello 世界\\"}"]'
                    const result = handler.decode(msg)
                    expect(result).toEqual([{ type: 'output', data: Buffer.from('hello 世界') }])
                })

                it('should handle stdout with escaped characters', () => {
                    const msg = 'a["{\\"Op\\":\\"stdout\\",\\"Data\\":\\"line1\\\\nline2\\"}"]'
                    const result = handler.decode(msg)
                    expect(result).toEqual([{ type: 'output', data: Buffer.from('line1\nline2') }])
                })
            })

            // Requirement 6.3: JSON 解析失败
            describe('Requirement 6.3: JSON 解析失败', () => {
                it('should return empty array for invalid JSON after "a" prefix', () => {
                    const result = handler.decode('a[invalid json]')
                    expect(result).toEqual([])
                })

                it('should return empty array for empty array after "a" prefix', () => {
                    const result = handler.decode('a[]')
                    expect(result).toEqual([])
                })
            })

            // Requirement 6.7: 内部 JSON 解析失败降级处理
            describe('Requirement 6.7: 内部 JSON 解析失败降级处理', () => {
                it('should return raw content as output when inner JSON parse fails', () => {
                    const msg = `a["not a valid json object"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([{ type: 'output', data: Buffer.from('not a valid json object') }])
                })
            })

            // Requirement 6.8: 缺少 Op 字段或未知 Op
            describe('Requirement 6.8: 缺少 Op 字段或未知 Op', () => {
                it('should return empty array when Op field is missing', () => {
                    const msg = `a["{\\"Data\\":\\"some data\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([])
                })

                it('should return empty array for unknown Op type', () => {
                    const msg = `a["{\\"Op\\":\\"unknown\\",\\"Data\\":\\"test\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([])
                })
            })

            // Requirement 6.9: Data 字段为 null 或 undefined
            describe('Requirement 6.9: Data 字段为 null 或 undefined', () => {
                it('should return empty array when Data is undefined', () => {
                    const msg = `a["{\\"Op\\":\\"stdout\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([])
                })

                it('should return empty array when Data is null', () => {
                    const msg = `a["{\\"Op\\":\\"stdout\\",\\"Data\\":null}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([])
                })

                it('should return empty array when Data is null for toast', () => {
                    const msg = `a["{\\"Op\\":\\"toast\\",\\"Data\\":null}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([])
                })
            })

            // Requirement 10.2: 多格式输入处理
            describe('Requirement 10.2: 多格式输入处理', () => {
                it('should handle string input', () => {
                    const result = handler.decode('o')
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should handle Buffer input', () => {
                    const result = handler.decode(Buffer.from('o'))
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should handle Uint8Array input', () => {
                    const encoder = new TextEncoder()
                    const result = handler.decode(encoder.encode('o'))
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should handle ArrayBuffer input', () => {
                    const encoder = new TextEncoder()
                    const buffer = encoder.encode('o').buffer
                    const result = handler.decode(buffer)
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should handle Buffer array input', () => {
                    const result = handler.decode([Buffer.from('o')])
                    expect(result).toEqual([{ type: 'open' }])
                })
            })

            // 其他错误处理
            describe('Error Handling', () => {
                it('should return empty array for non-"a" prefix messages that are not "o" or "h"', () => {
                    const result = handler.decode('x')
                    expect(result).toEqual([])
                })

                it('should return empty array for non-array after "a" prefix', () => {
                    const result = handler.decode('a"not an array"')
                    expect(result).toEqual([])
                })

                it('should return empty array when first element is not string', () => {
                    const result = handler.decode('a[123]')
                    expect(result).toEqual([])
                })

                it('should handle uppercase "O" as unknown message', () => {
                    const result = handler.decode('O')
                    expect(result).toEqual([])
                })

                it('should handle uppercase "H" as unknown message', () => {
                    const result = handler.decode('H')
                    expect(result).toEqual([])
                })
            })
        })

        // ==========================================
        // encodeKeepalive 单元测试
        // Validates: Requirements 7.1
        // ==========================================
        describe('encodeKeepalive', () => {
            it('should return same format as encodeResize', () => {
                const handler = new K8sDashboardHandler()
                const size: TerminalSize = { columns: 80, rows: 24 }
                const keepaliveResult = handler.encodeKeepalive(size)
                const resizeResult = handler.encodeResize(size)
                expect(keepaliveResult).toBe(resizeResult)
            })

            it('should return string type', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeKeepalive({ columns: 80, rows: 24 })
                expect(typeof result === 'string' || Buffer.isBuffer(result)).toBe(true)
            })
        })
    })

    // ==================================================
    // Property-Based Tests (8.1 - 8.11)
    // ==================================================
    describe('Property-Based Tests', () => {
        // ==========================================
        // Property 1: URL 模式识别正确性
        // Validates: Requirements 1.1
        // ==========================================
        describe('Property 1: URL 模式识别正确性', () => {
            /**
             * 测试策略：
             * 使用属性测试验证 URL 模式识别的三个规则：
             * 1. URL 路径包含 "/api/sockjs/" 时应识别为 k8s-dashboard
             * 2. URL 路径包含 "/sockjs/" 时应识别为 k8s-dashboard
             * 3. URL 查询参数名称匹配 32 位十六进制格式时应识别为 k8s-dashboard
             */

            // 生成有效的 32 位十六进制字符串
            const hex32Arbitrary = fc.tuple(
                ...Array(32).fill(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'))
            ).map(chars => chars.join(''))

            // 测试规则 1: URL 路径包含 "/api/sockjs/" 时应识别为 k8s-dashboard
            it('should identify URL with /api/sockjs/ path as k8s-dashboard pattern', () => {
                fc.assert(
                    fc.property(
                        // 生成路径前缀（可选）- 使用 URL 安全字符
                        fc.option(fc.webSegment({ minLength: 1, maxLength: 20 }), { nil: undefined }),
                        // 生成路径后缀 - 使用 URL 安全字符
                        fc.webSegment({ minLength: 1, maxLength: 50 }),
                        // 生成查询参数名（可选）- 使用 URL 安全字符
                        fc.option(fc.webQueryParameters(), { nil: undefined }),
                        (prefix, suffix, queryParam) => {
                            const prefixPart = prefix ? `/${prefix}` : ''
                            const queryPart = queryParam ? `?${queryParam}` : ''
                            const url = `ws://example.com${prefixPart}/api/sockjs/${suffix}${queryPart}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            // 测试规则 2: URL 路径包含 "/sockjs/" 时应识别为 k8s-dashboard
            it('should identify URL with /sockjs/ path as k8s-dashboard pattern', () => {
                fc.assert(
                    fc.property(
                        // 生成路径前缀（可选）- 使用 URL 安全字符
                        fc.option(fc.webSegment({ minLength: 1, maxLength: 20 }), { nil: undefined }),
                        // 生成路径后缀 - 使用 URL 安全字符
                        fc.webSegment({ minLength: 1, maxLength: 50 }),
                        // 生成查询参数名（可选）- 使用 URL 安全字符
                        fc.option(fc.webQueryParameters(), { nil: undefined }),
                        (prefix, suffix, queryParam) => {
                            const prefixPart = prefix ? `/${prefix}` : ''
                            const queryPart = queryParam ? `?${queryParam}` : ''
                            const url = `ws://example.com${prefixPart}/sockjs/${suffix}${queryPart}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            // 测试规则 3: URL 查询参数名称匹配 32 位十六进制格式时应识别为 k8s-dashboard
            it('should identify URL with 32-char hex query param name as k8s-dashboard pattern', () => {
                fc.assert(
                    fc.property(
                        // 生成有效的 32 位十六进制 SessionID 作为查询参数名
                        hex32Arbitrary,
                        // 生成查询参数值 - 使用 URL 安全字符
                        fc.webSegment({ minLength: 1, maxLength: 50 }),
                        // 生成路径（可选）- 使用 URL 安全字符
                        fc.option(fc.webSegment({ minLength: 1, maxLength: 30 }), { nil: undefined }),
                        (sessionId, paramValue, path) => {
                            const pathPart = path ? `/${path}` : ''
                            const url = `ws://example.com${pathPart}?${sessionId}=${paramValue}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            // 测试规则 1 和规则 3 的组合
            it('should identify URL with both /api/sockjs/ path and 32-char hex param as k8s-dashboard pattern', () => {
                fc.assert(
                    fc.property(
                        hex32Arbitrary,
                        fc.webSegment({ minLength: 1, maxLength: 20 }),
                        fc.webSegment({ minLength: 1, maxLength: 50 }),
                        (sessionId, pathSuffix, paramValue) => {
                            const url = `ws://example.com/api/sockjs/${pathSuffix}?${sessionId}=${paramValue}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            // 测试非匹配 URL 应该返回 false
            it('should NOT identify URL without k8s-dashboard patterns', () => {
                fc.assert(
                    fc.property(
                        // 生成不包含 sockjs 的路径 - 使用 URL 安全字符
                        fc.webSegment({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('sockjs')),
                        // 生成非 32 位十六进制的查询参数名 - 使用 URL 安全字符
                        fc.webSegment({ minLength: 1, maxLength: 30 }).filter(s => !/^[a-f0-9]{32}$/.test(s)),
                        fc.webSegment({ minLength: 1, maxLength: 20 }),
                        (path, paramName, paramValue) => {
                            const url = `ws://example.com/${path}?${paramName}=${paramValue}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === false
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            // 测试不同的协议和主机
            it('should identify k8s-dashboard pattern regardless of protocol and host', () => {
                fc.assert(
                    fc.property(
                        fc.constantFrom('ws://', 'wss://'),
                        // 使用 URL 安全的主机名
                        fc.webAuthority(),
                        fc.constantFrom('/api/sockjs/', '/sockjs/'),
                        fc.webSegment({ minLength: 1, maxLength: 20 }),
                        (protocol, host, pathPattern, suffix) => {
                            const url = `${protocol}${host}${pathPattern}${suffix}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            // 测试带端口的 URL
            it('should identify k8s-dashboard pattern with port number', () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 1, max: 65535 }),
                        fc.webSegment({ minLength: 1, maxLength: 20 }),
                        (port, suffix) => {
                            const url = `ws://example.com:${port}/api/sockjs/${suffix}`
                            const handler = new K8sDashboardHandler()
                            return handler.canHandle(url) === true
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 2-3: SessionID 提取正确性
        // Validates: Requirements 2.1, 2.2, 2.3
        // ==========================================
        describe('Property 2-3: SessionID 提取正确性', () => {
            // 生成有效的 32 位十六进制字符串
            const hex32Arbitrary = fc.tuple(
                ...Array(32).fill(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'))
            ).map(chars => chars.join(''))

            it('should extract valid 32-char hex SessionID from query param name', () => {
                fc.assert(
                    fc.property(
                        hex32Arbitrary,
                        fc.string({ maxLength: 20 }),
                        (sessionId, paramValue) => {
                            const url = `ws://example.com?${sessionId}=${paramValue}`
                            const handler = new K8sDashboardHandler(url)
                            const result = handler.encodeConnect({ columns: 80, rows: 24 })
                            const parsed = JSON.parse(result!.toString())
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.SessionID === sessionId
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should return empty string for non-32-char-hex param names', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !/^[a-f0-9]{32}$/.test(s)),
                        (paramName) => {
                            const url = `ws://example.com?${paramName}=value`
                            const handler = new K8sDashboardHandler(url)
                            const result = handler.encodeConnect({ columns: 80, rows: 24 })
                            const parsed = JSON.parse(result!.toString())
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.SessionID === ''
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should handle URLs without query params', () => {
                fc.assert(
                    fc.property(
                        fc.webUrl().filter(url => !url.includes('?')),
                        (baseUrl) => {
                            const url = baseUrl.startsWith('http') ? baseUrl.replace(/^http/, 'ws') : `ws://${baseUrl}`
                            const handler = new K8sDashboardHandler(url)
                            const result = handler.encodeConnect({ columns: 80, rows: 24 })
                            const parsed = JSON.parse(result!.toString())
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.SessionID === ''
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 4: bind 消息编码正确性
        // Validates: Requirements 3.2
        // ==========================================
        describe('Property 4: bind 消息编码正确性', () => {
            const hex32Arbitrary = fc.tuple(
                ...Array(32).fill(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'))
            ).map(chars => chars.join(''))

            it('should produce valid JSON array format for bind message', () => {
                fc.assert(
                    fc.property(
                        hex32Arbitrary,
                        (sessionId) => {
                            const url = `ws://example.com?${sessionId}=1`
                            const handler = new K8sDashboardHandler(url)
                            const result = handler.encodeConnect({ columns: 80, rows: 24 })

                            if (!result) return false

                            // 验证返回值是 Buffer
                            if (!Buffer.isBuffer(result)) return false

                            // 解析外层 JSON
                            const parsed = JSON.parse(result.toString())
                            if (!Array.isArray(parsed) || parsed.length !== 1) return false

                            // 解析内层 JSON
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.Op === K8S_DASHBOARD_OP.BIND && innerObj.SessionID === sessionId
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should not include Data, Cols, Rows fields in bind message', () => {
                fc.assert(
                    fc.property(
                        hex32Arbitrary,
                        fc.integer({ min: 1, max: 9999 }),
                        fc.integer({ min: 1, max: 9999 }),
                        (sessionId, cols, rows) => {
                            const url = `ws://example.com?${sessionId}=1`
                            const handler = new K8sDashboardHandler(url)
                            const result = handler.encodeConnect({ columns: cols, rows: rows })
                            const parsed = JSON.parse(result!.toString())
                            const innerObj = JSON.parse(parsed[0])

                            return innerObj.Data === undefined
                                && innerObj.Cols === undefined
                                && innerObj.Rows === undefined
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 5: resize 消息编码正确性
        // Validates: Requirements 3.4, 7.2
        // ==========================================
        describe('Property 5: resize 消息编码正确性', () => {
            const terminalSizeArbitrary = fc.record({
                columns: fc.integer({ min: 0, max: 9999 }),
                rows: fc.integer({ min: 0, max: 9999 }),
            })

            it('should produce valid JSON array format for resize message', () => {
                fc.assert(
                    fc.property(
                        terminalSizeArbitrary,
                        (size) => {
                            const handler = new K8sDashboardHandler()
                            const result = handler.encodeResize(size)

                            // 验证返回值是字符串
                            if (typeof result !== 'string') return false

                            // 解析外层 JSON
                            const parsed = JSON.parse(result)
                            if (!Array.isArray(parsed) || parsed.length !== 1) return false

                            // 解析内层 JSON
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.Op === K8S_DASHBOARD_OP.RESIZE
                                && innerObj.Cols === size.columns
                                && innerObj.Rows === size.rows
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should not include Data or SessionID fields in resize message', () => {
                fc.assert(
                    fc.property(
                        terminalSizeArbitrary,
                        (size) => {
                            const handler = new K8sDashboardHandler()
                            const result = handler.encodeResize(size)
                            const parsed = JSON.parse(result)
                            const innerObj = JSON.parse(parsed[0])

                            return innerObj.Data === undefined && innerObj.SessionID === undefined
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 6: stdin 消息编码正确性
        // Validates: Requirements 5.1, 5.2
        // ==========================================
        describe('Property 6: stdin 消息编码正确性', () => {
            const terminalSizeArbitrary = fc.record({
                columns: fc.integer({ min: 1, max: 999 }),
                rows: fc.integer({ min: 1, max: 999 }),
            })

            it('should produce valid JSON array format for stdin message', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        terminalSizeArbitrary,
                        (inputData, size) => {
                            const handler = new K8sDashboardHandler()
                            handler.encodeResize(size) // 设置终端尺寸
                            const result = handler.encodeInput(Buffer.from(inputData))

                            // 验证返回值是字符串
                            if (typeof result !== 'string') return false

                            // 解析外层 JSON
                            const parsed = JSON.parse(result)
                            if (!Array.isArray(parsed) || parsed.length !== 1) return false

                            // 解析内层 JSON
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.Op === K8S_DASHBOARD_OP.STDIN
                                && innerObj.Data === inputData
                                && innerObj.Cols === size.columns
                                && innerObj.Rows === size.rows
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should correctly encode special characters', () => {
                const specialChars = ['"', '\\', '\n', '\t', '\r', '{', '}', '[', ']']

                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        fc.constantFrom(...specialChars),
                        fc.string({ maxLength: 1000 }),
                        terminalSizeArbitrary,
                        (prefix, special, suffix, size) => {
                            const inputData = prefix + special + suffix
                            const handler = new K8sDashboardHandler()
                            handler.encodeResize(size)
                            const result = handler.encodeInput(Buffer.from(inputData))

                            const parsed = JSON.parse(result)
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.Data === inputData
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should handle empty input data', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeInput(Buffer.from(''))
                const parsed = JSON.parse(result)
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.STDIN)
                expect(innerObj.Data).toBe('')
            })
        })

        // ==========================================
        // Property 7: 消息编码往返一致性
        // Validates: Requirements 10.6
        // ==========================================
        describe('Property 7: 消息编码往返一致性', () => {
            it('should maintain Op field after encode-decode round-trip for stdin', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (inputData) => {
                            const handler = new K8sDashboardHandler()
                            const encoded = handler.encodeInput(Buffer.from(inputData))

                            // 构造对应的 stdout 消息
                            const parsed = JSON.parse(encoded)
                            const innerObj = JSON.parse(parsed[0])
                            // 使用 JSON.stringify 正确转义内部 JSON
                            const stdoutMsg = `a[${JSON.stringify(JSON.stringify({ Op: K8S_DASHBOARD_OP.STDOUT, Data: innerObj.Data }))}]`

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

            it('should maintain Cols and Rows fields after encode-decode round-trip for resize', () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 0, max: 9999 }),
                        fc.integer({ min: 0, max: 9999 }),
                        (cols, rows) => {
                            const handler = new K8sDashboardHandler()
                            const size: TerminalSize = { columns: cols, rows: rows }
                            const encoded = handler.encodeResize(size)

                            const parsed = JSON.parse(encoded)
                            const innerObj = JSON.parse(parsed[0])
                            return innerObj.Op === K8S_DASHBOARD_OP.RESIZE
                                && innerObj.Cols === cols
                                && innerObj.Rows === rows
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 8-9: stdout/toast 消息解码正确性
        // Validates: Requirements 6.1, 6.2, 6.5, 6.6
        // ==========================================
        describe('Property 8-9: stdout/toast 消息解码正确性', () => {
            it('should correctly decode stdout messages with any data', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (dataContent) => {
                            const handler = new K8sDashboardHandler()
                            // 使用 JSON.stringify 正确转义内部 JSON
                            const msg = `a[${JSON.stringify(JSON.stringify({ Op: K8S_DASHBOARD_OP.STDOUT, Data: dataContent }))}]`
                            const decoded = handler.decode(msg)

                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'output') return false

                            const outputMsg = decoded[0] as { type: 'output'; data: Buffer }
                            return outputMsg.data.toString() === dataContent
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should correctly decode toast messages with any data', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 10000 }),
                        (dataContent) => {
                            const handler = new K8sDashboardHandler()
                            // 使用 JSON.stringify 正确转义内部 JSON
                            const msg = `a[${JSON.stringify(JSON.stringify({ Op: K8S_DASHBOARD_OP.TOAST, Data: dataContent }))}]`
                            const decoded = handler.decode(msg)

                            if (decoded.length !== 1) return false
                            if (decoded[0].type !== 'toast') return false

                            const toastMsg = decoded[0] as { type: 'toast'; data: string }
                            return toastMsg.data === dataContent
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should handle special characters in stdout data', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        fc.constantFrom('"', '\\', '\n', '\t', '\r'),
                        fc.string({ maxLength: 1000 }),
                        (prefix, special, suffix) => {
                            const dataContent = prefix + special + suffix
                            const handler = new K8sDashboardHandler()
                            // 使用 JSON.stringify 正确转义内部 JSON
                            const msg = `a[${JSON.stringify(JSON.stringify({ Op: K8S_DASHBOARD_OP.STDOUT, Data: dataContent }))}]`
                            const decoded = handler.decode(msg)

                            if (decoded.length !== 1 || decoded[0].type !== 'output') return false
                            return (decoded[0] as { type: 'output'; data: Buffer }).data.toString() === dataContent
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 10-11: 心跳和连接打开消息处理
        // Validates: Requirements 4.1, 4.2, 4.3, 10.3
        // ==========================================
        describe('Property 10-11: 心跳和连接打开消息处理', () => {
            // Property 10: 心跳消息忽略
            // Validates: Requirements 4.1, 4.2, 4.3
            describe('Property 10: 心跳消息忽略', () => {
                it('should return empty array for exact "h" message (string)', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('h')).toEqual([])
                })

                it('should return empty array for "h" as Buffer', () => {
                    const handler = new K8sDashboardHandler()
                    const result = handler.decode(Buffer.from('h'))
                    expect(result).toEqual([])
                })

                it('should return empty array for "h" as Uint8Array', () => {
                    const handler = new K8sDashboardHandler()
                    const encoder = new TextEncoder()
                    const result = handler.decode(encoder.encode('h'))
                    expect(result).toEqual([])
                })

                it('should return empty array for "h" as ArrayBuffer', () => {
                    const handler = new K8sDashboardHandler()
                    const encoder = new TextEncoder()
                    const result = handler.decode(encoder.encode('h').buffer)
                    expect(result).toEqual([])
                })

                it('should return empty array for "h" regardless of input format', () => {
                    fc.assert(
                        fc.property(
                            fc.constantFrom('string', 'Buffer', 'Uint8Array', 'ArrayBuffer'),
                            (format) => {
                                const handler = new K8sDashboardHandler()
                                let result
                                switch (format) {
                                    case 'string':
                                        result = handler.decode('h')
                                        break
                                    case 'Buffer':
                                        result = handler.decode(Buffer.from('h'))
                                        break
                                    case 'Uint8Array':
                                        result = handler.decode(new TextEncoder().encode('h'))
                                        break
                                    case 'ArrayBuffer':
                                        result = handler.decode(new TextEncoder().encode('h').buffer)
                                        break
                                }
                                return result.length === 0
                            }
                        ),
                        { numRuns: 20 }
                    )
                })

                it('should NOT treat uppercase "H" as heartbeat message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('H')).toEqual([])
                })

                it('should NOT treat "h " (with trailing space) as heartbeat message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('h ')).toEqual([])
                })

                it('should NOT treat " h" (with leading space) as heartbeat message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode(' h')).toEqual([])
                })

                it('should NOT throw exception during heartbeat processing', () => {
                    const handler = new K8sDashboardHandler()
                    // 多次解码心跳消息，确保不抛出异常
                    for (let i = 0; i < 10; i++) {
                        expect(() => handler.decode('h')).not.toThrow()
                        expect(handler.decode('h')).toEqual([])
                    }
                })
            })

            // Property 11: 连接打开消息识别
            // Validates: Requirements 10.3
            describe('Property 11: 连接打开消息识别', () => {
                it('should return {type: "open"} for exact "o" message (string)', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('o')).toEqual([{ type: 'open' }])
                })

                it('should return {type: "open"} for "o" as Buffer', () => {
                    const handler = new K8sDashboardHandler()
                    const result = handler.decode(Buffer.from('o'))
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should return {type: "open"} for "o" as Uint8Array', () => {
                    const handler = new K8sDashboardHandler()
                    const encoder = new TextEncoder()
                    const result = handler.decode(encoder.encode('o'))
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should return {type: "open"} for "o" as ArrayBuffer', () => {
                    const handler = new K8sDashboardHandler()
                    const encoder = new TextEncoder()
                    const result = handler.decode(encoder.encode('o').buffer)
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should return {type: "open"} for "o" regardless of input format', () => {
                    fc.assert(
                        fc.property(
                            fc.constantFrom('string', 'Buffer', 'Uint8Array', 'ArrayBuffer'),
                            (format) => {
                                const handler = new K8sDashboardHandler()
                                let result
                                switch (format) {
                                    case 'string':
                                        result = handler.decode('o')
                                        break
                                    case 'Buffer':
                                        result = handler.decode(Buffer.from('o'))
                                        break
                                    case 'Uint8Array':
                                        result = handler.decode(new TextEncoder().encode('o'))
                                        break
                                    case 'ArrayBuffer':
                                        result = handler.decode(new TextEncoder().encode('o').buffer)
                                        break
                                }
                                return result.length === 1 && result[0].type === 'open'
                            }
                        ),
                        { numRuns: 20 }
                    )
                })

                it('should NOT treat uppercase "O" as open message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('O')).toEqual([])
                })

                it('should NOT treat "o " (with trailing space) as open message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('o ')).toEqual([])
                })

                it('should NOT treat " o" (with leading space) as open message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode(' o')).toEqual([])
                })

                it('should NOT treat "ho" or "oh" as heartbeat or open message', () => {
                    const handler = new K8sDashboardHandler()
                    expect(handler.decode('ho')).toEqual([])
                    expect(handler.decode('oh')).toEqual([])
                })

                it('should correctly handle alternating "o" and "h" messages', () => {
                    const handler = new K8sDashboardHandler()
                    // 模拟实际场景：先收到 "o"，然后收到多个 "h"
                    expect(handler.decode('o')).toEqual([{ type: 'open' }])
                    expect(handler.decode('h')).toEqual([])
                    expect(handler.decode('h')).toEqual([])
                    expect(handler.decode('h')).toEqual([])
                })
            })
        })

        // ==========================================
        // Property 12: 错误消息处理
        // Validates: Requirements 6.3, 6.7, 6.8, 6.9
        // ==========================================
        describe('Property 12: 错误消息处理', () => {
            it('should return empty array for invalid JSON after "a" prefix', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
                            try { JSON.parse(`[${s}]`); return false } catch { return true }
                        }),
                        (invalidJson) => {
                            const handler = new K8sDashboardHandler()
                            const result = handler.decode(`a[${invalidJson}]`)
                            return result.length === 0
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should return raw content for invalid inner JSON', () => {
                // 生成无效的 JSON 字符串（不是有效的 JSON 对象）
                const invalidJsonExamples = [
                    '{broken',
                    '[notclosed',
                    'notjson',
                    '{"missing": }',
                ]

                for (const invalidInnerJson of invalidJsonExamples) {
                    const handler = new K8sDashboardHandler()
                    // 构造消息：a["<invalidJson>"]
                    const msg = `a${JSON.stringify([invalidInnerJson])}`
                    const result = handler.decode(msg)
                    // 降级处理：将原始内容作为输出返回
                    expect(result.length).toBe(1)
                    expect(result[0].type).toBe('output')
                    expect((result[0] as { type: 'output'; data: Buffer }).data.toString()).toBe(invalidInnerJson)
                }
            })

            it('should return empty array for missing Op field', () => {
                fc.assert(
                    fc.property(
                        fc.dictionary(fc.string(), fc.jsonValue()).filter(obj => !('Op' in obj)),
                        (obj) => {
                            const handler = new K8sDashboardHandler()
                            const msg = `a["${JSON.stringify(obj)}"]`
                            const result = handler.decode(msg)
                            return result.length === 0
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should return empty array for unknown Op types', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
                            !['stdin', 'stdout', 'resize', 'bind', 'toast'].includes(s)
                        ),
                        fc.string({ maxLength: 100 }),
                        (op, data) => {
                            const handler = new K8sDashboardHandler()
                            const msg = `a["${JSON.stringify({ Op: op, Data: data })}"]`
                            const result = handler.decode(msg)
                            return result.length === 0
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should return empty array when Data is null', () => {
                fc.assert(
                    fc.property(
                        fc.constantFrom(K8S_DASHBOARD_OP.STDOUT, K8S_DASHBOARD_OP.TOAST),
                        (op) => {
                            const handler = new K8sDashboardHandler()
                            const msg = `a["${JSON.stringify({ Op: op, Data: null })}"]`
                            const result = handler.decode(msg)
                            return result.length === 0
                        }
                    ),
                    { numRuns: 20 }
                )
            })
        })

        // ==========================================
        // Property 13: 多格式输入解码一致性
        // Validates: Requirements 10.2
        // ==========================================
        describe('Property 13: 多格式输入解码一致性', () => {
            it('should produce same result for string and Buffer input', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        (msg) => {
                            const handler = new K8sDashboardHandler()
                            const stringResult = handler.decode(msg)
                            const bufferResult = handler.decode(Buffer.from(msg))

                            if (stringResult.length !== bufferResult.length) return false

                            for (let i = 0; i < stringResult.length; i++) {
                                if (stringResult[i].type !== bufferResult[i].type) return false
                            }

                            return true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should produce same result for string and Uint8Array input', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        (msg) => {
                            const handler = new K8sDashboardHandler()
                            const encoder = new TextEncoder()
                            const stringResult = handler.decode(msg)
                            const uint8ArrayResult = handler.decode(encoder.encode(msg))

                            if (stringResult.length !== uint8ArrayResult.length) return false

                            for (let i = 0; i < stringResult.length; i++) {
                                if (stringResult[i].type !== uint8ArrayResult[i].type) return false
                            }

                            return true
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should produce same result for string and ArrayBuffer input', () => {
                fc.assert(
                    fc.property(
                        fc.string({ maxLength: 1000 }),
                        (msg) => {
                            const handler = new K8sDashboardHandler()
                            const encoder = new TextEncoder()
                            const stringResult = handler.decode(msg)
                            const arrayBufferResult = handler.decode(encoder.encode(msg).buffer)

                            if (stringResult.length !== arrayBufferResult.length) return false

                            for (let i = 0; i < stringResult.length; i++) {
                                if (stringResult[i].type !== arrayBufferResult[i].type) return false
                            }

                            return true
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        // ==========================================
        // Property 14: 认证参数提取正确性
        // Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
        // ==========================================
        describe('Property 14: 认证参数提取正确性', () => {
            it('should correctly extract jweToken parameter', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes(';')),
                        (token) => {
                            const handler = new K8sDashboardHandler()
                            const url = `ws://example.com?jweToken=${encodeURIComponent(token)}`
                            const result = handler.getWebSocketOptions(url)
                            return result.headers?.Cookie === `jweToken=${token}`
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should correctly extract username parameter', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(';')),
                        (username) => {
                            const handler = new K8sDashboardHandler()
                            const url = `ws://example.com?username=${encodeURIComponent(username)}`
                            const result = handler.getWebSocketOptions(url)
                            return result.headers?.Cookie === `username=${username}`
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should correctly extract authMode parameter', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(';')),
                        (authMode) => {
                            const handler = new K8sDashboardHandler()
                            const url = `ws://example.com?authMode=${encodeURIComponent(authMode)}`
                            const result = handler.getWebSocketOptions(url)
                            return result.headers?.Cookie === `authMode=${authMode}`
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should combine multiple auth parameters in correct order', () => {
                fc.assert(
                    fc.property(
                        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(';')),
                        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(';')),
                        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(';')),
                        (authMode, username, jweToken) => {
                            const handler = new K8sDashboardHandler()
                            const url = `ws://example.com?authMode=${encodeURIComponent(authMode)}&username=${encodeURIComponent(username)}&jweToken=${encodeURIComponent(jweToken)}`
                            const result = handler.getWebSocketOptions(url)
                            const expectedCookie = `authMode=${authMode}; username=${username}; jweToken=${jweToken}`
                            return result.headers?.Cookie === expectedCookie
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should always set Origin header', () => {
                fc.assert(
                    fc.property(
                        fc.webUrl(),
                        (baseUrl) => {
                            const url = baseUrl.startsWith('http') ? baseUrl.replace(/^http/, 'ws') : `ws://${baseUrl}`
                            const handler = new K8sDashboardHandler()
                            const result = handler.getWebSocketOptions(url)
                            return typeof result.headers?.Origin === 'string'
                        }
                    ),
                    { numRuns: 100 }
                )
            })

            it('should not set Cookie header when no auth parameters', () => {
                fc.assert(
                    fc.property(
                        fc.webUrl().filter(url => {
                            const params = new URL(url.startsWith('http') ? url : `https://${url}`).searchParams
                            return !params.has('jweToken') && !params.has('username') && !params.has('authMode')
                        }),
                        (baseUrl) => {
                            const url = baseUrl.startsWith('http') ? baseUrl.replace(/^http/, 'ws') : `ws://${baseUrl}`
                            const handler = new K8sDashboardHandler()
                            const result = handler.getWebSocketOptions(url)
                            return result.headers?.Cookie === undefined
                        }
                    ),
                    { numRuns: 50 }
                )
            })
        })
    })
})
