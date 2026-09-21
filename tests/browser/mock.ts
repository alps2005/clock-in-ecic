import type { Page } from '@playwright/test'
import type { AppContext, AttendanceEvent, Report, ReportRow } from '../../src/types/app.ts'

export async function mockBackend(page: Page, options: { role?: AppContext['profile']['role']; schoolDate?: string; time?: string; uncertain?: boolean; events?: AttendanceEvent[]; mfa?: 'enroll' | 'verify' | 'stale' } = {}) {
  const role = options.role ?? 'teacher'
  const userId = role !== 'admin' ? '10000000-0000-0000-0000-000000000001' : '10000000-0000-0000-0000-000000000003'
  const profileId = role !== 'admin' ? '20000000-0000-0000-0000-000000000001' : '20000000-0000-0000-0000-000000000003'
  const events: AttendanceEvent[] = [...(options.events ?? [])]
  const requests: Record<string, unknown>[] = []
  const protectedRequests: string[] = []
  const mfaRequests: string[] = []
  const factorId = '30000000-0000-0000-0000-000000000001'
  const factors: { id: string; factor_type: 'totp'; status: 'verified' | 'unverified'; friendly_name: string; created_at: string; updated_at: string }[] = options.mfa === 'verify' || options.mfa === 'stale'
    ? [{ id: factorId, factor_type: 'totp', status: options.mfa === 'verify' ? 'verified' : 'unverified', friendly_name: 'Clock-in ECIC', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }] : []
  // Existing workspace tests start with an already verified admin session.
  let aal = role === 'admin' && !options.mfa ? 'aal2' : 'aal1'
  let lost = false
  let inactive = false
  let schoolDate = options.schoolDate ?? '2026-09-14'
  const serverTime = options.time ?? '2026-09-14T11:30:00Z'
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: '0000000001@login.clock-in.invalid', app_metadata: { ecic_session_version: 1 }, user_metadata: {}, factors, created_at: '2026-09-01T00:00:00Z' }
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const session = () => ({ access_token: `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: userId, role: 'authenticated', aal, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), app_metadata: user.app_metadata })}.test-signature`, token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh', user })
  await page.route('https://ecic-test.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const json = (body: unknown, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/token') {
      if (options.mfa && url.searchParams.get('grant_type') === 'password') aal = 'aal1'
      return json(session())
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/user') return json(user)
    if (url.pathname.startsWith('/auth/v1/factors')) {
      mfaRequests.push(`${route.request().method()} ${url.pathname}`)
      if (route.request().method() === 'DELETE') {
        const index = factors.findIndex(factor => url.pathname.endsWith(factor.id))
        if (index >= 0) factors.splice(index, 1)
        return json({ id: factorId })
      }
      if (url.pathname === '/auth/v1/factors') {
        factors.push({ id: factorId, factor_type: 'totp', status: 'unverified', friendly_name: 'Clock-in ECIC', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' })
        const { default: QRCode } = await import('qrcode')
        const secret = 'JBSWY3DPEHPK3PXP'
        const uri = `otpauth://totp/Clock-in%20ECIC:fixture?secret=${secret}&issuer=Clock-in%20ECIC`
        return json({ id: factorId, type: 'totp', totp: { secret, uri, qr_code: await QRCode.toString(uri, { type: 'svg' }) } })
      }
      if (url.pathname.endsWith('/challenge')) return json({ id: 'test-challenge', type: 'totp', expires_at: Math.floor(Date.now()/1000) + 300 })
      if (url.pathname.endsWith('/verify')) {
        if (route.request().postDataJSON().code !== '123456') return json({ code: 'mfa_verification_failed', msg: 'Invalid test code' }, 422)
        factors[0].status = 'verified'
        aal = 'aal2'
        return json(session())
      }
    }
    if (inactive) return json({ message: 'ACCESS_DENIED', code: 'P0001' }, 400)
    if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/functions/')) {
      protectedRequests.push(url.pathname)
      const claims = JSON.parse(Buffer.from(route.request().headers().authorization.split('.')[1], 'base64url').toString())
      if (role === 'admin' && claims.aal !== 'aal2') return json({ message: 'MFA_REQUIRED', code: 'P0001' }, 400)
    }
    if (url.pathname.endsWith('/app_context')) {
      const context: AppContext = { profile: { id: profileId, auth_user_id: userId, cedula: '0000000001', full_name: role !== 'admin' ? 'Ana Torres' : 'Administración ECIC', role, active: true }, server_time: serverTime, school_date: schoolDate, working_day: true, policy: { id: 'policy', timezone: 'America/Guayaquil', weekdays: [1,2,3,4,5], entry_opens: '06:00:00', entry_closes: '06:40:00', exit_opens: '12:40:00', exit_closes: '13:30:00' }, events }
      return json(context)
    }
    if (url.pathname.endsWith('/record_attendance')) {
      const request = route.request().postDataJSON() as Record<string, unknown>
      requests.push(request)
      let event = events.find(event => event.request_id === request.p_request_id)
      if (!event) {
        event = { id: crypto.randomUUID(), teacher_id: profileId, kind: request.p_kind as AttendanceEvent['kind'], occurred_at: serverTime, school_date: '2026-09-14', sequence_no: events.length+1, justification: request.p_justification as string|null, request_id: request.p_request_id as string }
        events.push(event)
      }
      if (options.uncertain && !lost) { lost = true; return json({ message: 'Unexpected response', code: 'unknown' }, 503) }
      return json(event)
    }
    if (url.pathname.endsWith('/attendance_report')) {
      const request = route.request().postDataJSON() as { p_search: string }
      const row: ReportRow = { teacher_id: profileId, full_name: 'Ana Torres', cedula: '0000000001', school_date: '2026-09-14', entry_at: '2026-09-14T11:30:00Z', exit_at: null, justification: 'El transporte tuvo un retraso.', entry_status: 'late', exit_status: 'missing', worked_minutes: null }
      const report: Report = { as_of: serverTime, page: 0, page_size: 25, rows: request.p_search === 'Nadie' ? [] : [row], totals: { expected: request.p_search === 'Nadie' ? 0 : 1, on_time: 1, late: 0, entry_on_time: 1, entry_late: 0, exit_on_time: 0, exit_late: 0, missing_entry: 0, absent: 0, missing_exit: 1, completed: 0 } }
      return json(report)
    }
    if (url.pathname.endsWith('/admin_notifications')) return json({ total: 1, rows: [{ teacher_id: profileId, full_name: 'Ana Torres', cedula: '0000000001', kind: 'exit', school_date: '2026-09-14', entry_at: '2026-09-14T11:30:00Z' }] })
    if (url.pathname.endsWith('/admin_sidebar_counts')) return role === 'admin' ? json({ teachers: 29, justifications: 3, notifications: 1 }) : json({ message: 'ACCESS_DENIED', code: 'P0001', hint: null, details: null }, 400)
    return json({ message: 'Unexpected test request' }, 500)
  })
  return { events, requests, protectedRequests, mfaRequests, setSchoolDate: (date: string) => { schoolDate = date }, disable: () => { inactive = true } }
}
export async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL(/\/(jornada|admin)$/)
}

export async function openNavigation(page: Page) {
  await page.locator('.teacher-shell').waitFor()
}

export async function setTheme(page: Page, theme: 'light' | 'dark') {
  const current = await page.locator('html').getAttribute('data-theme')
  if (current !== theme) await page.getByRole('button', { name: theme === 'dark' ? 'Activar modo oscuro' : 'Activar modo claro' }).filter({ visible: true }).click()
}
