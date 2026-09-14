import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'
import type { TeacherAccount, TeacherMutation } from '../../src/types/app.ts'

test('administrator creates, edits, resets and disables a teacher while retaining the history link', async ({ page }, info) => {
  await mockBackend(page, { role: 'admin' })
  const accounts: TeacherAccount[] = []
  const requests: TeacherMutation[] = []
  await page.route('**/rest/v1/rpc/admin_teachers', route => route.fulfill({ json: { total: accounts.length, rows: accounts } }))
  await page.route('**/functions/v1/admin-teachers', async route => {
    const input = route.request().postDataJSON() as TeacherMutation
    requests.push(input)
    if (input.action === 'create') accounts.push({ id: '20000000-0000-0000-0000-000000000009', full_name: input.full_name!, cedula: input.cedula!, active: true, employed_from: input.employed_from!, employed_until: null })
    else if (input.action === 'update') Object.assign(accounts[0], { full_name: input.full_name, cedula: input.cedula, active: input.active, employed_from: input.employed_from, employed_until: input.employed_until })
    else if (input.action === 'disable') Object.assign(accounts[0], { active: false, employed_until: input.employed_until })
    await route.fulfill({ json: { ok: true, id: accounts[0].id } })
  })
  await signIn(page)
  await page.getByRole('link', { name: 'Docentes', exact: true }).click()
  await page.getByRole('button', { name: 'Crear docente', exact: true }).click()
  await page.getByLabel('Nombre completo', { exact: true }).fill('Docente de prueba')
  await page.getByLabel('C.I.', { exact: true }).fill('0000000009')
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('FixturePassword2026!')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Cambio guardado')
  await expect(page.getByRole('cell', { name: /Docente de prueba/ })).toBeVisible()
  expect(requests[0]).toMatchObject({ action: 'create', cedula: '0000000009', employed_from: '2026-09-14' })
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByLabel('Nombre completo', { exact: true }).fill('Docente actualizado')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('cell', { name: /Docente actualizado/ })).toBeVisible()
  await page.getByRole('button', { name: 'Restablecer contraseña', exact: true }).click()
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('SecondFixture2026!')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveCount(0)
  expect(requests[2]).toMatchObject({ action: 'reset-password', password: 'SecondFixture2026!' })
  await page.getByRole('button', { name: 'Eliminar acceso', exact: true }).click()
  await expect(page.getByText(/Su historial de asistencia se conservará/)).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar eliminación de acceso' }).click()
  await expect(page.getByText('Inactivo', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Eliminar acceso', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('teachers.png'), fullPage: true })
  await page.getByRole('link', { name: 'Historial', exact: true }).click()
  await expect(page.getByLabel('Docente', { exact: true })).toHaveValue('0000000009')
})

test('teacher cannot enter the account management screen', async ({ page }) => {
  await mockBackend(page)
  await signIn(page)
  await expect(page).toHaveURL(/\/jornada$/)
  await page.goto('/admin/docentes')
  await expect(page).toHaveURL(/\/jornada$/)
  await expect(page.getByRole('button', { name: 'Crear docente', exact: true })).toHaveCount(0)
})
