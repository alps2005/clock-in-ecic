import { expect, test } from '@playwright/test'
import { setTheme, mockBackend, signIn } from './mock.ts'

test('desktop sidebar and frame fill the viewport on short and long pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await mockBackend(page)
  await signIn(page)
  for (const route of ['/jornada', '/historial']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.teacher-frame')).toBeVisible()
    const frame = (await page.locator('.teacher-frame').boundingBox())!
    const sidebar = (await page.locator('.teacher-sidebar').boundingBox())!
    expect(frame.y).toBe(8)
    expect(frame.y + frame.height).toBe(1092)
    expect(sidebar.height).toBe(1100)
    await page.getByRole('button', { name: 'Actualizar datos' }).click()
    await expect(page.locator('.toast')).toBeVisible()
    expect((await page.locator('.teacher-frame').boundingBox())!.height).toBe(frame.height)
  }
})

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} current week advances to Sep 21–25 while open and preserves a custom range`, async ({ page }) => {
    const backend = await mockBackend(page, { role, schoolDate: '2026-09-20' })
    const requests: { p_from: string; p_to: string; p_page: number }[] = []
    page.on('request', request => { if (request.url().endsWith('/attendance_report')) requests.push(request.postDataJSON()) })
    await signIn(page)
    if (role === 'teacher') await page.goto('/historial')
    await page.getByRole('button', { name: 'Esta semana', exact: true }).click()
    await expect(page.locator('#history-from')).toHaveText('14/09/2026')
    await expect(page.locator('#history-to')).toHaveText('18/09/2026')
    backend.setSchoolDate('2026-09-21')
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.locator('#history-from')).toHaveText('21/09/2026')
    await expect(page.locator('#history-to')).toHaveText('25/09/2026')
    await expect.poll(() => requests.at(-1)).toMatchObject({ p_from: '2026-09-21', p_to: '2026-09-25', p_page: 0 })
    await expect(page.getByRole('button', { name: 'Esta semana', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.locator('#history-from').click()
    await page.getByRole('dialog').getByRole('button', { name: '22/09/2026', exact: true }).click()
    await page.getByRole('button', { name: 'Consultar', exact: true }).click()
    backend.setSchoolDate('2026-09-28')
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.locator('#history-from')).toHaveText('22/09/2026')
    await expect(page.locator('#history-to')).toHaveText('25/09/2026')
    await expect.poll(() => requests.at(-1)).toMatchObject({ p_from: '2026-09-22', p_to: '2026-09-25' })
    await page.reload()
    await page.getByRole('button', { name: 'Esta semana', exact: true }).click()
    await expect(page.locator('#history-from')).toHaveText('28/09/2026')
    await expect(page.locator('#history-to')).toHaveText('02/10/2026')
  })
}

test('admin screens fit desktop and mobile in both themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The viewport matrix includes mobile.')
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mockBackend(page, { role: 'admin' })
  await page.route('**/rest/v1/rpc/admin_teachers', route => route.fulfill({ json: { total: 1, rows: [{ id: 'fixture', full_name: 'Ana Torres', cedula: '0000000001', active: true, employed_from: '2026-09-01', employed_until: null }] } }))
  await signIn(page)
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setTheme(page, theme)
    for (const width of [375, 402, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const route of ['/admin', '/admin/docentes', '/admin/avisos']) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.getByRole('link', { name: /Ana Torres|Historial de Ana Torres/ }).or(page.getByRole('heading', { name: 'Ana Torres' })).filter({ visible: true }).first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('.teacher-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        if (width > 900) {
          const frame = (await page.locator('.teacher-frame').boundingBox())!
          expect(frame.y + frame.height).toBe(992)
        }
        if (width === 402 || width === 1440) await page.screenshot({ path: info.outputPath(`${route.replaceAll('/', '-')}-${width}-${theme}.png`) })
      }
    }
  }
  expect(errors).toEqual([])
})

test('admin pagination retains the applied search and week, and justification restores focus', async ({ page }) => {
  await mockBackend(page, { role: 'admin' })
  const requests: { p_from: string; p_to: string; p_search: string; p_page: number }[] = []
  await page.route('**/rest/v1/rpc/attendance_report', route => {
    const request = route.request().postDataJSON()
    requests.push(request)
    return route.fulfill({ json: { as_of: '2026-09-14T12:00Z', page: request.p_page, page_size: 10,
      totals: { expected: 11, entry_on_time: 0, entry_late: 11, missing_entry: 0, exit_on_time: 0, exit_late: 0, missing_exit: 11, absent: 0 },
      rows: [{ teacher_id: 'fixture', full_name: 'Ana Torres', cedula: '0000000001', school_date: '2026-09-14', entry_at: '2026-09-14T12:00Z', exit_at: null, entry_status: 'late', exit_status: 'missing', worked_minutes: null, justification: 'El transporte tuvo un retraso.' }],
    } })
  })
  await signIn(page)
  await page.getByLabel('Docente', { exact: true }).fill('Ana')
  await page.getByRole('button', { name: 'Esta semana', exact: true }).click()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect.poll(() => requests.at(-1)).toMatchObject({ p_from: '2026-09-14', p_to: '2026-09-18', p_search: 'Ana', p_page: 1 })
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled()
  const trigger = page.getByRole('button', { name: 'Ver justificación', exact: true })
  await trigger.click()
  await expect(page.getByRole('dialog', { name: 'Justificación', exact: true })).toContainText('Ana Torres')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await expect.poll(() => requests.at(-1)?.p_page).toBe(0)
  await page.getByRole('button', { name: 'Este mes', exact: true }).click()
  await expect.poll(() => requests.at(-1)).toMatchObject({ p_from: '2026-09-01', p_to: '2026-09-30', p_search: 'Ana', p_page: 0 })
})
