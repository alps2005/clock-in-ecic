import { expect, test } from '@playwright/test'

 test('renders login without browser errors or horizontal overflow', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveTitle('Clock-in ECIC · Asistencia docente')
  await expect(page.getByRole('heading', { level: 1, name: 'Asistencia Docente ECIC' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })
})

test('supports keyboard navigation to main content', async ({ page, browserName }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
  // WebKit on macOS uses Option+Tab to include links in keyboard navigation.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  await expect(page.getByRole('link', { name: 'Ir al contenido' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('preview serves a direct SPA URL on refresh and correct static assets', async ({ page, request }) => {
  await page.goto('/route-smoke-check')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const favicon = await request.get('/favicon.svg')
  expect(favicon.ok()).toBe(true)
  expect(favicon.headers()['content-type']).toContain('image/svg+xml')
  const script = await page.locator('script[src]').getAttribute('src')
  const asset = await request.get(script!)
  expect(asset.ok()).toBe(true)
  expect(asset.headers()['content-type']).toMatch(/javascript/)
})
