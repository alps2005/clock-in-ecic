export const roleLabels = {
  admin: 'Administrador',
  teacher: 'Docente',
  substitute_teacher: 'Docente suplente',
  secretary: 'Secretaría',
  academic_coordinator: 'Coordinador académico',
  vice_principal: 'Subdirector',
  principal: 'Director',
} as const

export type AccountRole = keyof typeof roleLabels
export type StaffRole = Exclude<AccountRole, 'admin'>
export const staffRoles = Object.keys(roleLabels).filter((role): role is StaffRole => role !== 'admin')
export const validAdminUsername = (value: string) => /^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(value)
export const adminLoginIdentity = (username: string) => `${username.trim().toLowerCase()}@admin.clock-in.invalid`
