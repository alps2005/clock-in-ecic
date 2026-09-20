import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

test('admin uses the shared sidebar, mobile tabs and account menu', async ({ page }, info) => {
  await mockBackend(page, { role: 'admin' })
  await signIn(page)
  const nav = page.getByRole('navigation', { name: info.project.use.isMobile ? 'Navegación móvil' : 'Navegación principal' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveCount(3)
  if (info.project.use.isMobile) {
    await expect(page.locator('.teacher-sidebar')).toBeHidden()
    const toggle = page.getByRole('button', { name: 'Abrir menú de cuenta' })
    await toggle.click()
    await expect(page.locator('#teacher-account')).toBeVisible()
    await expect(page.locator('#teacher-account')).toContainText('Administrador')
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
  } else {
    await expect(page.locator('.teacher-sidebar')).toBeVisible()
    await expect(page.locator('.teacher-sidebar-footer')).toContainText('Administrador')
    await page.getByRole('button', { name: 'Alternar barra lateral' }).click()
    await expect(nav).toBeHidden()
    await page.getByRole('button', { name: 'Alternar barra lateral' }).click()
  }
  await nav.getByRole('link', { name: /Notificaciones/ }).click()
  await expect(page).toHaveURL(/\/admin\/avisos$/)
  await expect(page.getByRole('heading', { name: 'Notificaciones', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar datos' }).click()
  await expect(page.locator('.toast')).toHaveText('Datos actualizados')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

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
    await page.screenshot({ path: info.outputPath('attendance-narrow.png'), fullPage: true })
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  }
})
