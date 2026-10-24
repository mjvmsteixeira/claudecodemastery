import { test, expect } from 'claude-code/testing'
import { levelOf, bar, windowLabel, resetText, levelColor } from '../hooks/panel-format.ts'

test('levelOf: limiares warn 50 e crit 80', () => {
  const t = { warn: 50, crit: 80 }
  expect(levelOf(49, t)).toBe('ok')
  expect(levelOf(50, t)).toBe('warn')
  expect(levelOf(79, t)).toBe('warn')
  expect(levelOf(80, t)).toBe('crit')
})

test('bar: 8 células, arredondadas ao mais próximo, saturadas', () => {
  expect(bar(0)).toEqual({ filled: 0, empty: 8 })
  expect(bar(24)).toEqual({ filled: 2, empty: 6 })
  expect(bar(50)).toEqual({ filled: 4, empty: 4 })
  expect(bar(100)).toEqual({ filled: 8, empty: 0 })
  expect(bar(130)).toEqual({ filled: 8, empty: 0 })
  expect(bar(-5)).toEqual({ filled: 0, empty: 8 })
})

test('windowLabel: 5h, 7d, e o próprio nome para outros tipos', () => {
  expect(windowLabel('five_hour')).toBe('5h')
  expect(windowLabel('seven_day')).toBe('7d')
  expect(windowLabel('opus_weekly')).toBe('opus_weekly')
})

test('resetText: menos de 24 h mostra XhYY', () => {
  const now = new Date(2026, 9, 20, 9, 0)
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString()
  expect(resetText(at(2 * 3600_000 + 10 * 60_000), now.getTime())).toBe('2h10')
  expect(resetText(at(25 * 60_000), now.getTime())).toBe('0h25')
})

test('resetText: 24 h ou mais mostra dia da semana e HH:MM locais', () => {
  const now = new Date(2026, 9, 20, 9, 0)
  const target = new Date(2026, 9, 23, 9, 0)
  expect(resetText(target.toISOString(), now.getTime())).toBe('sex 09:00')
  const exactly24h = new Date(2026, 9, 21, 9, 0)
  expect(resetText(exactly24h.toISOString(), now.getTime())).toBe('qua 09:00')
})

test('resetText: sem data, no passado ou mal formado devolve null', () => {
  const now = new Date(2026, 9, 20, 9, 0).getTime()
  expect(resetText(undefined, now)).toBe(null)
  expect(resetText(new Date(now - 60_000).toISOString(), now)).toBe(null)
  expect(resetText('xyz', now)).toBe(null)
})

test('levelColor: ok, warn, crit mapeiam para success, warning, error', () => {
  expect(levelColor('ok')).toBe('success')
  expect(levelColor('warn')).toBe('warning')
  expect(levelColor('crit')).toBe('error')
})
