/** 全端末で同じ日付になるよう、日付の境界は日本時間の午前0時に揃える。 */
export const calendarDate = (now = Date.now()) =>
  new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

export const calendarDayEnd = (day: string) =>
  Date.parse(`${day}T00:00:00+09:00`) + 24 * 60 * 60 * 1000
