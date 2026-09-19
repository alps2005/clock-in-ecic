import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const auditTools = createRequire(resolve(process.env.ECIC_AUDIT_TOOLS_DIR ?? '/private/tmp/ecic-ui-audit', 'package.json'))
const { default: puppeteer } = await import(pathToFileURL(auditTools.resolve('puppeteer-core')).href)
const { startFlow } = await import(pathToFileURL(auditTools.resolve('lighthouse')).href)
import { chromium } from 'playwright-core'
import { mockBackend } from '../tests/browser/mock.ts'
const root = resolve('docs/review')
const baseUrl = process.env.ECIC_AUDIT_BASE_URL ?? 'http://127.0.0.1:4174'
const assets = await readdir(resolve('dist/assets'))
const bundles = await Promise.all(assets.filter(name => name.endsWith('.js')).map(name => readFile(resolve('dist/assets', name), 'utf8')))
if (!bundles.some(bundle => bundle.includes('https://ecic-test.supabase.co'))) throw new Error('Build with npm run build:e2e before running this fixture-only audit.')
await mkdir(root, { recursive: true })
const browser = await puppeteer.launch({ executablePath: chromium.executablePath(), headless: true, args: ['--no-sandbox'] })
const pw = await chromium.connectOverCDP(browser.wsEndpoint())
try {
  const context = pw.contexts()[0]
  const page = context.pages()[0]
  await page.setViewportSize({ width: 402, height: 874 })
  await mockBackend(page)
  await page.goto(baseUrl)
  await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL(/\/jornada$/)
  const pp = (await browser.pages())[0]
  const summary = []
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    for (const route of ['jornada', 'historial']) {
      await page.goto(`${baseUrl}/${route}`)
      await page.getByRole('heading', { level: 1 }).waitFor()
      if (route === 'historial') await page.getByRole('heading', { name: 'Detalle de asistencia' }).waitFor()
      const flow = await startFlow(pp, { name: `${route} ${theme} mobile`, flags: { onlyCategories: ['accessibility'], formFactor: 'mobile', screenEmulation: { disabled: true } } })
      await flow.snapshot()
      const result = await flow.createFlowResult()
      const lhr = result.steps[0].lhr
      const failures = Object.values(lhr.audits).filter(a => a.score !== null && a.score < 1).map(a => ({ id: a.id, title: a.title, items: a.details?.items }))
      summary.push({ route, theme, score: lhr.categories.accessibility.score * 100, failures })
      console.log(JSON.stringify(summary.at(-1)))
      await writeFile(`${root}/lighthouse-${route}-${theme}.html`, await flow.generateReport())
    }
  }
  await writeFile(`${root}/accessibility.json`, JSON.stringify(summary, null, 2))
} finally { await pw.close(); await browser.close() }
