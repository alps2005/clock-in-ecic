import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

test('teacher session restores, guards admin routes and clears private UI at logout', async ({ page }, testInfo) => {
  await mockBackend(page)
  await signIn(page)
  await expect(page).toHaveURL(/\/jornada$/)
  await expect(page.getByRole('heading', { name: 'Hola, Ana.' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('attendance.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hola, Ana.' })).toBeVisible()
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/jornada$/)
  await page.getByRole('link', { name: 'Mi historial' }).click()
  await expect(page.getByRole('heading', { name: 'Mi historial.' })).toBeVisible()
  await expect(page.getByText('Salida no registrada', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Inicia tu jornada.' })).toBeVisible()
  await expect(page.getByText('Ana Torres')).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('ecic-pending-attendance'))).toBeNull()
})

test('late justification enforces 250 words and retries the same request after an uncertain result', async ({ page }) => {
  const backend = await mockBackend(page, { time: '2026-09-14T11:46:00Z', uncertain: true })
  await signIn(page)
  await expect(page.getByRole('button', { name: /Escanear/ })).toHaveCount(0)
  await page.getByLabel('Justificación', { exact: true }).fill('palabra '.repeat(251))
  await expect(page.getByRole('button', { name: 'Registrar entrada con justificación' })).toBeDisabled()
  await page.getByLabel('Justificación', { exact: true }).fill('El transporte tuvo un retraso.')
  await page.getByRole('button', { name: 'Registrar entrada con justificación' }).click()
  await expect(page.getByRole('button', { name: 'Comprobar registro' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Comprobar registro' }).click()
  await expect(page.getByText('Tu entrada se registró correctamente.')).toBeVisible()
  expect(backend.requests).toHaveLength(2)
  expect(backend.requests[0].p_request_id).toBe(backend.requests[1].p_request_id)
  expect(backend.events).toHaveLength(1)
})

test('camera permission failure is clear and dialog closes with Escape', async ({ page }) => {
  await mockBackend(page)
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
  })
  await signIn(page)
  await page.getByRole('button', { name: 'Escanear entrada' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText(/No pudimos abrir la cámara/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('admins see reports and missed-exit notices, filter results and cannot enter teacher routes', async ({ page }) => {
  await mockBackend(page, { role: 'admin', time: '2026-09-14T18:31:00Z' })
  await signIn(page)
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('cell', { name: /Ana Torres/ })).toBeVisible()
  await page.getByLabel('Docente', { exact: true }).fill('Nadie')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.getByRole('heading', { name: 'No hay registros para esta consulta' })).toBeVisible()
  await page.getByRole('link', { name: /Notificaciones/ }).click()
  await expect(page.getByRole('heading', { name: 'Ana Torres' })).toBeVisible()
  await page.goto('/jornada')
  await expect(page).toHaveURL(/\/admin$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('missing exit locks the scanner and reports the admin notice', async ({ page }) => {
  await mockBackend(page, { time: '2026-09-14T18:31:00Z', events: [{ id: 'entry', teacher_id: 'teacher', kind: 'entry', occurred_at: '2026-09-14T11:30:00Z', school_date: '2026-09-14', sequence_no: 1, justification: null, request_id: 'prior' }] })
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Salida no registrada' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Escanear/ })).toHaveCount(0)
  await expect(page.getByText('La administración tiene una notificación', { exact: false })).toBeVisible()
})

test('camera decodes a real QR image, records once and releases its tracks', async ({ page }) => {
  const { default: QRCode } = await import('qrcode')
  const payload = 'ecic:test-only:0000000000000000000000000000000000000000000000000000'
  const qrImage = await QRCode.toDataURL(payload, { width: 300, margin: 4 })
  const backend = await mockBackend(page)
  await page.addInitScript(({ qrImage }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 640
      const context = canvas.getContext('2d')!
      const image = new Image()
      image.src = qrImage
      await image.decode()
      const draw = () => { context.fillStyle = 'white'; context.fillRect(0,0,640,640); context.drawImage(image,170,170,300,300) }
      draw()
      const stream = canvas.captureStream(10)
      const timer = window.setInterval(draw, 100)
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => { clearInterval(timer); stop(); document.documentElement.dataset.cameraStopped = 'true' }
      }
      return stream
    }
  }, { qrImage })
  await signIn(page)
  await page.getByRole('button', { name: 'Escanear entrada' }).click()
  await expect(page.getByText('Tu entrada se registró correctamente.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.cameraStopped)).toBe('true')
  expect(backend.requests).toHaveLength(1)
  expect(backend.requests[0].p_qr).toBe(payload)
})

test('a disabled session cannot restore teacher data', async ({ page }) => {
  const backend = await mockBackend(page)
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Hola, Ana.' })).toBeVisible()
  backend.disable()
  await page.reload()
  await expect(page.getByText('Tu cuenta no tiene acceso.', { exact: false })).toBeVisible()
  await expect(page.getByText('Ana Torres')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Escanear/ })).toHaveCount(0)
})
