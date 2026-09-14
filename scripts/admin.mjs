// Trusted CLI. Never import into src/ or pass administrative credentials to Vite.
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { loginIdentity, validCedula } from '../src/lib/attendance.ts'

const [command, inputPath] = process.argv.slice(2)
if (!['provision', 'reset-password', 'disable', 'checkpoint'].includes(command) || !inputPath) {
  console.error('Usage: node --env-file=/private/path/admin.env scripts/admin.mjs provision|reset-password|disable|checkpoint /private/path/input.json')
  process.exit(1)
}
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key || (!key.startsWith('sb_secret_') && !key.startsWith('eyJ'))) {
  console.error('Provide SUPABASE_URL and an administrative SUPABASE_SECRET_KEY in a private environment file.')
  process.exit(1)
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const check = result => { if (result.error) throw result.error; return result.data }
try {
  const input = JSON.parse(await readFile(inputPath, 'utf8'))
  if (input.project_url !== url) throw new Error('Input project_url must match SUPABASE_URL exactly. Verify the NEW project.')
  if (command === 'checkpoint') {
    if (typeof input.label !== 'string' || !input.output_svg || input.output_svg.includes('/src/') || input.output_svg.includes('/public/')) throw new Error('Provide a label and private output_svg path outside frontend assets.')
    const id = input.id ?? randomUUID()
    const payload = `ecic:v1:${id}:${randomBytes(32).toString('hex')}`
    // Write the printable artifact first. If the RPC fails, rerun with the same id;
    // previous checkpoint tokens remain valid until the new transaction succeeds.
    await writeFile(input.output_svg, await QRCode.toString(payload, { type: 'svg', width: 800, margin: 4, errorCorrectionLevel: 'M' }), { mode: 0o600 })
    check(await client.rpc('configure_checkpoint', { p_id: id, p_label: input.label, p_payload: payload }))
    console.log(`Checkpoint ready. ID: ${id}. Print the private SVG. Save the ID to rotate this checkpoint later.`)
  } else {
    if (!validCedula(input.cedula ?? '')) throw new Error('Cédula must be a string of 10 digits; verify the actual document with the administrator.')
    const email = loginIdentity(input.cedula)
    let profile = check(await client.from('profiles').select('*').eq('cedula',input.cedula).maybeSingle())
    if (command === 'provision') {
      if (!['teacher','admin'].includes(input.role) || typeof input.full_name !== 'string' || input.full_name.trim().length < 2) throw new Error('Provide role and full_name.')
      if (typeof input.password !== 'string' || input.password.length < 12) throw new Error('Use a fresh password with at least 12 characters.')
      if (input.role === 'teacher' && !/^\d{4}-\d{2}-\d{2}$/.test(input.employed_from ?? '')) throw new Error('Provide employed_from as YYYY-MM-DD.')
      if (profile?.active) throw new Error('This profile is already active. Use reset-password or disable explicitly.')
      if (profile && (profile.role !== input.role || profile.full_name !== input.full_name.trim())) throw new Error('Pending profile differs from input; reconcile the pending profile before continuing.')
      if (!profile) profile = check(await client.from('profiles').insert({ cedula: input.cedula, full_name: input.full_name.trim(), role: input.role, active: false }).select().single())
      // Resume only Auth identities marked by this trusted provisioning workflow.
      let authUser = null
      for (let page=1; ; page++) {
        const users = check(await client.auth.admin.listUsers({ page, perPage: 1000 })).users
        authUser = users.find(user => user.email === email) ?? null
        if (authUser || users.length < 1000) break
        if (page >= 100) throw new Error('Account lookup exceeded its bounded limit.')
      }
      if (authUser && authUser.app_metadata.ecic_profile_id !== profile.id) throw new Error('Existing Auth identity is not owned by this provisioning attempt. Inspect it before proceeding.')
      if (!authUser) authUser = check(await client.auth.admin.createUser({ email, password: input.password, email_confirm: true, ban_duration: '876000h', app_metadata: { ecic_profile_id: profile.id, ecic_session_version: profile.session_version } })).user
      // An unbanned Auth account still has no application access until activation succeeds.
      check(await client.auth.admin.updateUserById(authUser.id, { password: input.password, ban_duration: 'none', app_metadata: { ...authUser.app_metadata, ecic_session_version: profile.session_version } }))
      check(await client.rpc('activate_profile', { p_profile_id: profile.id, p_auth_user_id: authUser.id, p_employed_from: input.employed_from ?? null }))
      console.log('Account activated. Deliver its fresh credentials privately. No password was printed.')
    } else {
      if (!profile?.auth_user_id) throw new Error('No linked account found.')
      if (command === 'reset-password') {
        if (typeof input.password !== 'string' || input.password.length<12) throw new Error('Provide a fresh password of at least 12 characters.')
        // Revoke application access first. Partial failures remain disabled until repaired.
        const authUser = check(await client.auth.admin.getUserById(profile.auth_user_id)).user
        const version = profile.session_version + 1
        check(await client.from('profiles').update({ active: false, session_version: version }).eq('id',profile.id))
        check(await client.auth.admin.updateUserById(profile.auth_user_id,{ password: input.password, email, email_confirm: true, app_metadata: { ...authUser.app_metadata, ecic_session_version: version } }))
        if (profile.active) check(await client.from('profiles').update({ active: true }).eq('id',profile.id))
        console.log('Password reset. The account retained its previous activation state. Deliver the new password privately.')
      } else {
        if (profile.role === 'teacher' && !/^\d{4}-\d{2}-\d{2}$/.test(input.employed_until ?? '')) throw new Error('Provide employed_until to end future report eligibility.')
        check(await client.from('profiles').update({ active: false }).eq('id',profile.id))
        if (profile.role === 'teacher') check(await client.from('teachers').update({ employed_until: input.employed_until }).eq('id',profile.id))
        check(await client.auth.admin.updateUserById(profile.auth_user_id,{ ban_duration: '876000h' }))
        console.log('Account disabled. Historical attendance retained.')
      }
    }
  }
} catch (error) {
  // API errors can contain identifying fields; do not dump response bodies or credentials.
  console.error(error instanceof Error ? error.message : 'Administrative operation failed. Inspect the pending account in the new Supabase dashboard; retry the same input only after checking its state.')
  process.exitCode = 1
}
