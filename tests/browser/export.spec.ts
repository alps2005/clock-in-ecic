import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} header and weekly export preview support CSV, Excel and keyboard dismissal`, async ({ page }, testInfo) => {
    await mockBackend(page, { role })
    await signIn(page)
    if (role === 'teacher') await page.goto('/historial')
    const header = page.locator('.teacher-history .page-heading')
    await expect(header).not.toContainText('ADMINISTRACIÓN')
    await expect(header).not.toContainText('ECIC • Ecuador')
    await expect(header.locator('.ecic-live-dot')).toHaveCount(0)
    await header.getByRole('button', { name: 'Exportar', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Asistencia de esta semana' })
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
      expect(download.suggestedFilename()).toBe(`asistencia-2026-09-14-2026-09-18.${format === 'CSV' ? 'csv' : 'xlsx'}`)
      const content = await readFile((await download.path())!)
      if (format === 'CSV') {
        expect(content.toString('utf8')).toContain('El transporte tuvo un retraso.')
        expect(content.toString('utf8').includes('Ana Torres')).toBe(role === 'admin')
      } else expect(content.subarray(0, 2).toString()).toBe('PK')
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(header.getByRole('button', { name: 'Exportar', exact: true })).toBeFocused()
  })
}

test('admin export fetches all pages using only the current school week', async ({ page }) => {
  await mockBackend(page, { role: 'admin' })
  await signIn(page)
  await expect(page.getByRole('link', { name: 'Ana Torres', exact: true }).filter({ visible: true })).toBeVisible()
  const pages: number[] = []
  await page.route('**/rest/v1/rpc/attendance_report', async route => {
    const request = route.request().postDataJSON()
    expect(request.p_from).toBe('2026-09-14')
    expect(request.p_to).toBe('2026-09-18')
    expect(request.p_search).toBe('')
    pages.push(request.p_page)
    await route.fulfill({ json: { page: request.p_page, page_size: 25, totals: { expected: 26 }, rows: Array.from({ length: request.p_page === 0 ? 25 : 1 }, (_, i) => ({ teacher_id: `teacher-${request.p_page * 25 + i}`, full_name: `Docente ${request.p_page * 25 + i}`, cedula: '0123456789', school_date: '2026-09-14', entry_at: null, exit_at: null, justification: null, entry_status: 'pending', exit_status: 'pending', worked_minutes: null })) } })
  })
  await page.locator('.teacher-history .page-heading').getByRole('button', { name: 'Exportar', exact: true }).click()
  const dialog = page.getByRole('dialog')
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
  await expect(dialog.getByRole('heading', { name: 'No hay registros esta semana' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled()
})
