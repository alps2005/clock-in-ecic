import type { AccountRole, StaffRole } from '../lib/roles.ts'
export type Profile = { id: string; auth_user_id: string | null; cedula: string | null; full_name: string; role: AccountRole; active: boolean }
export type Policy = { id: string; timezone: string; weekdays: number[]; entry_opens: string; entry_closes: string; exit_opens: string; exit_closes: string }
export type AttendanceEvent = { id: string; teacher_id: string; kind: 'entry' | 'late_entry' | 'exit'; occurred_at: string; school_date: string; sequence_no: number; justification: string | null; request_id: string }
export type AppContext = { profile: Profile; server_time: string; school_date: string; policy: Policy | null; working_day: boolean; events: AttendanceEvent[] }
export type ReportRow = { teacher_id: string; full_name: string; cedula: string; school_date: string; entry_at: string | null; exit_at: string | null; justification: string | null; entry_status: 'pending' | 'on_time' | 'late' | 'late_pending' | 'missing_entry' | 'absent'; exit_status: 'pending' | 'registered' | 'missing'; worked_minutes: number | null }
export type Report = { as_of: string; page: number; page_size: number; totals: { expected: number; on_time: number; late: number; entry_on_time: number; entry_late: number; exit_on_time: number; exit_late: number; missing_entry: number; absent: number; missing_exit: number; completed: number }; rows: ReportRow[] }
export type Notifications = { total: number; rows: { teacher_id: string; full_name: string; cedula: string; school_date: string; entry_at: string | null; kind: 'entry' | 'exit' }[] }
export type TeacherAccount = { role: StaffRole; id: string; full_name: string; cedula: string; active: boolean; employed_from: string | null; employed_until: string | null }
export type TeacherDirectory = { total: number; rows: TeacherAccount[] }
export type AdminSidebarCounts = { teachers: number; justifications: number; notifications: number }
export type TeacherMutation = { action: 'create' | 'update' | 'reset-password' | 'disable' | 'delete'; id?: string; role?: StaffRole; full_name?: string; cedula?: string; password?: string; active?: boolean; employed_from?: string; employed_until?: string | null }
export type AttendanceRequest = { p_kind: AttendanceEvent['kind']; p_school_date: string; p_prior_sequence: number; p_request_id: string; p_qr: string | null; p_justification: string | null }
