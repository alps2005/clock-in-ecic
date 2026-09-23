import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

async function passwordLogin(page: Page, path = '/') {
  await page.goto(path)
  await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verificación de administrador' })).toBeVisible()
}

test('first admin sign-in requires enrollment and a valid code before loading private data', async ({ page }) => {
  const backend = await mockBackend(page, { role: 'admin', mfa: 'enroll' })
  const violations: string[] = []
  await page.exposeFunction('recordMfaCspViolation', (directive: string) => violations.push(directive))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      void (window as unknown as { recordMfaCspViolation: (directive: string) => Promise<void> }).recordMfaCspViolation(event.effectiveDirective)
    })
  })
  await passwordLogin(page)
  expect(backend.protectedRequests.every(path => path.endsWith('/app_context'))).toBe(true)
  await expect(page.getByText('Ana Torres', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Configurar autenticador' }).click()
  const qr = page.getByRole('img', { name: 'Código QR para vincular tu autenticador' })
  await expect(qr).toBeVisible()
  await expect.poll(() => qr.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.getByText('Ingresar clave manualmente', { exact: true }).click()
  await expect(page.locator('.mfa-secret')).toHaveText('JBSWY3DPEHPK3PXP')
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('JBSWY3DPEHPK3PXP')
  await page.getByLabel('Código de autenticación', { exact: true }).fill('000000')
  await page.getByRole('button', { name: 'Verificar y continuar' }).click()
  await expect(page.getByRole('alert')).toContainText('No pudimos verificar el código')
  await expect(page.getByLabel('Código de autenticación', { exact: true })).toHaveValue('')
  expect(backend.protectedRequests.every(path => path.endsWith('/app_context'))).toBe(true)
  await page.getByLabel('Código de autenticación', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verificar y continuar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.locator('.teacher-shell')).toBeVisible()
  await expect(qr).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.teacher-shell')).toBeVisible()
  const accountMenu = page.getByRole('button', { name: 'Abrir menú de cuenta' })
  if (await accountMenu.isVisible()) await accountMenu.click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await passwordLogin(page)
  await expect(page.getByLabel('Código de autenticación', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Configurar autenticador' })).toHaveCount(0)
  expect(violations).toEqual([])
})

test('an enrolled admin must verify after password login and can resume a deep link', async ({ page }) => {
  const backend = await mockBackend(page, { role: 'admin', mfa: 'verify' })
  await passwordLogin(page, '/admin/avisos')
  await expect(page.getByRole('button', { name: 'Configurar autenticador' })).toHaveCount(0)
  await expect(page.getByLabel('Código de autenticación', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Verificación de administrador' })).toBeVisible()
  await page.getByLabel('Código de autenticación', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verificar y continuar' }).click()
  await expect(page.getByRole('button', { name: /Ana Torres/ })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/avisos$/)
  expect(backend.mfaRequests.some(path => path === 'POST /auth/v1/factors')).toBe(false)
})

test('abandoned enrollment can restart after reload, and logout remains available before MFA', async ({ page }) => {
  const backend = await mockBackend(page, { role: 'admin', mfa: 'stale' })
  await passwordLogin(page)
  await page.getByRole('button', { name: 'Configurar autenticador' }).click()
  await expect(page.getByRole('img', { name: 'Código QR para vincular tu autenticador' })).toBeVisible()
  expect(backend.mfaRequests[0]).toMatch(/^DELETE /)
  await page.reload()
  await page.getByRole('button', { name: 'Configurar autenticador' }).click()
  await expect(page.getByRole('img', { name: 'Código QR para vincular tu autenticador' })).toBeVisible()
  expect(backend.mfaRequests.filter(path => path.startsWith('DELETE '))).toHaveLength(2)
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
  await expect(page.locator('.mfa-secret')).toHaveCount(0)
})

test('teachers continue to sign in without MFA', async ({ page }) => {
  const backend = await mockBackend(page)
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  expect(backend.mfaRequests).toEqual([])
})

test('a failed factor lookup stays locked and can be retried', async ({ page }) => {
  const backend = await mockBackend(page, { role: 'admin', mfa: 'verify' })
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ msg: 'Temporary failure' }) }))
  await passwordLogin(page)
  await expect(page.getByRole('alert')).toContainText('No pudimos consultar tu autenticador')
  await expect(page.getByRole('button', { name: 'Configurar autenticador' })).toHaveCount(0)
  expect(backend.protectedRequests.every(path => path.endsWith('/app_context'))).toBe(true)
  await page.unroute('**/auth/v1/user')
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByLabel('Código de autenticación', { exact: true })).toBeVisible()
})
