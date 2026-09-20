import { expect, test } from '@playwright/test'
import { setTheme, mockBackend, signIn } from './mock.ts'

test.use({ timezoneId: 'Asia/Tokyo' })

test('teacher never requests admin counts, including refresh and visibility changes', async ({ page }) => {
  await mockBackend(page)
  const adminRequests: string[] = []
  page.on('request', request => { if (request.url().endsWith('/admin_sidebar_counts')) adminRequests.push(request.url()) })
  await signIn(page)
  await expect(page.locator('.jornada-kpi').first()).toContainText('06:30')
  await page.getByRole('button', { name: 'Actualizar datos' }).click()
  await expect(page.locator('.toast')).toHaveText('Datos actualizados')
  await page.goto('/historial')
  await expect(page.getByRole('heading', { name: 'Mi historial', exact: true })).toBeVisible()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.getByRole('button', { name: 'Actualizar datos' }).click()
  await expect(page.locator('.toast')).toHaveText('Datos actualizados')
  expect(adminRequests).toEqual([])
})

test('admin counts wait for the profile and failures stop polling without breaking navigation', async ({ page }) => {
  await mockBackend(page, { role: 'admin' })
  let requests = 0
  let contextResponded = false
  page.on('response', response => { if (response.url().endsWith('/app_context')) contextResponded = true })
  const warnings: string[] = []
  page.on('console', message => { if (message.type() === 'warning' && message.text() === 'Sidebar counts unavailable') warnings.push(message.text()) })
  await page.route('**/rest/v1/rpc/admin_sidebar_counts', route => {
    expect(contextResponded).toBe(true); requests++
    return route.fulfill({ status: 400, json: { message: 'TEST_FAILURE' } })
  })
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Asistencia docente' })).toBeVisible()
  await expect.poll(() => requests).toBe(1)
  await page.clock.install()
  await page.clock.fastForward(61000)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(requests).toBe(1)
  expect(warnings).toHaveLength(1)
  await expect(page.locator('.nav-count')).toHaveCount(0)
})

test('admin counts remain populated for administrators', async ({ page }) => {
  await mockBackend(page, { role: 'admin' })
  await signIn(page)
  await expect(page.locator('.nav-count').filter({ visible: true })).toHaveText(['29', '1'])
})

test('Spanish dates, presets, validation and justification focus work', async ({ page }) => {
  await mockBackend(page)
  const requests: { p_from: string; p_to: string }[] = []
  page.on('request', request => { if (request.url().endsWith('/attendance_report')) requests.push(request.postDataJSON()) })
  await signIn(page)
  await page.goto('/historial')
  await expect(page.locator('#history-from')).toHaveText('14/09/2026')
  await expect(page.locator('#history-to')).toHaveText('18/09/2026')
  await page.getByRole('button', { name: 'Semana anterior', exact: true }).click()
  await expect.poll(() => requests.at(-1)?.p_from).toBe('2026-09-07')
  await expect(page.getByRole('button', { name: 'Semana anterior', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#history-from').click()
  await page.getByRole('dialog').getByRole('button', { name: '19/09/2026', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('La fecha inicial no puede ser posterior a la final.')
  await expect(page.getByRole('button', { name: 'Consultar', exact: true })).toBeDisabled()
  await expect(page.locator('#history-from')).toBeFocused()
  await page.getByRole('button', { name: 'Esta semana', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Ver justificación', exact: true }).filter({ visible: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Justificación', exact: true })
  await expect(dialog).toContainText('El transporte tuvo un retraso.')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('both pages fit all required widths in both themes without runtime errors', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The viewport matrix already covers mobile.')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('/rest/')) errors.push(`${response.status()} ${response.url()}`) })
  await mockBackend(page)
  await signIn(page)
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setTheme(page, theme)
    for (const width of [375, 402, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['jornada', 'historial']) {
        await page.goto(`/${route}`)
        await expect(page.locator('.teacher-shell')).toBeVisible()
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (route === 'historial') await expect(page.getByRole('heading', { name: 'Detalle de asistencia', exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('.teacher-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
        if (width === 402 || width === 1440) await page.screenshot({ path: info.outputPath(`${route}-${width}-${theme}.png`) })
      }
    }
  }
  expect(errors).toEqual([])
})

test('teacher account popover, sidebar persistence and route scroll reset', async ({ page }, info) => {
  await mockBackend(page)
  await signIn(page)
  if (info.project.use.isMobile) {
    await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click()
    await expect(page.locator('#teacher-account')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#teacher-account')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Abrir menú de cuenta' })).toBeFocused()
  } else {
    await page.getByRole('button', { name: 'Alternar barra lateral' }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Alternar barra lateral' })).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: 'Alternar barra lateral' }).click()
  }
  await page.locator('.teacher-content').evaluate(element => { element.scrollTop = element.scrollHeight })
  await page.getByRole('link', { name: 'Mi historial', exact: true }).click()
  await expect(page).toHaveURL(/\/historial$/)
  await expect.poll(() => page.locator('.teacher-content').evaluate(element => element.scrollTop)).toBe(0)
})

test('history loading, empty, retry and pagination preserve query semantics', async ({ page }) => {
  await mockBackend(page)
  await signIn(page)
  let mode: 'empty' | 'error' | 'rows' = 'empty'
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const pages: number[] = []
  await page.route('**/rest/v1/rpc/attendance_report', async route => {
    await gate
    const request = route.request().postDataJSON()
    pages.push(request.p_page)
    if (mode === 'error') return route.fulfill({ status: 500, json: { message: 'TEST_UNAVAILABLE' } })
    return route.fulfill({ json: { as_of: '2026-09-14T12:00Z', page: request.p_page, page_size: 25,
      totals: { expected: mode === 'empty' ? 0 : 26, entry_on_time: 0, entry_late: 0, missing_entry: 0, exit_on_time: 0, exit_late: 0, missing_exit: 0, absent: 0 },
      rows: mode === 'empty' ? [] : [{ teacher_id: 'fixture', school_date: '2026-09-14', entry_at: null, exit_at: null, entry_status: 'pending', exit_status: 'pending', worked_minutes: null, justification: null }],
    } })
  })
  await page.goto('/historial')
  const progress = page.getByRole('progressbar', { name: 'Progreso de carga' })
  await expect(progress).toBeVisible()
  expect(Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(100)
  release()
  await expect(page.getByRole('heading', { name: 'No hay registros en este rango' })).toBeVisible()
  await expect(page.getByRole('img', { name: '0 a tiempo, 0 con atraso, 0 sin marcar' })).toHaveCount(2)
  await page.getByRole('button', { name: 'Ver esta semana' }).click()
  mode = 'error'
  await page.getByRole('button', { name: 'Actualizar datos' }).click()
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar')
  mode = 'rows'
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByText('26 registros, página 1 de 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByText('26 registros, página 2 de 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled()
  expect(pages.at(-1)).toBe(1)
})
