import { expect, it, vi } from 'vitest'
import { calendarDate, calendarDayEnd } from './calendarDate'
import { initialState, key, today } from './logic'

it('uses midnight in Japan independently of the device timezone', () => {
  expect(calendarDate(Date.parse('2026-10-23T14:59:59.999Z'))).toBe('2026-10-23')
  expect(calendarDate(Date.parse('2026-10-23T15:00:00Z'))).toBe('2026-10-24')
  expect(calendarDayEnd('2026-10-23')).toBe(Date.parse('2026-10-23T15:00:00Z'))
})

it('uses the same Japanese day for achievement records and simulated days', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-10-23T15:00:00Z'))
    expect(key(today(initialState()))).toBe('2026-10-24')
    expect(key(today({ ...initialState(), dayOffset: -1 }))).toBe('2026-10-23')
  } finally {
    vi.useRealTimers()
  }
})
