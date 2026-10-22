import { describe, expect, it } from 'vitest'
import vi from '../src/i18n/vi.json'
import { detectLocale, resolveLocale } from '../src/engine/i18n'

describe('Vietnamese-only i18n', () => {
  it('always resolves to Vietnamese regardless of browser or stored locale', () => {
    expect(detectLocale(['vi-VN'])).toBe('vi')
    expect(detectLocale(['zh-CN', 'en'])).toBe('vi')
    expect(detectLocale(['en-US'])).toBe('vi')
    expect(detectLocale([])).toBe('vi')
    expect(detectLocale(undefined)).toBe('vi')
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('vi')
    expect(resolveLocale('', undefined)).toBe('vi')
  })

  it('includes the key Vietnamese strings and keeps interpolation placeholders valid', () => {
    expect(vi['game.title']).toBe('Ngộ Không')
    expect(vi['menu.play']).toBeTruthy()
    expect(vi['hud.location']).toBeTruthy()
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const value of Object.values(vi)) expect(placeholders(value)).toEqual([])
  })
})
