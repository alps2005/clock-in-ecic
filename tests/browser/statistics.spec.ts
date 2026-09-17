import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'
import type { Report, ReportRow } from '../../src/types/app.ts'

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} report separates entry and exit statistics and absence statuses`, async ({ page }, info) => {
    await mockBackend(page, { role })
    const absent: ReportRow = { teacher_id: 'teacher', full_name: 'Ana Torres', cedula: '0000000001', school_date: '2026-09-14', entry_at: null, exit_at: null, justification: null, entry_status: 'absent', exit_status: 'pending', worked_minutes: null }
    const report: Report = { as_of: '2026-09-17T19:00:00Z', page: 0, page_size: 25,
      totals: { expected: 100, on_time: 2, late: 3, entry_on_time: 0, entry_late: 3, exit_on_time: 2, exit_late: 0, missing_entry: 7, missing_exit: 9, absent: 23, completed: 38 },
      rows: [absent, { ...absent, school_date: '2026-09-15', exit_at: '2026-09-15T18:00:00Z', entry_status: 'missing_entry', exit_status: 'registered' }],
    }
    await page.route('**/rest/v1/rpc/attendance_report', route => route.fulfill({ json: report }))
    await signIn(page)
    await expect(page).toHaveURL(role === 'teacher' ? /\/jornada$/ : /\/admin$/)
    if (role === 'teacher') await page.goto('/historial')
    const cardSelector = role === 'teacher' ? '.stat' : '.ecic-stat-card'
    await expect(page.locator(cardSelector)).toHaveCount(7)
    for (const group of [
      { title: 'Entradas', counts: [0, 3, 7], descriptions: ['Entradas realizadas a tiempo', 'Entradas realizadas con atraso', 'Registros sin entrada marcada'] },
      { title: 'Salidas', counts: [2, 0, 9], descriptions: ['Salidas realizadas a tiempo', 'Salidas realizadas con atraso', 'Registros sin salida marcada'] },
    ]) {
      const cards = page.getByRole('region', { name: group.title, exact: true }).locator(cardSelector)
      await expect(cards).toHaveCount(3)
      for (const [index, count] of group.counts.entries()) {
        await expect(cards.nth(index)).toContainText(group.descriptions[index])
        await expect(cards.nth(index).locator('strong')).toHaveText(String(count))
      }
    }
    const entries = (await page.getByRole('region', { name: 'Entradas', exact: true }).boundingBox())!
    const exits = (await page.getByRole('region', { name: 'Salidas', exact: true }).boundingBox())!
    expect(exits.y).toBeGreaterThan(entries.y + entries.height)
    const absence = page.getByRole('region', { name: 'Faltas', exact: true })
    await expect(absence.locator('strong')).toHaveText('23')
    await expect(absence).toContainText('Registros no realizados')
    await expect(page.getByRole('cell', { name: /Sin asistencia/ })).toHaveCount(1)
    await expect(page.getByRole('cell', { name: /Sin entrada/ })).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`${role}-statistics.png`), fullPage: true })
  })
}
