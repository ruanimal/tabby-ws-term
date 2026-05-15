/**
 * K8sDashboardHandler 单元测试和属性测试
 * @module protocols/__tests__/k8s-dashboard.handler.spec
 */

import { describe, it, expect } from 'vitest'
import { K8sDashboardHandler } from '../k8s-dashboard.handler'
import { K8S_DASHBOARD_OP, TerminalSize } from '../types'

describe('K8sDashboardHandler', () => {
    describe('Unit Tests', () => {
        describe('protocolType', () => {
            it('should return "k8s-dashboard"', () => {
                const handler = new K8sDashboardHandler()
                expect(handler.protocolType).toBe('k8s-dashboard')
            })
        })

        describe('getWebSocketOptions', () => {
            it('should include Cookie header for gateway auth', () => {
                const handler = new K8sDashboardHandler()
                const url = 'ws://example.com?jweToken=token123&username=admin&authMode=token'
                const result = handler.getWebSocketOptions(url)
                expect(result.headers?.Cookie).toBe('authMode=token; username=admin; jweToken=token123')
            })

            it('should not set Cookie header when no auth params', () => {
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

        describe('buildAuthCookie', () => {
            it('should extract jweToken and build Cookie', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).buildAuthCookie('ws://example.com?jweToken=token123')
                expect(result).toBe('jweToken=token123')
            })

            it('should extract username and build Cookie', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).buildAuthCookie('ws://example.com?username=admin')
                expect(result).toBe('username=admin')
            })

            it('should extract authMode and build Cookie', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).buildAuthCookie('ws://example.com?authMode=token')
                expect(result).toBe('authMode=token')
            })

            it('should combine multiple auth parameters in correct order', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).buildAuthCookie('ws://example.com?jweToken=token123&username=admin&authMode=token')
                expect(result).toBe('authMode=token; username=admin; jweToken=token123')
            })

            it('should return null when no auth parameters', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).buildAuthCookie('ws://example.com')
                expect(result).toBeNull()
            })
        })

        describe('extractJweToken', () => {
            it('should extract raw jweToken from URL', () => {
                const handler = new K8sDashboardHandler()
                const jweJson = '{"protected":"eyJhbGci","encrypted_key":"abc"}'
                const url = `ws://example.com?jweToken=${encodeURIComponent(jweJson)}`
                const result = (handler as any).extractJweToken(url)
                expect(result).toBe(jweJson)
            })

            it('should return null when no jweToken param', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).extractJweToken('ws://example.com?username=admin')
                expect(result).toBeNull()
            })
        })

        describe('encodeConnect', () => {
            it('should return Buffer type', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeConnect({ columns: 80, rows: 24 })
                expect(result).toBeInstanceOf(Buffer)
            })

            it('should return bind message with empty SessionID initially', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeConnect({ columns: 80, rows: 24 })

                expect(result).not.toBeNull()
                const parsed = JSON.parse(result!.toString())
                expect(Array.isArray(parsed)).toBe(true)
                expect(parsed.length).toBe(1)

                const innerObj = JSON.parse(parsed[0])
                expect(innerObj.Op).toBe(K8S_DASHBOARD_OP.BIND)
                expect(innerObj.SessionID).toBe('')
            })

            it('should not include Data, Cols, Rows fields in bind message', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.encodeConnect({ columns: 120, rows: 40 })
                const parsed = JSON.parse(result!.toString())
                const innerObj = JSON.parse(parsed[0])

                expect(innerObj.Data).toBeUndefined()
                expect(innerObj.Cols).toBeUndefined()
                expect(innerObj.Rows).toBeUndefined()
            })
        })

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

        describe('decode', () => {
            const handler = new K8sDashboardHandler()

            describe('连接打开消息 "o"', () => {
                it('should return {type: "open"} for "o" message', () => {
                    const result = handler.decode('o')
                    expect(result).toEqual([{ type: 'open' }])
                })

                it('should return {type: "open"} for "o" as Buffer', () => {
                    const result = handler.decode(Buffer.from('o'))
                    expect(result).toEqual([{ type: 'open' }])
                })
            })

            describe('心跳消息 "h"', () => {
                it('should return empty array for "h" message', () => {
                    const result = handler.decode('h')
                    expect(result).toEqual([])
                })

                it('should return empty array for "h" as Buffer', () => {
                    const result = handler.decode(Buffer.from('h'))
                    expect(result).toEqual([])
                })
            })

            describe('数据消息 "a" 前缀', () => {
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
            })

            describe('SockJS close 帧 "c"', () => {
                it('should parse c[code,"reason"] as toast message', () => {
                    const result = handler.decode('c[2,"Unauthorized"]')
                    expect(result).toEqual([{ type: 'toast', data: 'Server closed: [2] Unauthorized' }])
                })

                it('should parse c[3000,"Go away!"] as toast message', () => {
                    const result = handler.decode('c[3000,"Go away!"]')
                    expect(result).toEqual([{ type: 'toast', data: 'Server closed: [3000] Go away!' }])
                })

                it('should handle malformed close frame as raw toast', () => {
                    const result = handler.decode('c{bad}')
                    expect(result).toEqual([{ type: 'toast', data: 'Server closed: c{bad}' }])
                })
            })

            describe('批量消息 "a" 帧', () => {
                it('should decode multiple messages in a single a frame', () => {
                    const msg = `a["{\\"Op\\":\\"stdout\\",\\"Data\\":\\"line1\\"}","{\\"Op\\":\\"stdout\\",\\"Data\\":\\"line2\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([
                        { type: 'output', data: Buffer.from('line1') },
                        { type: 'output', data: Buffer.from('line2') },
                    ])
                })

                it('should handle mixed Op types in a batch', () => {
                    const msg = `a["{\\"Op\\":\\"stdout\\",\\"Data\\":\\"output\\"}","{\\"Op\\":\\"toast\\",\\"Data\\":\\"info\\"}"]`
                    const result = handler.decode(msg)
                    expect(result).toEqual([
                        { type: 'output', data: Buffer.from('output') },
                        { type: 'toast', data: 'info' },
                    ])
                })
            })

            describe('错误处理', () => {
                it('should return empty array for invalid JSON after "a" prefix', () => {
                    const result = handler.decode('a[invalid json]')
                    expect(result).toEqual([])
                })

                it('should return empty array for empty array after "a" prefix', () => {
                    const result = handler.decode('a[]')
                    expect(result).toEqual([])
                })

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
        })

        describe('encodeKeepalive', () => {
            it('should return same format as encodeResize', () => {
                const handler = new K8sDashboardHandler()
                const size: TerminalSize = { columns: 80, rows: 24 }
                const keepaliveResult = handler.encodeKeepalive(size)
                const resizeResult = handler.encodeResize(size)
                expect(keepaliveResult).toBe(resizeResult)
            })
        })
    })

    describe('Integration Tests', () => {
        const TEST_URL = 'wss://dashboard.example.com?pod=nginx&namespace=default&authMode=token&username=admin&jweToken=eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.test-token'

        describe('典型 URL 处理', () => {
            it('getWebSocketOptions should include Cookie and Origin', () => {
                const handler = new K8sDashboardHandler()
                const result = handler.getWebSocketOptions(TEST_URL)
                expect(result.headers?.Cookie).toBeDefined()
                expect(result.headers?.Origin).toBe('wss://dashboard.example.com')
            })

            it('buildAuthCookie should extract all auth params', () => {
                const handler = new K8sDashboardHandler()
                const result = (handler as any).buildAuthCookie(TEST_URL)
                expect(result).toBe('authMode=token; username=admin; jweToken=eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.test-token')
            })
        })

        describe('API URL 协议转换', () => {
            it('should convert wss:// to https:// for API call', () => {
                const url = 'wss://192.168.10.22:8443?pod=nginx&namespace=default'
                const urlObj = new URL(url)
                const httpProtocol = urlObj.protocol === 'wss:' ? 'https:' : 'http:'
                expect(httpProtocol).toBe('https:')
                expect(`${httpProtocol}//${urlObj.host}`).toBe('https://192.168.10.22:8443')
            })

            it('should convert ws:// to http:// for API call', () => {
                const url = 'ws://192.168.10.22:8080?pod=nginx&namespace=default'
                const urlObj = new URL(url)
                const httpProtocol = urlObj.protocol === 'wss:' ? 'https:' : 'http:'
                expect(httpProtocol).toBe('http:')
                expect(`${httpProtocol}//${urlObj.host}`).toBe('http://192.168.10.22:8080')
            })
        })
    })
})
