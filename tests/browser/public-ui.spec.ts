import { expect, test } from '@playwright/test'
import { setTheme, mockBackend } from './mock.ts'

async function enterCredentials(page: import('@playwright/test').Page) {
  await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
}

test('login preserves validation, password visibility and recovery from a failed sign-in', async ({ page }) => {
  await mockBackend(page)
  let fail = true
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/auth/v1/token**', async route => {
    if (!fail) return route.fallback()
    await pending
    return route.fulfill({ status: 400, json: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
  })
  await page.goto('/')
  await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
  const password = page.getByLabel('Contraseña', { exact: true })
  await password.fill('fixture-password-only')
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ingresando…', exact: true })).toBeDisabled()
  await expect(password).toBeDisabled()
  release()
  await expect(page.getByRole('alert')).toContainText('No pudimos iniciar sesión')
  await expect(password).toHaveValue('')
  await expect(page.getByLabel('Cédula', { exact: true })).toHaveValue('0000000001')
  fail = false
  await password.fill('fixture-password-only')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
})

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} loading, connection failure, retry and logout share the public layout`, async ({ page }, info) => {
    await mockBackend(page, { role })
    let mode: 'pending' | 'error' | 'ready' = 'pending'
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/rest/v1/rpc/app_context', async route => {
      if (mode === 'pending') await pending
      if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'OFFLINE' } })
      return route.fallback()
    })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.goto('/')
    await enterCredentials(page)
    await expect(page.getByRole('heading', { name: 'Cargando tu espacio…' })).toBeVisible()
    await expect(page.locator('.public-frame')).toBeVisible()
    await expect(page.locator('.loading-state .loading-spinner')).toHaveCount(0)
    await expect(page.getByRole('progressbar', { name: 'Progreso de carga' })).toHaveAttribute('aria-valuenow', '0')
    await expect(page.locator('.loading-progress > span')).toHaveCSS('animation-name', 'none')
    await page.screenshot({ path: info.outputPath(`${role}-loading.png`), fullPage: true })
    mode = 'error'; release()
    await expect(page.getByRole('heading', { name: 'No pudimos cargar tu espacio' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('No pudimos conectar')
    await expect(page.getByRole('button', { name: 'Volver a intentar' })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${role}-connection-error.png`), fullPage: true })
    mode = 'ready'
    await page.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(page.getByRole('heading', { name: role === 'teacher' ? 'Hola, Ana' : 'Asistencia docente', exact: true })).toBeVisible()
    mode = 'error'
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByRole('heading', { name: 'No pudimos cargar tu espacio' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('login, loading and error fit narrow and desktop screens in both themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'One viewport matrix covers all layouts.')
  test.setTimeout(60_000)
  await mockBackend(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/rpc/app_context', async route => {
    await pending
    return route.fulfill({ status: 503, json: { message: 'OFFLINE' } })
  })
  await page.goto('/')
  for (const screen of ['login', 'loading', 'error']) {
    if (screen === 'loading') {
      await enterCredentials(page)
      await expect(page.getByRole('heading', { name: 'Cargando tu espacio…' })).toBeVisible()
    }
    if (screen === 'error') {
      release()
      await expect(page.getByRole('heading', { name: 'No pudimos cargar tu espacio' })).toBeVisible()
    }
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setTheme(page, theme)
      for (const width of [320, 402, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 320 ? 600 : 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const frame = (await page.locator('.public-frame').boundingBox())!
        expect(frame.height + frame.y).toBeGreaterThanOrEqual((width === 320 ? 600 : 900) - 8)
        await expect(page.locator('.public-shell')).toHaveCSS('color-scheme', theme)
        if (width === 402 || width === 1440) await page.screenshot({ path: info.outputPath(`${screen}-${width}-${theme}.png`), fullPage: true })
      }
    }
  }
})

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} progress fills continuously while requests are pending`, async ({ page }, info) => {
    await mockBackend(page, { role })
    await page.goto('/')
    await enterCredentials(page)
    await expect(page.getByRole('heading', { name: role === 'teacher' ? 'Hola, Ana' : 'Asistencia docente', exact: true })).toBeVisible()

    let releaseCode!: () => void
    let releaseAccount!: () => void
    let releaseReport!: () => void
    const code = new Promise<void>(resolve => { releaseCode = resolve })
    const account = new Promise<void>(resolve => { releaseAccount = resolve })
    const report = new Promise<void>(resolve => { releaseReport = resolve })
    await page.route('**/assets/Workspace-*.js', async route => { await code; return route.continue() })
    await page.route('**/rest/v1/rpc/app_context', async route => { await account; return route.fallback() })
    await page.route('**/rest/v1/rpc/attendance_report', async route => { await report; return route.fallback() })
    await page.goto(role === 'teacher' ? '/historial' : '/admin', { waitUntil: 'domcontentloaded' })
    const progress = page.getByRole('progressbar', { name: 'Progreso de carga' })
    await expect(progress).toBeVisible()
    await expect(page.locator('.loading-state svg')).toHaveCount(0)
    const firstValue = Number(await progress.getAttribute('aria-valuenow'))
    expect(firstValue).toBeLessThan(100)
    releaseCode()
    releaseAccount()
    await page.waitForTimeout(250)
    const waitingValue = Number(await progress.getAttribute('aria-valuenow'))
    expect(waitingValue).toBeGreaterThanOrEqual(firstValue)
    expect(waitingValue).toBeLessThan(100)
    const counterValue = Number((await page.locator('.loading-percentage').textContent())?.replace('%', ''))
    expect(Math.abs(counterValue - waitingValue)).toBeLessThanOrEqual(1)
    await expect(page.getByRole('heading', { name: 'Detalle de asistencia', exact: true })).toBeHidden()
    await page.screenshot({ path: info.outputPath(`${role}-real-progress.png`), fullPage: true })
    // Completion is intentionally brief before the panel replaces the loader.
    // Observe it directly instead of polling and potentially missing that frame.
    await progress.evaluate(element => {
      const observer = new MutationObserver(() => {
        if (element.getAttribute('aria-valuenow') === '100') {
          document.documentElement.dataset.loadingCompleted = 'true'
          observer.disconnect()
        }
      })
      observer.observe(element, { attributes: true, attributeFilter: ['aria-valuenow'] })
    })
    releaseReport()
    await expect(page.locator('html')).toHaveAttribute('data-loading-completed', 'true')
    await expect(page.getByRole('heading', { name: 'Detalle de asistencia', exact: true })).toBeVisible()
    await expect(progress).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ver justificación', exact: true })).toBeVisible()
  })
}

test('an initial panel request failure reveals retry instead of leaving progress stuck', async ({ page }) => {
  await mockBackend(page, { role: 'admin' })
  let fail = true
  await page.route('**/rest/v1/rpc/attendance_report', route => fail
    ? route.fulfill({ status: 503, json: { message: 'OFFLINE' } })
    : route.fallback())
  await page.goto('/')
  await enterCredentials(page)
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar')
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('button', { name: 'Ver justificación', exact: true })).toBeVisible()
})
