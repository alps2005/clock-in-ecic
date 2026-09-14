import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPublicConfig } from '../src/lib/config.ts'

const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`

test('missing configuration is handled before client initialization', () => {
  assert.deepEqual(readPublicConfig({}), { ready: false, reason: 'missing' })
})

test('accepts publishable keys and normalizes the URL', () => {
  assert.deepEqual(readPublicConfig({ ...env, VITE_SUPABASE_URL: `${env.VITE_SUPABASE_URL}/` }), {
    ready: true, url: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
})

test('rejects secrets, privileged JWTs and malformed keys without echoing them', () => {
  for (const key of ['sb_secret_private', jwt('service_role'), jwt('authenticated'), 'broken']) {
    const result = readPublicConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: key })
    assert.deepEqual(result, { ready: false, reason: 'invalid-key' })
    assert.ok(!JSON.stringify(result).includes(key))
  }
})

test('allows a local anon key', () => {
  assert.equal(readPublicConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).ready, true)
})

test('rejects insecure remote URLs and embedded URL credentials', () => {
  for (const url of ['http://example.supabase.co', 'https://user:password@example.supabase.co', 'not a url', 'https://example.supabase.co?key=secret', 'https://example.supabase.co/auth']) {
    assert.deepEqual(readPublicConfig({ ...env, VITE_SUPABASE_URL: url }), { ready: false, reason: 'invalid-url' })
  }
})
