import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Disposable integration-test helper is a Node ESM module.
import { totp } from './helpers/totp.mjs'

test('local MFA integration helper matches RFC 6238 SHA-1 vectors truncated to six digits', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  for (const [seconds, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']] as const) {
    assert.equal(totp(secret, seconds * 1000), code)
  }
})
