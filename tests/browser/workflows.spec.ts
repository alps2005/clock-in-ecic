import { expect, test } from '@playwright/test'
import { mockBackend, openNavigation, signIn } from './mock.ts'

test('teacher session restores, guards admin routes and clears private UI at logout', async ({ page }, testInfo) => {
  await mockBackend(page)
  await signIn(page)
  await expect(page).toHaveURL(/\/jornada$/)
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('attendance.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/jornada$/)
  await openNavigation(page)
  await page.getByRole('link', { name: 'Mi historial' }).click()
  await expect(page.getByRole('heading', { name: 'Mi historial', exact: true })).toBeVisible()
  await expect(page.getByText('Tus jornadas, en un solo lugar.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Actualizar datos', exact: true })).toBeVisible()
  await expect(page.locator('.teacher-history .eyebrow')).toHaveCount(0)
  await expect(page.locator('.history-summary')).toBeVisible()
  const report = (await page.locator('.history-report').boundingBox())!
  const stats = (await page.locator('.history-summary').boundingBox())!
  expect(stats.y + stats.height).toBeLessThan(report.y)

  await expect(page.getByText('Salida no registrada', { exact: true }).filter({ visible: true })).toBeVisible()
  await openNavigation(page)
  if (await page.getByRole('button', { name: 'Abrir menú de cuenta' }).isVisible()) await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
  await expect(page.getByText('Ana Torres')).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('ecic-pending-attendance'))).toBeNull()
})

test('late justification enforces 250 words and retries the same request after an uncertain result', async ({ page }) => {
  const backend = await mockBackend(page, { time: '2026-09-14T11:40:00.001Z', uncertain: true })
  await signIn(page)
  await expect(page.getByRole('button', { name: /Escanear/ })).toHaveCount(0)
  await expect(page.getByText('06:00–06:40', { exact: true })).toBeVisible()
  await expect(page.getByText('12:40–13:30', { exact: true })).toBeVisible()
  await expect(page.getByText('El escaneo de entrada terminó a las 06:40.', { exact: false })).toBeVisible()
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
  await expect(page.getByRole('alert')).toContainText('El acceso a la cámara está bloqueado')
  await expect(page.getByRole('button', { name: 'Reintentar cámara' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('admins see reports and missed-exit notices, filter results and cannot enter teacher routes', async ({ page }) => {
  await mockBackend(page, { role: 'admin', time: '2026-09-14T18:31:00Z' })
  await signIn(page)
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('link', { name: 'Ana Torres', exact: true }).filter({ visible: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver justificación' }).click()
  await expect(page.getByRole('dialog')).toContainText('El transporte tuvo un retraso.')
  await page.getByRole('button', { name: 'Cerrar justificación' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel(/^Docente$/i).fill('Nadie')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.getByRole('heading', { name: 'No hay registros en este rango' })).toBeVisible()
  await openNavigation(page)
  await page.getByRole('link', { name: /Notificaciones/ }).click()
  await expect(page.getByRole('heading', { name: 'Ana Torres' })).toBeVisible()
  await page.goto('/jornada')
  await expect(page).toHaveURL(/\/admin$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('missing exit locks the scanner and reports the admin notice', async ({ page }) => {
  await mockBackend(page, { time: '2026-09-14T18:31:00Z', events: [{ id: 'entry', teacher_id: 'teacher', kind: 'entry', occurred_at: '2026-09-14T11:30:00Z', school_date: '2026-09-14', sequence_no: 1, justification: null, request_id: 'prior' }] })
  await signIn(page)
  await expect(page.getByText('La ventana de salida ya cerró', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Escanear/ })).toHaveCount(0)
  await expect(page.getByText('La administración tiene una notificación', { exact: false })).toBeVisible()
})

test('camera recovers from denied permission, shows scan boundary, decodes a real QR and releases its tracks', async ({ page }, testInfo) => {
  const { default: QRCode } = await import('qrcode')
  const payload = 'ecic:test-only:0000000000000000000000000000000000000000000000000000'
  const qrImage = await QRCode.toDataURL(payload, { width: 300, margin: 4 })
  const backend = await mockBackend(page)
  await page.addInitScript(({ qrImage }) => {
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { configurable: true, value: async (constraints: MediaStreamConstraints) => {
      const attempts = Number(document.documentElement.dataset.cameraAttempts ?? 0) + 1
      document.documentElement.dataset.cameraAttempts = String(attempts)
      document.documentElement.dataset.cameraConstraints = JSON.stringify(constraints)
      if (attempts === 1) throw new DOMException('Denied', 'NotAllowedError')
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 640
      const context = canvas.getContext('2d')!
      const image = new Image()
      image.src = qrImage
      await image.decode()
      let showQr = false
      window.addEventListener('show-test-qr', () => { showQr = true }, { once: true })
      const draw = () => { context.fillStyle = 'white'; context.fillRect(0,0,640,640); if (showQr) context.drawImage(image,170,170,300,300) }
      draw()
      const stream = canvas.captureStream(10)
      const timer = window.setInterval(draw, 100)
      const stop = MediaStreamTrack.prototype.stop
      Object.defineProperty(MediaStreamTrack.prototype, 'stop', { configurable: true, value: function (this: MediaStreamTrack) {
        clearInterval(timer); stop.call(this); document.documentElement.dataset.cameraStopped = 'true'
      } })
      return stream
    } })
  }, { qrImage })
  await signIn(page)
  await page.getByRole('button', { name: 'Escanear entrada' }).click()
  await expect(page.getByRole('alert')).toContainText('El acceso a la cámara está bloqueado')
  expect(await page.evaluate(() => document.documentElement.dataset.cameraAttempts)).toBe('1')
  if (testInfo.project.use.isMobile) {
    await page.getByRole('button', { name: 'Reintentar cámara' }).tap()
  } else {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Reintentar cámara' })).toBeFocused()
    await page.keyboard.press('Enter')
  }
  const boundary = page.locator('.scanner-region')
  await expect(boundary).toBeVisible()
  await expect.poll(async () => {
    const frame = (await boundary.boundingBox())!
    const camera = (await page.getByLabel('Vista de la cámara').boundingBox())!
    return Math.abs(frame.width / camera.width - 427 / 640)
  }).toBeLessThan(0.01)
  const frame = (await boundary.boundingBox())!
  const camera = (await page.getByLabel('Vista de la cámara').boundingBox())!
  expect(Math.abs(frame.x + frame.width / 2 - camera.x - camera.width / 2)).toBeLessThan(2)
  expect(Math.abs(frame.y + frame.height / 2 - camera.y - camera.height / 2)).toBeLessThan(2)
  expect(backend.requests).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('scanner-boundary.png') })
  await page.evaluate(() => window.dispatchEvent(new Event('show-test-qr')))
  await expect(page.getByText('Tu entrada se registró correctamente.')).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => document.documentElement.dataset.cameraAttempts)).toBe('2')
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.cameraConstraints!))).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.cameraStopped)).toBe('true')
  expect(backend.requests).toHaveLength(1)
  expect(backend.requests[0].p_qr).toBe(payload)
})

test('a disabled session cannot restore teacher data', async ({ page }) => {
  const backend = await mockBackend(page)
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  backend.disable()
  await page.reload()
  await expect(page.getByText('Tu cuenta no tiene acceso.', { exact: false })).toBeVisible()
  await expect(page.getByText('Ana Torres')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Escanear/ })).toHaveCount(0)
})


test('insecure mobile address explains HTTPS instead of requesting permission', async ({ page }) => {
  await mockBackend(page)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false })
    navigator.mediaDevices.getUserMedia = async () => {
      document.documentElement.dataset.cameraRequested = 'true'
      throw new Error('Camera should not be requested over HTTP')
    }
  })
  await signIn(page)
  await page.getByRole('button', { name: 'Escanear entrada' }).click()
  await expect(page.getByRole('alert')).toContainText('La cámara necesita una conexión segura (HTTPS)')
  await expect(page.getByRole('button', { name: 'Reintentar cámara' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.dataset.cameraRequested)).toBeUndefined()
})

test('closing while permission is pending releases a subsequently granted camera', async ({ page }) => {
  await mockBackend(page)
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      document.documentElement.dataset.cameraRequested = 'true'
      window.addEventListener('grant-test-camera', () => {
        const canvas = document.createElement('canvas')
        const stream = canvas.captureStream(10)
        const track = stream.getVideoTracks()[0]
        const stop = track.stop.bind(track)
        track.stop = () => { stop(); document.documentElement.dataset.cameraStopped = 'true' }
        resolve(stream)
      }, { once: true })
    })
  })
  await signIn(page)
  await page.getByRole('button', { name: 'Escanear entrada' }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.cameraRequested)).toBe('true')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('grant-test-camera')))
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.cameraStopped)).toBe('true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})


test('exit scanner opens at 12:40 Ecuador time', async ({ page }) => {
  await mockBackend(page, { time: '2026-09-14T17:40:00Z', events: [{ id: 'entry', teacher_id: 'teacher', kind: 'entry', occurred_at: '2026-09-14T11:30:00Z', school_date: '2026-09-14', sequence_no: 1, justification: null, request_id: 'prior' }] })
  await signIn(page)
  await expect(page.getByRole('button', { name: 'Escanear salida' })).toBeEnabled()
  await expect(page.getByText('12:40–13:30', { exact: true })).toBeVisible()
})
