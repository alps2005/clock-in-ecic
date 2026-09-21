import { createHmac } from 'node:crypto'

// RFC 6238 / SHA-1, six digits, 30 seconds. Only for disposable Auth integration tests.
export function totp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.toUpperCase().replace(/=+$/, '')].map(char => {
    const value = alphabet.indexOf(char)
    if (value < 0) throw new Error('Invalid test TOTP secret')
    return value.toString(2).padStart(5, '0')
  }).join('')
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)))
  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = digest.at(-1) & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
