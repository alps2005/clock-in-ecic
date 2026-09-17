import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} navigation adapts to mobile and shares the login footer`, async ({ page }, info) => {
    await mockBackend(page, { role })
    await page.goto('/')
    const footer = await page.locator('.site-footer').innerHTML()
    await signIn(page)
    await expect(page.locator('.ecic-sidebar')).toBeVisible()
    expect(await page.locator('.site-footer').innerHTML()).toBe(footer)
    const toggle = page.locator('.ecic-mobile-user')
    const nav = page.getByRole('navigation', { name: 'Navegación principal' })
    if (info.project.use.isMobile) {
      await expect(toggle).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(nav).toBeHidden()
      await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeHidden()
      const logo = (await page.locator('.ecic-brand-wrap').boundingBox())!
      const profile = (await toggle.boundingBox())!
      expect(profile.x).toBeGreaterThan(logo.x + logo.width)
      expect(Math.abs(profile.y + profile.height / 2 - logo.y - logo.height / 2)).toBeLessThan(2)
      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(nav).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(nav).toBeHidden()
      await expect(toggle).toBeFocused()
      await toggle.tap()
      await page.getByRole('link', { name: role === 'teacher' ? 'Mi historial' : /Notificaciones/ }).click()
      await expect(page).toHaveURL(role === 'teacher' ? /\/historial$/ : /\/admin\/avisos$/)
      await expect(nav).toBeHidden()
      await page.screenshot({ path: info.outputPath(`${role}-mobile.png`), fullPage: true })
    } else {
      await expect(toggle).toBeHidden()
      await expect(nav).toBeVisible()
      await expect(page.locator('.ecic-desktop-user')).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('attendance copy is shared across viewports and fits narrow screens', async ({ page }, info) => {
  await mockBackend(page)
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  const mobile = Boolean(info.project.use.isMobile)
  await expect(page.getByText('Te deseamos una excelente jornada laboral.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tu horario', exact: true })).toHaveCount(1)
  for (const selector of ['.page-heading .eyebrow', '.today', '.schedule-card .card-eyebrow', '.schedule-flower']) {
    await expect(page.locator(selector)).toHaveCount(0)
  }
  if (mobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const selector of ['.ecic-live-clock', '.ecic-topbar-actions']) {
      const box = (await page.locator(selector).boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - 160)).toBeLessThan(2)
    }
    await page.screenshot({ path: info.outputPath('attendance-narrow.png'), fullPage: true })
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(page.getByRole('navigation')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  }
})
