import { supabase } from './supabase'
import type { AdminSidebarCounts, AppContext, AttendanceEvent, AttendanceRequest, Notifications, Report, TeacherAccount, TeacherDirectory, TeacherMutation } from '../types/app'
import type { Database } from '../types/database'

type Functions = Database['public']['Functions']
async function rpc<N extends keyof Functions, R>(name: N, args?: Functions[N]['Args']): Promise<R> {
  if (!supabase) throw new Error('SCHOOL_NOT_CONFIGURED')
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(15_000))
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('EMPTY_RESPONSE')
  return data as R
}
export const getContext = () => rpc<'app_context', AppContext>('app_context')
export const getReport = (from: string, to: string, page: number, search: string) =>
  rpc<'attendance_report', Report>('attendance_report', { p_from: from, p_to: to, p_page: page, p_search: search })
export const getNotifications = (page: number) => rpc<'admin_notifications', Notifications>('admin_notifications', { p_page: page })
export const getTeachers = (page: number, search: string) => rpc<'admin_teachers', TeacherDirectory>('admin_teachers', { p_page: page, p_search: search })
export const getAdminSidebarCounts = () => rpc<'admin_sidebar_counts', AdminSidebarCounts>('admin_sidebar_counts')
export const getTeacher = (id: string) => rpc<'admin_teacher', TeacherAccount>('admin_teacher', { p_id: id })
export const getTeacherReport = (id: string, from: string, to: string, page: number) =>
  rpc<'admin_teacher_report', Report>('admin_teacher_report', { p_id: id, p_from: from, p_to: to, p_page: page })
export async function manageTeacher(input: TeacherMutation): Promise<void> {
  if (!supabase) throw new Error('SCHOOL_NOT_CONFIGURED')
  const { data, error } = await supabase.functions.invoke('admin-teachers', { body: input })
  if (error) {
    let code = 'ADMIN_OPERATION_FAILED'
    if (error.context instanceof Response) {
      try { code = (await error.context.json()).error ?? code } catch { /* Keep the safe fallback. */ }
    }
    throw new Error(code)
  }
  if (!data?.ok) throw new Error(data?.error ?? 'ADMIN_OPERATION_FAILED')
}
export const recordAttendance = (request: AttendanceRequest) => rpc<'record_attendance', AttendanceEvent>('record_attendance', {
  ...request,
  // SQL defaults both optional arguments to NULL when they are omitted.
  p_qr: request.p_qr ?? undefined,
  p_justification: request.p_justification ?? undefined,
})
