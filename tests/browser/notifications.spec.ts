import { expect, test } from '@playwright/test'
import { mockBackend, signIn, setTheme } from './mock.ts'

async function openInbox(page: import('@playwright/test').Page) {
  const backend = await mockBackend(page, { role: 'admin' })
  await signIn(page)
  await page.getByRole('link', { name: /Notificaciones/ }).filter({ visible: true }).click()
  await expect(page.locator('.notification-item')).toBeVisible()
  return backend
}

test('table/gallery summaries open full details and only closing marks read across reloads', async ({ page }, info) => {
  const backend = await openInbox(page)
  const item = page.locator('.notification-item')
  await expect(page.getByRole('button', { name: 'Tabla', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Ventanas de registro incumplidas')).toHaveCount(0)
  await expect(page.getByText('1 avisos')).toHaveCount(0)
  await expect(item).toContainText('Sin leer')
  await expect(item).not.toContainText('0000000001')
  await expect(item).not.toContainText('El horario de salida')
  await page.getByRole('button', { name: 'Galería', exact: true }).click()
  await expect(page.locator('.notification-gallery')).toBeVisible()
  await item.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('0000000001')
  await expect(dialog).toContainText('06:30')
  await expect(dialog).toContainText('El horario de salida terminó a las 13:30.')
  expect(backend.protectedRequests.filter(path => path.endsWith('/admin_read_notification'))).toHaveLength(0)
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Cerrar notificación' })).toBeFocused()
  await page.screenshot({ path: info.outputPath('notification-details.png'), fullPage: true, animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(item).toBeFocused()
  await expect(item).toContainText('Leído')
  await expect(page.getByRole('link', { name: /Notificaciones/ }).filter({ visible: true }).locator('.nav-count')).toHaveText('0')
  await page.reload()
  await expect(item).toContainText('Leído')
  await item.click()
  await expect(dialog).toContainText('Se eliminará el')
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(backend.protectedRequests.filter(path => path.endsWith('/admin_read_notification'))).toHaveLength(1)
  await setTheme(page, 'dark')
  await page.getByRole('button', { name: 'Galería', exact: true }).click()
  await page.screenshot({ path: info.outputPath('notification-gallery-dark.png'), fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('failed read saves remain visible and can be retried without losing the notification', async ({ page }) => {
  await openInbox(page)
  let failures = 0
  await page.route('**/rest/v1/rpc/admin_read_notification', async route => {
    if (failures++ === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) })
    return route.fallback()
  })
  await page.locator('.notification-item').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Cerrar notificación' }).click()
  await expect(dialog.getByRole('alert')).toContainText('No se pudo marcar como leído')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.notification-item')).toContainText('Leído')
})

test('backdrop dismissal also saves the read state', async ({ page }) => {
  await openInbox(page)
  await page.locator('.notification-item').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.notification-item')).toContainText('Leído')
})

test('gallery wraps multiple notices and entry details stay out of summaries', async ({ page }, info) => {
  await openInbox(page)
  await page.route('**/rest/v1/rpc/admin_notifications', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    total: 8, unread: 8, rows: Array.from({ length: 8 }, (_, index) => ({
      id: `notice-${index}`, teacher_id: `teacher-${index}`, full_name: index % 2 ? 'María Fernanda Rodríguez' : 'Ana Torres',
      cedula: '0929598019', school_date: '2026-09-14', kind: index % 2 ? 'exit' : 'entry',
      entry_at: '2026-09-14T13:51:00Z', read_at: null, expires_at: null, entry_closes: '06:40:00', exit_closes: '14:15:00',
    })),
  }) }))
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(page.locator('.notification-item')).toHaveCount(8)
  await page.screenshot({ path: info.outputPath('notification-table.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Galería', exact: true }).click()
  await expect(page.locator('.notification-gallery .notification-item')).toHaveCount(8)
  await setTheme(page, 'dark')
  await page.screenshot({ path: info.outputPath('notification-gallery-eight.png'), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.notification-item').first().click()
  await expect(page.getByRole('dialog')).toContainText('No se registró una entrada dentro del horario vigente para ese día.')
  await expect(page.getByRole('dialog')).toContainText('08:51')
  await expect(page.getByRole('dialog')).toContainText('0929598019')
})

test('expiry on the last page returns to the remaining page and empty states keep view controls', async ({ page }) => {
  await openInbox(page)
  let expired = false
  await page.route('**/rest/v1/rpc/admin_notifications', async route => {
    if (expired) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ total: 0, unread: 0, rows: [] }) })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ total: 26, unread: 26, rows: [{
      id: 'notice', teacher_id: 'teacher', full_name: 'Ana Torres', cedula: '0000000001', school_date: '2026-09-14',
      kind: 'exit', entry_at: null, read_at: null, expires_at: null, entry_closes: '06:40:00', exit_closes: '13:30:00',
    }] }) })
  })
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.locator('.pager')).toContainText('Página 2 de 2')
  expired = true
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(page.locator('.pager')).toContainText('Página 1 de 1')
  await expect(page.getByRole('heading', { name: 'Todo al día' })).toBeVisible()
  await page.getByRole('button', { name: 'Galería', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Galería', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
