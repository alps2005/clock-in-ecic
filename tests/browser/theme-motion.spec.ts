import { expect, test } from '@playwright/test'
import { mockBackend, setTheme, signIn } from './mock.ts'

for (const role of ['teacher', 'admin'] as const) {
  test(`${role} theme persists through login, loading, dialogs, reload and logout`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await mockBackend(page, { role })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.public-shell')).toHaveCSS('color-scheme', 'light')
    await setTheme(page, 'dark')
    await expect(page.locator('.public-frame')).toHaveCSS('background-color', 'rgb(24, 29, 33)')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/rest/v1/rpc/app_context', async route => { await pending; return route.fallback() })
    await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
    await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expect(page.getByRole('progressbar')).toBeVisible()
    await expect(page.locator('.public-frame')).toHaveCSS('background-color', 'rgb(24, 29, 33)')
    await setTheme(page, 'light')
    await expect(page.locator('.public-frame')).toHaveCSS('background-color', 'rgb(250, 251, 252)')
    release()
    await expect(page.locator('.teacher-shell')).toBeVisible()
    await expect(page.locator('.teacher-frame')).toHaveCSS('background-color', 'rgb(250, 251, 252)')
    if (role === 'teacher') await page.goto('/historial')
    await setTheme(page, 'dark')
    await page.getByRole('button', { name: 'Exportar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(30, 36, 41)')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Exportar', exact: true })).toBeFocused()
    await setTheme(page, 'light')
    await page.getByRole('button', { name: 'Exportar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    if (info.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
}

test('sidebar sweeps through intermediate widths and dialogs animate out before restoring focus', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chromium', 'Desktop sidebar only.')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await mockBackend(page)
  await signIn(page)
  const toggle = page.getByRole('button', { name: 'Alternar barra lateral' })
  await toggle.click()
  const shell = page.locator('.teacher-shell')
  const sweep = await shell.evaluate(async element => {
    const transition = element.getAnimations().find(animation => 'transitionProperty' in animation && animation.transitionProperty === 'grid-template-columns')!
    transition.pause()
    transition.currentTime = 140
    await new Promise(requestAnimationFrame)
    const width = parseFloat(getComputedStyle(element).gridTemplateColumns)
    transition.finish()
    return width
  })
  expect(sweep).toBeGreaterThan(0)
  expect(sweep).toBeLessThan(256)
  await expect(page.locator('.teacher-sidebar')).toBeHidden()
  await expect(page.locator('.teacher-sidebar')).toHaveAttribute('inert', '')
  await toggle.click()
  await expect(page.locator('.teacher-sidebar')).toBeVisible()
  await page.goto('/historial')
  await page.getByRole('button', { name: 'Ver justificación', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveCSS('animation-name', 'dialog-in')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveAttribute('data-closing', 'true')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ver justificación', exact: true })).toBeFocused()
})

test('reduced motion disables transitions, and theme remains usable without storage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage disabled') }
    Storage.prototype.setItem = () => { throw new Error('Storage disabled') }
  })
  await mockBackend(page)
  await page.goto('/')
  await setTheme(page, 'dark')
  await expect(page.locator('.public-frame')).toHaveCSS('background-color', 'rgb(24, 29, 33)')
  await expect(page.locator('.public-frame')).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('.theme-toggle-icon')).toHaveCSS('animation-name', 'none')
})

test('theme changes interpolate colors and synchronize across tabs', async ({ page, context }) => {
  await mockBackend(page)
  await page.goto('/')
  const other = await context.newPage()
  await mockBackend(other)
  await other.goto('/')
  await setTheme(page, 'dark')
  const intermediate = await page.locator('.public-frame').evaluate(async element => {
    const animations = document.documentElement.getAnimations()
    for (const animation of animations) { animation.pause(); animation.currentTime = 120 }
    await new Promise(requestAnimationFrame)
    const color = getComputedStyle(element).backgroundColor
    animations.forEach(animation => animation.finish())
    return color
  })
  expect(intermediate).not.toBe('rgb(250, 251, 252)')
  expect(intermediate).not.toBe('rgb(24, 29, 33)')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(other.getByRole('button', { name: 'Activar modo claro' })).toBeVisible()
  await other.close()
})

test('a theme change settles once without trailing text or icon animations', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Asistencia Docente ECIC' })).toBeVisible()
  await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
  const result = await page.evaluate(async () => {
    const changes: string[] = []
    const root = document.documentElement
    const observer = new MutationObserver(() => changes.push(root.dataset.theme!))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    document.querySelector<HTMLButtonElement>('.theme-toggle')!.click()
    await new Promise(resolve => setTimeout(resolve, 500))
    const heading = document.querySelector('#login-title')!
    const active = document.getAnimations().filter(animation => animation.playState === 'running').map(animation => ({
      property: 'transitionProperty' in animation ? animation.transitionProperty : 'animation',
      element: (animation.effect as KeyframeEffect).target instanceof Element ? ((animation.effect as KeyframeEffect).target as Element).tagName : '',
    }))
    observer.disconnect()
    return { changes, active, heading: getComputedStyle(heading).color, foreground: getComputedStyle(root).getPropertyValue('--foreground').trim() }
  })
  expect(result.changes).toEqual(['dark'])
  expect(result.active).toEqual([])
  expect(result.heading).toBe('rgb(232, 237, 240)')
})

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} login reload paints the saved palette without replaying fades`, async ({ page }) => {
    await mockBackend(page)
    await page.addInitScript(saved => {
      localStorage.setItem('ecic-theme', saved)
      const frames: { theme?: string; background: string; iconOpacity?: string; cardOpacity?: string }[] = []
      Object.assign(window, { themeFrames: frames })
      const sample = () => {
        const icon = document.querySelector(`.theme-toggle-${saved === 'dark' ? 'sun' : 'moon'}`)
        const card = document.querySelector('.auth-card')
        if (document.documentElement.dataset.theme) frames.push({
          theme: document.documentElement.dataset.theme,
          background: getComputedStyle(document.documentElement).backgroundColor,
          iconOpacity: icon ? getComputedStyle(icon).opacity : undefined,
          cardOpacity: card ? getComputedStyle(card).opacity : undefined,
        })
        if (frames.length < 120) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }, theme)
    await page.goto('/')
    await expect(page.locator('.auth-card')).toBeVisible()
    await page.reload()
    await expect(page.locator('.auth-card')).toBeVisible()
    await page.waitForTimeout(350)
    const frames = await page.evaluate(() => (window as unknown as { themeFrames: { theme: string; background: string; iconOpacity?: string; cardOpacity?: string }[] }).themeFrames)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every(frame => frame.theme === theme)).toBe(true)
    expect(frames.every(frame => frame.background === (theme === 'dark' ? 'rgb(24, 29, 33)' : 'rgb(250, 251, 252)'))).toBe(true)
    expect(frames.filter(frame => frame.iconOpacity !== undefined).every(frame => frame.iconOpacity === '1')).toBe(true)
    expect(frames.filter(frame => frame.cardOpacity !== undefined).every(frame => frame.cardOpacity === '1')).toBe(true)
    await expect(page.locator('html')).not.toHaveAttribute('data-theme-animated')
  })
}
