import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'
import { dateLabel } from '../../src/lib/attendance.ts'

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} filter card and filtered export preview support CSV, Excel and keyboard dismissal`, async ({ page }, testInfo) => {
    await mockBackend(page, { role })
    await signIn(page)
    if (role === 'teacher') await page.goto('/historial')
    const header = page.locator('.teacher-history .page-heading')
    await expect(header).not.toContainText('ADMINISTRACIÓN')
    await expect(header).not.toContainText('ECIC • Ecuador')
    await expect(header.locator('.ecic-live-dot')).toHaveCount(0)
    await expect(header.getByRole('button', { name: 'Exportar', exact: true })).toHaveCount(0)
    const filters = page.locator('.history-filters')
    const exportButton = filters.getByRole('button', { name: 'Exportar', exact: true })
    await expect(exportButton).toBeVisible()
    const placement = await filters.evaluate(element => {
      const card = element.getBoundingClientRect()
      const button = element.querySelector('.history-filter-actions > button')!.getBoundingClientRect()
      const presets = element.querySelector('.history-presets')!.getBoundingClientRect()
      return { rightInset: card.right - button.right, topOffset: Math.abs(button.top - presets.top) }
    })
    expect(placement.rightInset).toBeGreaterThan(0)
    expect(placement.rightInset).toBeLessThan(40)
    expect(placement.topOffset).toBeLessThan(2)
    await exportButton.click()
    const dialog = page.getByRole('dialog', { name: 'Asistencia del rango seleccionado' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('cell', { name: 'El transporte tuvo un retraso.' })).toBeVisible()
    await expect(dialog.getByRole('columnheader')).toHaveText(role === 'admin'
      ? ['Docente', 'Cédula', 'Fecha', 'Entrada', 'Salida', 'Estado', 'Tiempo', 'Justificación']
      : ['Fecha', 'Entrada', 'Salida', 'Estado', 'Tiempo', 'Justificación'])
    await page.screenshot({ path: testInfo.outputPath(`export-${role}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const format of ['CSV', 'Excel']) {
      const pending = page.waitForEvent('download')
      await dialog.getByRole('button', { name: `Descargar ${format}` }).click()
      const download = await pending
      expect(download.suggestedFilename()).toBe(`asistencia-2026-09-14-${role === 'admin' ? '2026-09-14' : '2026-09-18'}.${format === 'CSV' ? 'csv' : 'xlsx'}`)
      const content = await readFile((await download.path())!)
      if (format === 'CSV') {
        expect(content.toString('utf8')).toContain('El transporte tuvo un retraso.')
        expect(content.toString('utf8').includes('Ana Torres')).toBe(role === 'admin')
      } else expect(content.subarray(0, 2).toString()).toBe('PK')
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.history-filters').getByRole('button', { name: 'Exportar', exact: true })).toBeFocused()
    await filters.screenshot({ path: testInfo.outputPath(`filters-${role}.png`), animations: 'disabled' })
  })
}

test('admin export fetches all pages using the applied custom range and search', async ({ page }) => {
  await mockBackend(page, { role: 'admin' })
  await signIn(page)
  await expect(page.getByRole('link', { name: 'Ana Torres', exact: true }).filter({ visible: true })).toBeVisible()
  const pages: number[] = []
  await page.route('**/rest/v1/rpc/attendance_report', async route => {
    const request = route.request().postDataJSON()
    expect(request.p_from).toBe('2026-09-02')
    expect(request.p_to).toBe('2026-09-10')
    expect(request.p_search).toBe('Docente')
    pages.push(request.p_page)
    await route.fulfill({ json: { as_of: '2026-09-14T11:30:00Z', page: request.p_page, page_size: 25, totals: { expected: 26, entry_on_time: 0, entry_late: 0, exit_on_time: 0, exit_late: 0, missing_entry: 0, absent: 26, missing_exit: 0 }, rows: Array.from({ length: request.p_page === 0 ? 25 : 1 }, (_, i) => ({ teacher_id: `teacher-${request.p_page * 25 + i}`, full_name: `Docente ${request.p_page * 25 + i}`, cedula: '0123456789', school_date: '2026-09-02', entry_at: null, exit_at: null, justification: null, entry_status: 'pending', exit_status: 'pending', worked_minutes: null })) } })
  })
  await page.locator('#history-from').click()
  await page.getByRole('dialog').getByRole('button', { name: '02/09/2026', exact: true }).click()
  await page.locator('#history-to').click()
  await page.getByRole('dialog').getByRole('button', { name: '10/09/2026', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Docente', { exact: true }).fill('Docente')
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page.locator('.history-report-heading')).toContainText(`${dateLabel('2026-09-02')} – ${dateLabel('2026-09-10')}`)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.locator('.history-pager')).toContainText('página 2')
  // Draft changes do not change the displayed table until Consultar is pressed.
  await page.getByLabel('Docente', { exact: true }).fill('Sin aplicar')
  await page.locator('#history-from').click()
  await page.getByRole('dialog').getByRole('button', { name: '01/09/2026', exact: true }).click()
  pages.length = 0
  await page.locator('.history-filters').getByRole('button', { name: 'Exportar', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Búsqueda: Docente')
  await expect(dialog).toContainText(`${dateLabel('2026-09-02')} — ${dateLabel('2026-09-10')}`)
  await expect(dialog.getByRole('row')).toHaveCount(27)
  expect(pages).toEqual([0, 1])
  const pending = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Descargar CSV' }).click()
  const csv = await readFile((await (await pending).path())!, 'utf8')
  expect(csv).toContain('Docente 25')
  expect(csv.split('\r\n')).toHaveLength(27)
})

test('export errors can be retried and empty results disable downloads', async ({ page }) => {
  await mockBackend(page)
  await signIn(page)
  await page.goto('/historial')
  await expect(page.getByRole('heading', { name: 'Mi historial', exact: true })).toBeVisible()
  let fail = true
  await page.route('**/rest/v1/rpc/attendance_report', route => fail
    ? route.fulfill({ status: 400, json: { message: 'OFFLINE' } })
    : route.fulfill({ json: { rows: [], page: 0, page_size: 25, totals: { expected: 0 } } }))
  await page.getByRole('button', { name: 'Exportar', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Descargar CSV' })).toBeDisabled()
  fail = false
  await dialog.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(dialog.getByRole('heading', { name: 'No hay registros en este rango' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled()
})

test('individual account export retains its selected account and date range', async ({ page }) => {
  const backend = await mockBackend(page, { role: 'admin' })
  const teacherId = '20000000-0000-0000-0000-000000000009'
  const requests: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/admin_teacher', route => route.fulfill({ json: { id: teacherId, full_name: 'Docente seleccionado', cedula: '0000000009', role: 'teacher', active: true, employed_from: '2026-09-01', employed_until: null } }))
  await page.route('**/rest/v1/rpc/admin_teacher_report', route => {
    const request = route.request().postDataJSON()
    requests.push(request)
    return route.fulfill({ json: { as_of: '2026-09-14T11:30:00Z', page: 0, page_size: 25, totals: { expected: 1, entry_on_time: 0, entry_late: 0, exit_on_time: 0, exit_late: 0, missing_entry: 0, absent: 1, missing_exit: 0 }, rows: [{ teacher_id: teacherId, full_name: 'Docente seleccionado', cedula: '0000000009', school_date: request.p_from, entry_at: null, exit_at: null, justification: null, entry_status: 'absent', exit_status: 'pending', worked_minutes: null }] } })
  })
  await signIn(page)
  await page.goto(`/admin/docentes/${teacherId}`)
  await page.getByRole('button', { name: 'Semana anterior', exact: true }).click()
  await expect(page.locator('.history-report-heading')).toContainText(`${dateLabel('2026-09-07')} – ${dateLabel('2026-09-11')}`)
  const globalReports = backend.protectedRequests.filter(path => path.endsWith('/attendance_report')).length
  requests.length = 0
  await page.locator('.history-filters').getByRole('button', { name: 'Exportar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Asistencia del rango seleccionado' })
  await expect(dialog.getByRole('row')).toHaveCount(2)
  await expect(dialog.getByRole('columnheader')).toHaveText(['Fecha', 'Entrada', 'Salida', 'Estado', 'Tiempo', 'Justificación'])
  expect(requests).toEqual([{ p_id: teacherId, p_from: '2026-09-07', p_to: '2026-09-11', p_page: 0 }])
  expect(backend.protectedRequests.filter(path => path.endsWith('/attendance_report')).length).toBe(globalReports)
})
