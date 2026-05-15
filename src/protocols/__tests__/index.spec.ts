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
} from '../index'
import { KubeExecHandler } from '../kube-exec.handler'
import { TtydHandler } from '../ttyd.handler'
import { K8sDashboardHandler } from '../k8s-dashboard.handler'

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


