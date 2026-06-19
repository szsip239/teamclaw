import { describe, expect, it } from 'vitest'
import { buildDockerPortBindings, parseContainerDirListing } from './manager'

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

describe('buildDockerPortBindings', () => {
  it('supports loopback-only host bindings for private helper ports', () => {
    expect(
      buildDockerPortBindings({
        18789: '18800',
        18790: { hostIp: '127.0.0.1', hostPort: '19800' },
      }),
    ).toEqual({
      exposedPorts: {
        '18789/tcp': {},
        '18790/tcp': {},
      },
      portBindings: {
        '18789/tcp': [{ HostPort: '18800' }],
        '18790/tcp': [{ HostIp: '127.0.0.1', HostPort: '19800' }],
      },
    })
  })
})
