import Docker from 'dockerode'
import type { ContainerCreateOptions, ContainerInfo } from './types'

const NETWORK_NAME = 'gateway-net'

/**
 * Validate container file/directory path to prevent shell injection.
 * Rejects paths with shell metacharacters that could escape quoting.
 * Only allows alphanumeric, slashes, dots, hyphens, underscores, and spaces.
 */
function isContainerPathSafe(p: string): boolean {
  if (!p || p.includes('..')) return false
  return /^[a-zA-Z0-9/_.\-\s@]+$/.test(p)
}

/**
 * Parse Docker multiplexed stream format.
 * Each frame: 8-byte header (byte 0 = stream type, bytes 4-7 = payload size BE) + payload.
 * After extracting payloads, strip ANSI escape codes and stray control characters.
 */
function demuxDockerStream(buf: Buffer): string {
  const chunks: Buffer[] = []
  let offset = 0

  while (offset + 8 <= buf.length) {
    const streamType = buf[offset]
    // Valid stream types: 0=stdin, 1=stdout, 2=stderr
    if (streamType > 2) {
      // Not a multiplexed stream — return as plain text
      return stripAnsi(buf.toString('utf8'))
    }
    const payloadSize = buf.readUInt32BE(offset + 4)
    offset += 8
    if (offset + payloadSize > buf.length) {
      chunks.push(buf.subarray(offset))
      break
    }
    chunks.push(buf.subarray(offset, offset + payloadSize))
    offset += payloadSize
  }

  // If we didn't consume anything, treat as plain text
  if (chunks.length === 0 && buf.length > 0) {
    return stripAnsi(buf.toString('utf8'))
  }

  return stripAnsi(Buffer.concat(chunks).toString('utf8'))
}

function stripAnsi(str: string): string {
  return str
    .replace(/\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07)/g, '') // ANSI CSI + OSC sequences
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')              // stray control chars (keep \t \n \r)
}

const globalForDocker = globalThis as unknown as { dockerManager: DockerManager }

export class DockerManager {
  private docker: Docker

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' })
  }

  // Network management
  async ensureNetwork(name: string = NETWORK_NAME): Promise<void> {
    try {
      const networks = await this.docker.listNetworks({
        filters: JSON.stringify({ name: [name] }),
      })
      if (networks.length === 0) {
        await this.docker.createNetwork({ Name: name, Driver: 'bridge' })
      }
    } catch (err) {
      throw new Error(`Failed to ensure network "${name}": ${(err as Error).message}`)
    }
  }

  // Container lifecycle
  async createContainer(options: ContainerCreateOptions): Promise<string> {
    await this.ensureNetwork(options.networkName || NETWORK_NAME)

    const portBindings: Record<string, { HostPort: string }[]> = {}
    const exposedPorts: Record<string, Record<string, never>> = {}
    if (options.portBindings) {
      for (const [containerPort, hostPort] of Object.entries(options.portBindings)) {
        const portKey = containerPort.includes('/') ? containerPort : `${containerPort}/tcp`
        portBindings[portKey] = [{ HostPort: hostPort }]
        exposedPorts[portKey] = {}
      }
    }

    const binds: string[] = []
    if (options.volumes) {
      for (const [hostPath, containerPath] of Object.entries(options.volumes)) {
        binds.push(`${hostPath}:${containerPath}`)
      }
    }

    const env = options.env
      ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
      : []

    const restartPolicy = options.restartPolicy
      ? { Name: options.restartPolicy === 'on-failure' ? 'on-failure' as const : options.restartPolicy }
      : { Name: 'unless-stopped' as const }

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.imageName,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds.length > 0 ? binds : undefined,
        RestartPolicy: restartPolicy,
        Memory: options.memoryLimit || 0,
        NetworkMode: options.networkName || NETWORK_NAME,
      },
    })

    return container.id
  }

  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.start()
  }

  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.stop({ t: 10 }) // 10s grace period
  }

  async restartContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.restart({ t: 10 })
  }

  async removeContainer(containerId: string, force: boolean = false): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.remove({ force, v: true })
  }

  async inspectContainer(containerId: string): Promise<ContainerInfo> {
    const container = this.docker.getContainer(containerId)
    const info = await container.inspect()

    // Extract version from env or labels
    let version: string | undefined
    const envArr = info.Config.Env || []
    for (const e of envArr) {
      if (e.startsWith('OPENCLAW_VERSION=') || e.startsWith('VERSION=')) {
        version = e.split('=')[1]
        break
      }
    }
    if (!version && info.Config.Labels) {
      version =
        info.Config.Labels['org.opencontainers.image.version'] ||
        info.Config.Labels['version']
    }

    // Extract port mappings
    const ports: Record<string, string> = {}
    const portBindings = info.HostConfig.PortBindings || {}
    for (const [containerPort, bindings] of Object.entries(portBindings)) {
      if (bindings && (bindings as { HostPort: string }[]).length > 0) {
        ports[containerPort] = (bindings as { HostPort: string }[])[0].HostPort
      }
    }

    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ''),
      state: info.State.Status,
      status: info.State.Running
        ? `Up since ${info.State.StartedAt}`
        : `Exited (${info.State.ExitCode}) at ${info.State.FinishedAt}`,
      imageName: info.Config.Image,
      version,
      ports,
      createdAt: info.Created,
    }
  }

  async getContainerLogs(containerId: string, tail: number = 200): Promise<string> {
    const container = this.docker.getContainer(containerId)
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })
    const buf = typeof logs === 'string' ? Buffer.from(logs) : (logs as Buffer)
    return demuxDockerStream(buf)
  }

  // Image management
  async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err)
        this.docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })
  }

  async imageExists(imageName: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageName).inspect()
      return true
    } catch {
      return false
    }
  }

  // Container file operations (via docker exec)
  async readContainerFile(containerId: string, filePath: string): Promise<string> {
    if (!isContainerPathSafe(filePath)) {
      throw new Error(`Unsafe container file path: ${filePath}`)
    }
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: ['cat', filePath],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ Detach: false })
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        // Docker multiplexed stream: strip 8-byte header from each frame
        const lines = raw.split('\n').map((line) => {
          if (line.length >= 8) {
            const firstByte = line.charCodeAt(0)
            if (firstByte === 1 || firstByte === 2) {
              return line.substring(8)
            }
          }
          return line
        })
        resolve(lines.join('\n').trim())
      })
      stream.on('error', reject)
    })
  }

  async writeContainerFile(containerId: string, filePath: string, content: string): Promise<void> {
    if (!isContainerPathSafe(filePath)) {
      throw new Error(`Unsafe container file path: ${filePath}`)
    }
    const container = this.docker.getContainer(containerId)
    const escaped = content.replace(/'/g, "'\\''")
    const exec = await container.exec({
      // Pass filePath as a positional argument to avoid shell injection
      Cmd: ['sh', '-c', "printf '%s' '" + escaped + "' > \"$1\"", '--', filePath],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ Detach: false })
    return new Promise((resolve, reject) => {
      stream.on('end', () => resolve())
      stream.on('error', reject)
      stream.resume() // drain the stream
    })
  }

  // Container directory listing (via docker exec)
  async listContainerDir(
    containerId: string,
    dirPath: string,
  ): Promise<{ name: string; path: string; type: 'file' | 'directory'; size: number }[]> {
    if (!isContainerPathSafe(dirPath)) {
      throw new Error(`Unsafe container directory path: ${dirPath}`)
    }
    const container = this.docker.getContainer(containerId)
    // Use ls with -1psa to get names with type indicators, then stat for size
    // -1: one entry per line, -p: append / to directories, -a: show hidden
    const exec = await container.exec({
      // Pass dirPath as positional argument to avoid shell injection
      Cmd: [
        'sh',
        '-c',
        'cd "$1" 2>/dev/null && find . -maxdepth 1 -not -name \'.\' -printf \'%y %s %f\\n\' 2>/dev/null || ls -la "$1" 2>/dev/null || echo \'\'',
        '--',
        dirPath,
      ],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ Detach: false })
    const output = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        const lines = raw.split('\n').map((line) => {
          if (line.length >= 8) {
            const firstByte = line.charCodeAt(0)
            if (firstByte === 1 || firstByte === 2) return line.substring(8)
          }
          return line
        })
        resolve(lines.join('\n').trim())
      })
      stream.on('error', reject)
    })

    if (!output) return []

    const entries: { name: string; path: string; type: 'file' | 'directory'; size: number }[] = []
    for (const line of output.split('\n')) {
      if (!line.trim()) continue
      // find -printf format: "type size name"  (type: f=file, d=directory)
      const match = line.match(/^([fd])\s+(\d+)\s+(.+)$/)
      if (match) {
        const [, typeChar, sizeStr, name] = match
        if (name === '.' || name === '..') continue
        const relPath = dirPath === '.' || dirPath === '' ? name : name
        entries.push({
          name,
          path: relPath,
          type: typeChar === 'd' ? 'directory' : 'file',
          size: parseInt(sizeStr, 10),
        })
      }
    }

    return entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async ensureContainerDir(containerId: string, dirPath: string): Promise<void> {
    if (!isContainerPathSafe(dirPath)) {
      throw new Error(`Unsafe container directory path: ${dirPath}`)
    }
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: ['mkdir', '-p', '--', dirPath],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ Detach: false })
    return new Promise((resolve, reject) => {
      stream.on('end', () => resolve())
      stream.on('error', reject)
      stream.resume()
    })
  }

  async removeContainerDir(containerId: string, dirPath: string): Promise<void> {
    if (!isContainerPathSafe(dirPath)) {
      throw new Error(`Unsafe container directory path: ${dirPath}`)
    }
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: ['rm', '-rf', '--', dirPath],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ Detach: false })
    return new Promise((resolve, reject) => {
      stream.on('end', () => resolve())
      stream.on('error', reject)
      stream.resume()
    })
  }

  // Copy directory between containers via tar archive
  async copyDirBetweenContainers(
    sourceContainerId: string,
    sourcePath: string,
    targetContainerId: string,
    targetPath: string,
  ): Promise<void> {
    await this.ensureContainerDir(targetContainerId, targetPath)
    const srcContainer = this.docker.getContainer(sourceContainerId)
    const tgtContainer = this.docker.getContainer(targetContainerId)
    const tarStream = await srcContainer.getArchive({ path: sourcePath + '/.' })
    await tgtContainer.putArchive(tarStream, { path: targetPath })
  }

  // OpenClaw config management
  // Config path: container runs as 'node' user → HOME=/home/node
  private static readonly CONFIG_PATH = '/home/node/.openclaw/openclaw.json'

  async getContainerConfig(containerId: string): Promise<Record<string, unknown>> {
    const content = await this.readContainerFile(containerId, DockerManager.CONFIG_PATH)
    return JSON.parse(content) as Record<string, unknown>
  }

  async updateContainerConfig(containerId: string, config: Record<string, unknown>): Promise<void> {
    const content = JSON.stringify(config, null, 2)
    await this.writeContainerFile(containerId, DockerManager.CONFIG_PATH, content)
  }
}

export const dockerManager =
  globalForDocker.dockerManager ||
  (globalForDocker.dockerManager = new DockerManager())
