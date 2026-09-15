import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'

// Local-only keys are ignored by Git and denied by the Vite file server.
const directory = resolve('.certs.local')
mkdirSync(directory, { recursive: true, mode: 0o700 })
chmodSync(directory, 0o700)
const file = name => resolve(directory, name)
const openssl = args => execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] })
const ips = [...new Set(['127.0.0.1', ...Object.values(networkInterfaces()).flat()
  .filter(address => address?.family === 'IPv4' && !address.internal).map(address => address.address)])]

if (!existsSync(file('root-ca.pem')) || !existsSync(file('root-ca-key.pem'))) {
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
    '-keyout', file('root-ca-key.pem'), '-out', file('root-ca.pem'),
    '-subj', '/CN=ECIC Local Development CA',
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
  chmodSync(file('root-ca-key.pem'), 0o600)
}
writeFileSync(file('server.ext'), [
  'basicConstraints=critical,CA:FALSE',
  'keyUsage=critical,digitalSignature,keyEncipherment',
  'extendedKeyUsage=serverAuth',
  `subjectAltName=DNS:localhost,${ips.map(ip => `IP:${ip}`).join(',')}`,
].join('\n'), { mode: 0o600 })
openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
  '-keyout', file('server-key.pem'), '-out', file('server.csr'), '-subj', '/CN=ECIC Local Development'])
chmodSync(file('server-key.pem'), 0o600)
openssl(['x509', '-req', '-in', file('server.csr'), '-CA', file('root-ca.pem'),
  '-CAkey', file('root-ca-key.pem'), '-CAcreateserial', '-out', file('server.pem'),
  '-days', '90', '-sha256', '-extfile', file('server.ext')])
openssl(['x509', '-in', file('root-ca.pem'), '-outform', 'DER', '-out', file('ecic-root-ca.cer')])
console.log('Local HTTPS certificates are ready. Install and trust ECIC Local Development CA on your phone once.')
for (const ip of ips.filter(ip => ip !== '127.0.0.1')) {
  console.log(`Certificate: http://${ip}:5173/__dev/ecic-root-ca.cer`)
  console.log(`Scanner: https://${ip}:5174/`)
}
