import { describe, expect, it } from 'vitest'
import { parseContainerDirListing } from './manager'

describe('parseContainerDirListing', () => {
  it('parses busybox ls -la fallback output when find -printf is unavailable', () => {
    const output = [
      'total 8',
      'drwxr-xr-x    2 node     node          4096 Jun 17 18:10 .',
      'drwxr-xr-x    3 node     node          4096 Jun 17 18:10 ..',
      '-rw-r--r--    1 node     node            12 Jun 17 18:10 report.html',
      'drwxr-xr-x    2 node     node          4096 Jun 17 18:10 charts',
    ].join('\n')

    expect(parseContainerDirListing(output)).toEqual([
      { name: 'charts', path: 'charts', size: 4096, type: 'directory' },
      { name: 'report.html', path: 'report.html', size: 12, type: 'file' },
    ])
  })
})
