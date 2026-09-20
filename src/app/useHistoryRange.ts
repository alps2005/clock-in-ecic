import { useState } from 'react'
import { historyPresets, shiftSchoolDate } from '../lib/historyDates'

type Range = { from: string; to: string }

export function reportPresets(today: string) {
  return [{ label: 'Hoy', from: today, to: today }, { label: 'Ayer', from: shiftSchoolDate(today, -1), to: shiftSchoolDate(today, -1) }, ...historyPresets(today)]
}

// Follow a selected preset across school-date changes, keeping custom ranges intact.
export function useHistoryRange(today: string, initial = 'Esta semana') {
  const presets = reportPresets(today)
  const [state, setState] = useState(() => {
    const range = presets.find(preset => preset.label === initial)!
    return { today, from: range.from, to: range.to, filter: { from: range.from, to: range.to }, page: 0 }
  })
  if (state.today !== today) {
    const previous = reportPresets(state.today)
    const follow = (range: Range) => {
      const match = previous.find(preset => preset.from === range.from && preset.to === range.to)
      const next = match && presets.find(preset => preset.label === match.label)
      return next ? { from: next.from, to: next.to } : range
    }
    const draft = follow(state)
    const filter = follow(state.filter)
    setState({ today, from: draft.from, to: draft.to, filter, page: filter.from !== state.filter.from || filter.to !== state.filter.to ? 0 : state.page })
  }
  return {
    ...state, presets,
    setFrom: (from: string) => setState(value => ({ ...value, from })),
    setTo: (to: string) => setState(value => ({ ...value, to })),
    setPage: (page: number) => setState(value => ({ ...value, page })),
    apply: (range: Range = state) => setState(value => ({ ...value, from: range.from, to: range.to, filter: { from: range.from, to: range.to }, page: 0 })),
  }
}
