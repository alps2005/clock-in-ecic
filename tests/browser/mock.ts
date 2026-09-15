import type { Page } from '@playwright/test'
import type { AppContext, AttendanceEvent, Report, ReportRow } from '../../src/types/app.ts'

export async function mockBackend(page: Page, options: { role?: 'teacher' | 'admin'; time?: string; uncertain?: boolean; events?: AttendanceEvent[] } = {}) {
  const role = options.role ?? 'teacher'
  const userId = role === 'teacher' ? '10000000-0000-0000-0000-000000000001' : '10000000-0000-0000-0000-000000000003'
  const profileId = role === 'teacher' ? '20000000-0000-0000-0000-000000000001' : '20000000-0000-0000-0000-000000000003'
  const events: AttendanceEvent[] = [...(options.events ?? [])]
  const requests: Record<string, unknown>[] = []
  let lost = false
  let inactive = false
  const serverTime = options.time ?? '2026-09-14T11:30:00Z'
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: '0000000001@login.clock-in.invalid', app_metadata: { ecic_session_version: 1 }, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' }
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), app_metadata: user.app_metadata })}.test-signature`
  await page.route('https://ecic-test.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const json = (body: unknown, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/token') return json({ access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh', user })
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/user') return json(user)
    if (inactive) return json({ message: 'ACCESS_DENIED', code: 'P0001' }, 400)
    if (url.pathname.endsWith('/app_context')) {
      const context: AppContext = { profile: { id: profileId, auth_user_id: userId, cedula: '0000000001', full_name: role === 'teacher' ? 'Ana Torres' : 'Administración ECIC', role, active: true }, server_time: serverTime, school_date: '2026-09-14', working_day: true, policy: { id: 'policy', timezone: 'America/Guayaquil', weekdays: [1,2,3,4,5], entry_opens: '06:00:00', entry_closes: '06:40:00', exit_opens: '12:40:00', exit_closes: '13:30:00' }, events }
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
      const row: ReportRow = { teacher_id: profileId, full_name: 'Ana Torres', cedula: '0000000001', school_date: '2026-09-14', entry_at: '2026-09-14T11:30:00Z', exit_at: null, justification: null, entry_status: 'on_time', exit_status: 'missing', worked_minutes: null }
      const report: Report = { as_of: serverTime, page: 0, page_size: 25, rows: request.p_search === 'Nadie' ? [] : [row], totals: { expected: request.p_search === 'Nadie' ? 0 : 1, on_time: 1, late: 0, absent: 0, missing_exit: 1, completed: 0 } }
      return json(report)
    }
    if (url.pathname.endsWith('/admin_notifications')) return json({ total: 1, rows: [{ teacher_id: profileId, full_name: 'Ana Torres', cedula: '0000000001', kind: 'exit', school_date: '2026-09-14', entry_at: '2026-09-14T11:30:00Z' }] })
    return json({ message: 'Unexpected test request' }, 500)
  })
  return { events, requests, disable: () => { inactive = true } }
}
export async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Cédula', { exact: true }).fill('0000000001')
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
}
