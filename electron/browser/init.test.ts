// electron/browser/init.test.ts
import { describe, it, expect } from 'vitest'
import { parseHostsFile } from './init'

describe('parseHostsFile', () => {
  it('strips blank lines and comments; lower-cases', () => {
    const text = `
# header
google-analytics.com

# section
GOOGLETAGMANAGER.COM
   ws.example.com

# trailing
`
    expect(parseHostsFile(text)).toEqual(
      new Set(['google-analytics.com', 'googletagmanager.com', 'ws.example.com'])
    )
  })

  it('returns empty set for empty input', () => {
    expect(parseHostsFile('')).toEqual(new Set<string>())
  })

  it('ignores inline-comment style lines (`# anything` after a host on its own line)', () => {
    // We require comments to be on their own line; a line containing whitespace then `#` is
    // treated as part of the host name, which would never match. Verify it does not crash.
    expect(parseHostsFile('host.com #note')).toEqual(new Set<string>(['host.com #note']))
    // Document the limitation: keep comments on their own line in the file.
  })
})
