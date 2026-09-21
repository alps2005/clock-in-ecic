import { expect, test } from '@playwright/test'
import { mockBackend, signIn } from './mock.ts'

test.use({
  launchOptions: async ({ browserName }, provide) => {
    await provide(browserName === 'chromium'
      ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
      : {})
  },
})

test('serves security headers on SPA deep links and static assets', async ({ request }) => {
  for (const path of ['/', '/jornada', '/admin/docentes', '/theme-init.js', '/favicon.svg']) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    const headers = response.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toBe('camera=(self), microphone=(), geolocation=()')
  }
})

test('restores the saved theme and logs in without CSP violations', async ({ page }) => {
  await mockBackend(page)
  await page.addInitScript(() => {
    localStorage.setItem('ecic-theme', 'dark')
    document.addEventListener('securitypolicyviolation', event => {
      document.documentElement.dataset.cspViolation = `${event.effectiveDirective}: ${event.blockedURI}`
    })
  })
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Activar modo claro' }).filter({ visible: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.locator('html').getAttribute('data-csp-violation')).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hola, Ana', exact: true })).toBeVisible()
  expect(await page.locator('html').getAttribute('data-csp-violation')).toBeNull()
})

test('blocks injected inline scripts, event handlers, external scripts and connections', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      const root = document.documentElement
      root.dataset.blockedDirectives = `${root.dataset.blockedDirectives ?? ''} ${event.effectiveDirective}`
      root.dataset.blockedResources = `${root.dataset.blockedResources ?? ''} ${event.blockedURI}`
    })
  })
  // If CSP regresses these routes would execute successfully, without contacting an external host.
  await page.route('https://untrusted.example/**', route => route.fulfill({
    contentType: 'text/javascript',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: 'document.documentElement.dataset.injectedScript = "executed"',
  }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
  await page.evaluate(async () => {
    const inline = document.createElement('script')
    inline.textContent = 'document.documentElement.dataset.injectedScript = "executed"'
    document.body.append(inline)
    const button = document.createElement('button')
    button.setAttribute('onclick', 'document.documentElement.dataset.injectedHandler = "executed"')
    document.body.append(button)
    button.click()
    const external = document.createElement('script')
    external.src = 'https://untrusted.example/injection.js'
    document.body.append(external)
    try {
      await fetch('https://untrusted.example/collect')
      document.documentElement.dataset.untrustedConnection = 'allowed'
    } catch { /* Expected CSP rejection. */ }
  })
  await expect.poll(() => page.locator('html').getAttribute('data-blocked-directives')).toContain('script-src-elem')
  await expect.poll(() => page.locator('html').getAttribute('data-blocked-directives')).toContain('script-src-attr')
  await expect.poll(() => page.locator('html').getAttribute('data-blocked-directives')).toContain('connect-src')
  await expect.poll(() => page.locator('html').getAttribute('data-blocked-resources')).toContain('https://untrusted.example/injection.js')
  for (const attribute of ['data-injected-script', 'data-injected-handler', 'data-untrusted-connection']) {
    expect(await page.locator('html').getAttribute(attribute)).toBeNull()
  }
})

test('an external page cannot frame the app', async ({ page, baseURL }) => {
  // A distinct local origin avoids private-network protections masking the CSP check.
  const parent = new URL('/framing-test', baseURL)
  parent.hostname = 'localhost'
  // The control proves this setup can load a cross-origin frame when just this directive is absent.
  await page.route('**/admin/docentes?framing=control', async route => {
    const response = await route.fetch()
    const headers = response.headers()
    headers['content-security-policy'] = headers['content-security-policy'].replace("frame-ancestors 'none'", '')
    await route.fulfill({ response, headers })
  })
  await page.route(parent.href, route => route.fulfill({
    contentType: 'text/html',
    body: `<iframe id="control" src="${baseURL}/admin/docentes?framing=control"></iframe>
      <iframe id="protected" src="${baseURL}/admin/docentes"></iframe>`,
  }))
  await page.goto(parent.href)
  await expect(page.frameLocator('#control').getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
  await expect(page.frameLocator('#protected').locator('#root')).toHaveCount(0)
})

test.describe('camera permissions in Chromium', () => {
  test('allows a camera stream and denies microphone and geolocation', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium provides a fake physical camera for this check.')
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const policy = (document as Document & { featurePolicy: { allowsFeature: (name: string, origin?: string) => boolean } }).featurePolicy
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      const tracks = stream.getVideoTracks().length
      stream.getTracks().forEach(track => track.stop())
      return {
        tracks,
        camera: policy.allowsFeature('camera'),
        externalCamera: policy.allowsFeature('camera', 'https://untrusted.example'),
        microphone: policy.allowsFeature('microphone'),
        geolocation: policy.allowsFeature('geolocation'),
      }
    })
    expect(result).toEqual({ tracks: 1, camera: true, externalCamera: false, microphone: false, geolocation: false })
  })
})
