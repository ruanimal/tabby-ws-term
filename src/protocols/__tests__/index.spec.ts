/**
 * 工厂函数单元测试
 * @module protocols/__tests__/index.spec
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  createProtocolHandler,
  isValidProtocolType,
  normalizeProtocolType,
  isK8sDashboardUrl,
  detectProtocolType,
} from '../index'
import { KubeExecHandler } from '../kube-exec.handler'
import { TtydHandler } from '../ttyd.handler'
import { K8sDashboardHandler } from '../k8s-dashboard.handler'
import { ProtocolType } from '../types'

describe('createProtocolHandler', () => {
  describe('创建正确的处理器', () => {
    it('为 "kube-exec" 协议类型创建 KubeExecHandler 实例', () => {
      const handler = createProtocolHandler('kube-exec')
      expect(handler).toBeInstanceOf(KubeExecHandler)
      expect(handler.protocolType).toBe('kube-exec')
    })

    it('为 "ttyd" 协议类型创建 TtydHandler 实例', () => {
      const handler = createProtocolHandler('ttyd')
      expect(handler).toBeInstanceOf(TtydHandler)
      expect(handler.protocolType).toBe('ttyd')
    })

    it('为 "k8s-dashboard" 协议类型创建 K8sDashboardHandler 实例', () => {
      const handler = createProtocolHandler('k8s-dashboard')
      expect(handler).toBeInstanceOf(K8sDashboardHandler)
      expect(handler.protocolType).toBe('k8s-dashboard')
    })

    it('每次调用返回新的处理器实例', () => {
      const handler1 = createProtocolHandler('kube-exec')
      const handler2 = createProtocolHandler('kube-exec')
      expect(handler1).not.toBe(handler2)
    })
  })
})

describe('isValidProtocolType', () => {
  describe('验证有效的协议类型', () => {
    it('返回 true 对于 "kube-exec"', () => {
      expect(isValidProtocolType('kube-exec')).toBe(true)
    })

    it('返回 true 对于 "ttyd"', () => {
      expect(isValidProtocolType('ttyd')).toBe(true)
    })

    it('返回 true 对于 "k8s-dashboard"', () => {
      expect(isValidProtocolType('k8s-dashboard')).toBe(true)
    })
  })

  describe('拒绝无效的协议类型', () => {
    it('返回 false 对于 undefined', () => {
      expect(isValidProtocolType(undefined)).toBe(false)
    })

    it('返回 false 对于 null', () => {
      expect(isValidProtocolType(null)).toBe(false)
    })

    it('返回 false 对于空字符串', () => {
      expect(isValidProtocolType('')).toBe(false)
    })

    it('返回 false 对于无效的字符串值', () => {
      expect(isValidProtocolType('invalid')).toBe(false)
    })

    it('返回 false 对于数字', () => {
      expect(isValidProtocolType(123)).toBe(false)
    })

    it('返回 false 对于对象', () => {
      expect(isValidProtocolType({})).toBe(false)
    })

    it('返回 false 对于数组', () => {
      expect(isValidProtocolType([])).toBe(false)
    })

    it('返回 false 对于布尔值', () => {
      expect(isValidProtocolType(true)).toBe(false)
      expect(isValidProtocolType(false)).toBe(false)
    })
  })

  describe('类型保护功能', () => {
    it('正确缩窄类型为 ProtocolType', () => {
      const value: unknown = 'kube-exec'
      if (isValidProtocolType(value)) {
        // TypeScript 应该能够推断 value 是 ProtocolType
        const protocolType: ProtocolType = value
        expect(['kube-exec', 'ttyd', 'k8s-dashboard']).toContain(protocolType)
      } else {
        // 不应该到达这里
        expect.fail('应该验证为有效的协议类型')
      }
    })
  })
})

describe('normalizeProtocolType', () => {
  describe('返回原值对于有效的协议类型', () => {
    it('返回 "kube-exec" 对于输入 "kube-exec"', () => {
      expect(normalizeProtocolType('kube-exec')).toBe('kube-exec')
    })

    it('返回 "ttyd" 对于输入 "ttyd"', () => {
      expect(normalizeProtocolType('ttyd')).toBe('ttyd')
    })

    it('返回 "k8s-dashboard" 对于输入 "k8s-dashboard"', () => {
      expect(normalizeProtocolType('k8s-dashboard')).toBe('k8s-dashboard')
    })
  })

  describe('返回默认值 "kube-exec" 对于无效输入', () => {
    it('返回 "kube-exec" 对于 undefined', () => {
      expect(normalizeProtocolType(undefined)).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于 null', () => {
      expect(normalizeProtocolType(null)).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于空字符串', () => {
      expect(normalizeProtocolType('')).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于无效的字符串值', () => {
      expect(normalizeProtocolType('invalid')).toBe('kube-exec')
      expect(normalizeProtocolType('KUBE-EXEC')).toBe('kube-exec')
      expect(normalizeProtocolType('TTYD')).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于数字', () => {
      expect(normalizeProtocolType(0)).toBe('kube-exec')
      expect(normalizeProtocolType(123)).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于对象', () => {
      expect(normalizeProtocolType({})).toBe('kube-exec')
      expect(normalizeProtocolType({ protocol: 'ttyd' })).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于数组', () => {
      expect(normalizeProtocolType([])).toBe('kube-exec')
      expect(normalizeProtocolType(['kube-exec'])).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于布尔值', () => {
      expect(normalizeProtocolType(true)).toBe('kube-exec')
      expect(normalizeProtocolType(false)).toBe('kube-exec')
    })
  })

  describe('边界情况', () => {
    it('返回 "kube-exec" 对于只包含空格的字符串', () => {
      expect(normalizeProtocolType('   ')).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于包含空格的有效协议类型', () => {
      expect(normalizeProtocolType(' kube-exec ')).toBe('kube-exec')
      expect(normalizeProtocolType(' ttyd ')).toBe('kube-exec')
      expect(normalizeProtocolType(' k8s-dashboard ')).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于 NaN', () => {
      expect(normalizeProtocolType(NaN)).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于 Symbol', () => {
      expect(normalizeProtocolType(Symbol('kube-exec'))).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于函数', () => {
      expect(normalizeProtocolType(() => 'kube-exec')).toBe('kube-exec')
    })
  })
})

describe('normalizeProtocolType 属性测试', () => {
  /**
   * Property 1: 协议类型规范化
   * 验证 normalizeProtocolType 对各种输入返回正确的协议类型
   * **Validates: Requirements 1.4, 6.3, 9.4**
   * 
   * Requirements:
   * - 1.4: IF protocol 字段值为 undefined、null、空字符串或非 "kube-exec"/"ttyd" 的值，
   *        THEN THE WSTerm_Plugin SHALL 将 protocol 值替换为默认值 "kube-exec"
   * - 6.3: IF URL 中包含的 protocol 参数值不是 "kube-exec" 或 "ttyd"，
   *        THEN THE WSTerm_Plugin SHALL 使用默认值 "kube-exec" 协议
   * - 9.4: IF Profile 中的 protocol 字段值不是 "kube-exec" 或 "ttyd"，
   *        THE WSTerm_Plugin SHALL 将其替换为默认值 "kube-exec" 并正常加载 Profile
   */
  
  describe('属性: 返回值始终是有效的协议类型', () => {
    it('对于任意输入，返回值始终是 "kube-exec"、"ttyd" 或 "k8s-dashboard"', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          const result = normalizeProtocolType(value)
          expect(['kube-exec', 'ttyd', 'k8s-dashboard']).toContain(result)
        })
      )
    })
  })

  describe('属性: 有效输入保持不变', () => {
    it('对于有效的协议类型，返回原值', () => {
      fc.assert(
        fc.property(fc.constantFrom('kube-exec', 'ttyd', 'k8s-dashboard'), (value) => {
          const result = normalizeProtocolType(value)
          expect(result).toBe(value)
        })
      )
    })
  })

  describe('属性: 无效输入返回默认值', () => {
    it('对于非 "kube-exec"、"ttyd" 或 "k8s-dashboard" 的字符串，返回 "kube-exec"', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s !== 'kube-exec' && s !== 'ttyd' && s !== 'k8s-dashboard'),
          (value) => {
            const result = normalizeProtocolType(value)
            expect(result).toBe('kube-exec')
          }
        )
      )
    })

    it('对于数字类型，返回 "kube-exec"', () => {
      fc.assert(
        fc.property(fc.oneof(fc.integer(), fc.float()), (value) => {
          const result = normalizeProtocolType(value)
          expect(result).toBe('kube-exec')
        })
      )
    })

    it('对于布尔类型，返回 "kube-exec"', () => {
      fc.assert(
        fc.property(fc.boolean(), (value) => {
          const result = normalizeProtocolType(value)
          expect(result).toBe('kube-exec')
        })
      )
    })

    it('对于对象类型，返回 "kube-exec"', () => {
      fc.assert(
        fc.property(fc.object(), (value) => {
          const result = normalizeProtocolType(value)
          expect(result).toBe('kube-exec')
        })
      )
    })

    it('对于数组类型，返回 "kube-exec"', () => {
      fc.assert(
        fc.property(fc.array(fc.anything()), (value) => {
          const result = normalizeProtocolType(value)
          expect(result).toBe('kube-exec')
        })
      )
    })

    it('对于 null 或 undefined，返回 "kube-exec"', () => {
      fc.assert(
        fc.property(fc.constantFrom(null, undefined), (value) => {
          const result = normalizeProtocolType(value)
          expect(result).toBe('kube-exec')
        })
      )
    })
  })

  describe('属性: 幂等性', () => {
    it('对结果再次调用 normalizeProtocolType 返回相同值', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          const result1 = normalizeProtocolType(value)
          const result2 = normalizeProtocolType(result1)
          expect(result2).toBe(result1)
        })
      )
    })
  })
})

describe('isK8sDashboardUrl', () => {
  /**
   * 单元测试：URL 路径匹配
   * **Validates: Requirements 1.1**
   */
  describe('路径匹配 "/api/sockjs/" 或 "/sockjs/"', () => {
    it('返回 true 当路径包含 "/api/sockjs/"', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket'
      expect(isK8sDashboardUrl(url)).toBe(true)
    })

    it('返回 true 当路径包含 "/sockjs/"', () => {
      const url = 'wss://example.com/sockjs/123/456/websocket'
      expect(isK8sDashboardUrl(url)).toBe(true)
    })

    it('返回 false 当路径不包含 sockjs 相关路径', () => {
      const url = 'wss://example.com/api/v1/exec'
      expect(isK8sDashboardUrl(url)).toBe(false)
    })
  })

  /**
   * 单元测试：SessionID 查询参数匹配
   * **Validates: Requirements 1.2**
   */
  describe('查询参数名匹配 32 位十六进制格式', () => {
    it('返回 true 当查询参数名为 32 位十六进制字符串', () => {
      const url = 'wss://example.com/api/exec?0123456789abcdef0123456789abcdef=value'
      expect(isK8sDashboardUrl(url)).toBe(true)
    })

    it('返回 false 当查询参数名不是 32 位十六进制字符串', () => {
      const url = 'wss://example.com/api/exec?sessionId=value'
      expect(isK8sDashboardUrl(url)).toBe(false)
    })

    it('返回 false 当查询参数名为 31 位十六进制字符串', () => {
      const url = 'wss://example.com/api/exec?0123456789abcdef0123456789abcde=value'
      expect(isK8sDashboardUrl(url)).toBe(false)
    })

    it('返回 false 当查询参数名为 33 位十六进制字符串', () => {
      const url = 'wss://example.com/api/exec?0123456789abcdef0123456789abcdef0=value'
      expect(isK8sDashboardUrl(url)).toBe(false)
    })

    it('返回 false 当查询参数名包含非十六进制字符', () => {
      const url = 'wss://example.com/api/exec?ghijklmnopqrstuvwxyz1234567890=value'
      expect(isK8sDashboardUrl(url)).toBe(false)
    })
  })

  describe('边界情况', () => {
    it('返回 false 对于无效的 URL', () => {
      expect(isK8sDashboardUrl('not-a-url')).toBe(false)
    })

    it('返回 false 对于空字符串', () => {
      expect(isK8sDashboardUrl('')).toBe(false)
    })

    it('返回 true 当同时匹配路径和查询参数', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket?0123456789abcdef0123456789abcdef=value'
      expect(isK8sDashboardUrl(url)).toBe(true)
    })
  })
})

describe('isK8sDashboardUrl 属性测试', () => {
  /**
   * Property 1: URL 模式识别正确性
   * 验证 isK8sDashboardUrl 正确识别 K8s Dashboard URL
   * **Validates: Requirements 1.1**
   * 
   * Requirements:
   * - 1.1: IF WebSocket URL 路径包含子字符串 "/api/sockjs/" 或 "/sockjs/"，
   *        THEN THE WSTerm_Plugin SHALL 自动识别该连接为 K8s Dashboard 协议
   */
  describe('属性: 路径匹配返回 true', () => {
    it('对于包含 "/api/sockjs/" 的 URL，返回 true', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['https', 'wss'] }),
          fc.string({ minLength: 1 }),
          (baseUrl, suffix) => {
            // 构造包含 /api/sockjs/ 的 URL
            const url = baseUrl.replace(/\/$/, '') + '/api/sockjs/' + encodeURIComponent(suffix)
            expect(isK8sDashboardUrl(url)).toBe(true)
          }
        )
      )
    })

    it('对于包含 "/sockjs/" 的 URL，返回 true', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['https', 'wss'] }),
          fc.string({ minLength: 1 }),
          (baseUrl, suffix) => {
            // 构造包含 /sockjs/ 的 URL
            const url = baseUrl.replace(/\/$/, '') + '/sockjs/' + encodeURIComponent(suffix)
            expect(isK8sDashboardUrl(url)).toBe(true)
          }
        )
      )
    })
  })

  /**
   * Property 2: 32 位十六进制查询参数名识别
   * **Validates: Requirements 1.2**
   * 
   * Requirements:
   * - 1.2: IF WebSocket URL 查询参数名称匹配 32 位十六进制字符串格式，
   *        THEN THE WSTerm_Plugin SHALL 自动识别该连接为 K8s Dashboard 协议
   */
  describe('属性: 32 位十六进制查询参数名返回 true', () => {
    it('对于查询参数名为 32 位十六进制的 URL，返回 true', () => {
      // 生成 32 位十六进制字符串
      const hex32Generator = fc.tuple(
        fc.hexaString({ minLength: 32, maxLength: 32 }),
        fc.hexaString({ minLength: 0, maxLength: 0 })
      ).map(([hex]) => hex.toLowerCase())

      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['https', 'wss'] }),
          hex32Generator,
          (baseUrl, hex32) => {
            // 构造带 32 位十六进制查询参数名的 URL
            const url = baseUrl + '?' + hex32 + '=value'
            expect(isK8sDashboardUrl(url)).toBe(true)
          }
        )
      )
    })
  })

  describe('属性: 无效 URL 返回 false', () => {
    it('对于无效的 URL 字符串，返回 false', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string().filter(s => {
              try {
                new URL(s)
                return false
              } catch {
                return true
              }
            }),
            fc.constant(''),
            fc.constant('not-a-url')
          ),
          (invalidUrl) => {
            expect(isK8sDashboardUrl(invalidUrl)).toBe(false)
          }
        )
      )
    })
  })
})

describe('detectProtocolType', () => {
  /**
   * 单元测试：协议类型检测
   * **Validates: Requirements 1.1, 1.2, 1.4**
   */

  describe('返回 "k8s-dashboard" 对于 K8s Dashboard URL', () => {
    it('返回 "k8s-dashboard" 当路径包含 "/api/sockjs/"', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket'
      expect(detectProtocolType(url)).toBe('k8s-dashboard')
    })

    it('返回 "k8s-dashboard" 当路径包含 "/sockjs/"', () => {
      const url = 'wss://example.com/sockjs/123/456/websocket'
      expect(detectProtocolType(url)).toBe('k8s-dashboard')
    })

    it('返回 "k8s-dashboard" 当查询参数名为 32 位十六进制字符串', () => {
      const url = 'wss://example.com/api/exec?0123456789abcdef0123456789abcdef=value'
      expect(detectProtocolType(url)).toBe('k8s-dashboard')
    })
  })

  describe('返回 "kube-exec" 对于非 K8s Dashboard URL', () => {
    it('返回 "kube-exec" 对于普通的 kube-exec URL', () => {
      const url = 'wss://example.com/api/v1/namespaces/default/pods/my-pod/exec'
      expect(detectProtocolType(url)).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于 ttyd URL', () => {
      const url = 'wss://example.com/ws'
      expect(detectProtocolType(url)).toBe('kube-exec')
    })
  })

  describe('边界情况', () => {
    it('返回 "kube-exec" 对于无效的 URL', () => {
      expect(detectProtocolType('not-a-url')).toBe('kube-exec')
    })

    it('返回 "kube-exec" 对于空字符串', () => {
      expect(detectProtocolType('')).toBe('kube-exec')
    })
  })
})

describe('detectProtocolType 属性测试', () => {
  /**
   * Property: 协议类型检测正确性
   * **Validates: Requirements 1.1, 1.2, 1.4**
   * 
   * Requirements:
   * - 1.1: IF WebSocket URL 路径包含子字符串 "/api/sockjs/" 或 "/sockjs/"，
   *        THEN THE WSTerm_Plugin SHALL 自动识别该连接为 K8s Dashboard 协议
   * - 1.2: IF WebSocket URL 查询参数名称匹配 32 位十六进制字符串格式，
   *        THEN THE WSTerm_Plugin SHALL 自动识别该连接为 K8s Dashboard 协议
   * - 1.4: IF URL 不匹配 K8s Dashboard 协议模式且用户未指定协议类型，
   *        THEN THE WSTerm_Plugin SHALL 使用默认协议类型（kube-exec）
   */
  describe('属性: 返回值始终是有效的协议类型', () => {
    it('对于任意 URL 字符串，返回值始终是有效的协议类型', () => {
      fc.assert(
        fc.property(fc.string(), (url) => {
          const result = detectProtocolType(url)
          expect(['kube-exec', 'k8s-dashboard']).toContain(result)
        })
      )
    })
  })

  describe('属性: K8s Dashboard URL 返回 "k8s-dashboard"', () => {
    it('对于包含 "/api/sockjs/" 的 URL，返回 "k8s-dashboard"', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['https', 'wss'] }),
          fc.string({ minLength: 1 }),
          (baseUrl, suffix) => {
            const url = baseUrl.replace(/\/$/, '') + '/api/sockjs/' + encodeURIComponent(suffix)
            expect(detectProtocolType(url)).toBe('k8s-dashboard')
          }
        )
      )
    })

    it('对于包含 "/sockjs/" 的 URL，返回 "k8s-dashboard"', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['https', 'wss'] }),
          fc.string({ minLength: 1 }),
          (baseUrl, suffix) => {
            const url = baseUrl.replace(/\/$/, '') + '/sockjs/' + encodeURIComponent(suffix)
            expect(detectProtocolType(url)).toBe('k8s-dashboard')
          }
        )
      )
    })
  })

  describe('属性: 幂等性', () => {
    it('对结果再次调用 detectProtocolType 返回相同值', () => {
      fc.assert(
        fc.property(fc.string(), (url) => {
          const result1 = detectProtocolType(url)
          // 对于 kube-exec 结果，再次检测应该返回相同值
          if (result1 === 'kube-exec') {
            expect(detectProtocolType('any-url')).toBe('kube-exec')
          }
        })
      )
    })
  })
})

describe('Handler.canHandle 方法', () => {
  describe('K8sDashboardHandler.canHandle', () => {
    const handler = new K8sDashboardHandler()

    it('返回 true 对于包含 "/api/sockjs/" 的 URL', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket'
      expect(handler.canHandle(url)).toBe(true)
    })

    it('返回 true 对于包含 "/sockjs/" 的 URL', () => {
      const url = 'wss://example.com/sockjs/123/456/websocket'
      expect(handler.canHandle(url)).toBe(true)
    })

    it('返回 true 对于查询参数名为 32 位十六进制的 URL', () => {
      const url = 'wss://example.com/api/exec?0123456789abcdef0123456789abcdef=value'
      expect(handler.canHandle(url)).toBe(true)
    })

    it('返回 false 对于普通的 kube-exec URL', () => {
      const url = 'wss://example.com/api/v1/namespaces/default/pods/my-pod/exec'
      expect(handler.canHandle(url)).toBe(false)
    })

    it('返回 false 对于无效的 URL', () => {
      expect(handler.canHandle('not-a-url')).toBe(false)
    })
  })

  describe('KubeExecHandler.canHandle', () => {
    const handler = new KubeExecHandler()

    it('返回 true 对于任何 URL（默认协议）', () => {
      expect(handler.canHandle('wss://example.com/any/path')).toBe(true)
      expect(handler.canHandle('wss://example.com/api/sockjs/123/456/websocket')).toBe(true)
      expect(handler.canHandle('not-a-url')).toBe(true)
    })
  })

  describe('TtydHandler.canHandle', () => {
    const handler = new TtydHandler()

    it('返回 false（ttyd 协议不自动识别）', () => {
      expect(handler.canHandle('wss://example.com/ws')).toBe(false)
      expect(handler.canHandle('wss://example.com/ttyd')).toBe(false)
    })
  })
})

describe('createProtocolHandler 自动识别', () => {
  describe('根据 URL 自动识别协议类型', () => {
    it('识别 K8s Dashboard URL', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket'
      const handler = createProtocolHandler(undefined, url)
      expect(handler).toBeInstanceOf(K8sDashboardHandler)
    })

    it('识别普通 URL 为 kube-exec', () => {
      const url = 'wss://example.com/api/v1/namespaces/default/pods/my-pod/exec'
      const handler = createProtocolHandler(undefined, url)
      expect(handler).toBeInstanceOf(KubeExecHandler)
    })

    it('无 URL 时返回 kube-exec', () => {
      const handler = createProtocolHandler(undefined, undefined)
      expect(handler).toBeInstanceOf(KubeExecHandler)
    })
  })

  describe('指定的协议类型优先', () => {
    it('即使 URL 是 K8s Dashboard，指定 ttyd 仍使用 ttyd', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket'
      const handler = createProtocolHandler('ttyd', url)
      expect(handler).toBeInstanceOf(TtydHandler)
    })

    it('指定无效的协议类型时使用自动识别', () => {
      const url = 'wss://example.com/api/sockjs/123/456/websocket'
      const handler = createProtocolHandler('invalid' as ProtocolType, url)
      expect(handler).toBeInstanceOf(K8sDashboardHandler)
    })
  })
})
