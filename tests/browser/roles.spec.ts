import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

test('administrator link opens a username login and keeps MFA enrollment', async ({ page }) => {
  await mockBackend(page, { role: 'admin', mfa: 'enroll' })
  await page.goto('/')
  await page.getByRole('link', { name: 'Entrar como administrador' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByLabel('Cédula', { exact: true })).toHaveCount(0)
  await page.getByLabel('Usuario', { exact: true }).fill('AdminEcic2026')
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
  const request = page.waitForRequest(request => request.url().includes('/auth/v1/token'))
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  expect((await request).postDataJSON()).toMatchObject({ email: 'adminecic2026@admin.clock-in.invalid' })
  await expect(page.getByRole('heading', { name: 'Verificación de administrador' })).toBeVisible()
})

test('principal uses attendance workspace with Director tag and cannot route to admin', async ({ page }) => {
  await mockBackend(page, { role: 'principal' })
  await signIn(page)
  await expect(page.getByRole('button', { name: 'Escanear entrada', exact: true })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Abrir menú de cuenta' })
  if (await menu.isVisible()) await menu.click()
  await expect(page.locator('.teacher-identity').filter({ visible: true })).toContainText('Director')
  await page.goto('/admin/docentes')
  await expect(page).toHaveURL(/\/jornada$/)
  await expect(page.getByRole('link', { name: /^Docentes/ })).toHaveCount(0)
})
