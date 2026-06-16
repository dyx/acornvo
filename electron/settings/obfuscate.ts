// electron/settings/obfuscate.ts

const SALT = Buffer.from('acrn_v0_salt_key_8492')

export function obfuscate(text: string): string {
  const buf = Buffer.from(text, 'utf8')
  for (let i = 0; i < buf.length; i++) {
    buf[i] = buf[i] ^ SALT[i % SALT.length]
  }
  return buf.toString('base64')
}

export function deobfuscate(b64: string): string {
  try {
    const buf = Buffer.from(b64, 'base64')
    for (let i = 0; i < buf.length; i++) {
      buf[i] = buf[i] ^ SALT[i % SALT.length]
    }
    return buf.toString('utf8')
  } catch {
    return ''
  }
}
