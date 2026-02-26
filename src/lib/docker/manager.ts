import Docker from 'dockerode'
import tar from 'tar-stream'
import { createGzip } from 'zlib'
import type { ContainerCreateOptions, ContainerInfo } from './types'

const NETWORK_NAME = 'gateway-net'

/**
 * Validate container file/directory path to prevent path traversal.
 * Rejects empty paths, path traversal (..), and null bytes.
 * Allows Unicode characters (e.g. CJK filenames) since all exec commands
 * pass paths as positional arguments (not shell-expanded).
 */
function isContainerPathSafe(p: string): boolean {
  if (!p || p.includes('..') || p.includes('\0')) return false
  return true
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
    if (options.extraBinds) {
      binds.push(...options.extraBinds)
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

  // Sandbox support initialization (Docker-in-Docker)
  /**
   * Install Docker CLI and configure permissions inside a container.
   * Required for OpenClaw sandbox mode which uses `docker` CLI to create sandbox containers.
   *
   * Steps:
   * 1. Download Docker static binary (compatible with the host Docker daemon)
   * 2. Create docker group and add the container's default user to it
   * 3. Fix Docker socket permissions
   *
   * After calling this, the container MUST be restarted for group changes to take effect.
   */
  async initSandboxSupport(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)

    // Detect architecture for the correct Docker binary
    const archExec = await container.exec({
      Cmd: ['uname', '-m'],
      AttachStdout: true,
      AttachStderr: true,
    })
    const archStream = await archExec.start({ Detach: false })
    const arch = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      archStream.on('data', (chunk: Buffer) => chunks.push(chunk))
      archStream.on('end', () => resolve(demuxDockerStream(Buffer.concat(chunks)).trim()))
      archStream.on('error', reject)
    })

    // Map to Docker's download architecture name
    const archMap: Record<string, string> = {
      'x86_64': 'x86_64',
      'aarch64': 'aarch64',
      'arm64': 'aarch64',
    }
    const dockerArch = archMap[arch] || 'x86_64'

    // Install Docker CLI + setup permissions in a single root exec
    const initScript = [
      // Download and install Docker static binary
      `curl -fsSL https://download.docker.com/linux/static/stable/${dockerArch}/docker-28.0.1.tgz -o /tmp/docker.tgz`,
      'tar xzf /tmp/docker.tgz -C /tmp',
      'cp /tmp/docker/docker /usr/local/bin/docker',
      'chmod +x /usr/local/bin/docker',
      'rm -rf /tmp/docker /tmp/docker.tgz',
      // Setup docker group and permissions
      'groupadd -f docker',
      'usermod -aG docker node',
      'chmod 660 /var/run/docker.sock',
      'chgrp docker /var/run/docker.sock',
    ].join(' && ')

    const exec = await container.exec({
      Cmd: ['bash', '-c', initScript],
      AttachStdout: true,
      AttachStderr: true,
      User: 'root',
    })
    const stream = await exec.start({ Detach: false })
    await new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', async () => {
        const info = await exec.inspect()
        if (info.ExitCode !== 0) {
          const output = demuxDockerStream(Buffer.concat(chunks))
          reject(new Error(`Sandbox init failed (exit ${info.ExitCode}): ${output}`))
        } else {
          resolve()
        }
      })
      stream.on('error', reject)
    })
  }

  /**
   * Fix common container environment issues for the agent user.
   * - Install python3-venv so agents can create proper virtual environments
   * - Symlink user-installed Python tools (pip3, etc.) into /usr/local/bin
   *   so they are accessible from the default PATH.
   * Called once after container start, independent of sandbox mode.
   */
  async initContainerEnv(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    const script = [
      // Ensure python3 venv works properly (ensurepip + pip in venv)
      'apt-get update -qq',
      'apt-get install -y -qq python3-venv > /dev/null 2>&1 || true',
      // Symlink user-installed Python tools into PATH
      'for f in /home/node/.local/bin/*; do [ -x "$f" ] && ln -sf "$f" /usr/local/bin/ 2>/dev/null; done',
    ].join(' && ')
    const exec = await container.exec({
      Cmd: ['sh', '-c', script],
      AttachStdout: true,
      AttachStderr: true,
      User: 'root',
    })
    const stream = await exec.start({ Detach: false })
    await new Promise<void>((resolve) => {
      stream.on('end', () => resolve())
      stream.on('error', () => resolve()) // non-fatal
      stream.resume()
    })
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
        resolve(demuxDockerStream(Buffer.concat(chunks)).trim())
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
        'cd "$1" 2>/dev/null && find . -maxdepth 1 -not -name \'.\' -printf \'%y %s %P\\n\' 2>/dev/null || ls -la "$1" 2>/dev/null || echo \'\'',
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
        resolve(demuxDockerStream(Buffer.concat(chunks)).trim())
      })
      stream.on('error', reject)
    })

    if (!output) return []

    const entries: { name: string; path: string; type: 'file' | 'directory'; size: number }[] = []
    for (const line of output.split('\n')) {
      if (!line.trim()) continue
      // find -printf format: "type size relPath"  (type: f=file, d=directory, relPath from %P)
      const match = line.match(/^([fd])\s+(\d+)\s+(.+)$/)
      if (match) {
        const [, typeChar, sizeStr, relPath] = match
        if (!relPath || relPath === '.' || relPath === '..') continue
        const name = relPath.split('/').pop() ?? relPath
        entries.push({
          name,
          path: relPath,
          type: typeChar === 'd' ? 'directory' : 'file',
          size: parseInt(sizeStr, 10),
        })
      }
    }

    // Deduplicate by type:name — if find returns nested entries (e.g. cached
    // results from before -maxdepth 1 fix), keep only the shallowest path.
    const seen = new Map<string, (typeof entries)[0]>()
    for (const entry of entries) {
      const key = `${entry.type}:${entry.name}`
      const existing = seen.get(key)
      if (!existing || entry.path.length < existing.path.length) {
        seen.set(key, entry)
      }
    }

    return [...seen.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  /** Run an arbitrary command inside a container (fire-and-forget style). */
  async execInContainer(containerId: string, cmd: string[]): Promise<void> {
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: cmd,
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

  /** Run a command inside a container and return stdout as a string. */
  async execWithOutput(containerId: string, cmd: string[]): Promise<string> {
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ Detach: false })
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        resolve(demuxDockerStream(Buffer.concat(chunks)).trim())
      })
      stream.on('error', reject)
    })
  }

  async ensureContainerDir(containerId: string, dirPath: string): Promise<void> {
    if (!isContainerPathSafe(dirPath)) {
      throw new Error(`Unsafe container directory path: ${dirPath}`)
    }
    const container = this.docker.getContainer(containerId)
    // Run as root so we can create dirs anywhere, then chown to node (1000)
    const exec = await container.exec({
      Cmd: ['sh', '-c', 'mkdir -p -- "$1" && chown -R 1000:1000 "$1"', '--', dirPath],
      AttachStdout: true,
      AttachStderr: true,
      User: 'root',
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

  // Binary file operations (via Docker archive API)
  async uploadFileToContainer(
    containerId: string,
    containerDir: string,
    fileName: string,
    content: Buffer,
  ): Promise<void> {
    if (!isContainerPathSafe(containerDir) || !isContainerPathSafe(fileName)) {
      throw new Error(`Unsafe container path: ${containerDir}/${fileName}`)
    }
    await this.ensureContainerDir(containerId, containerDir)
    const container = this.docker.getContainer(containerId)

    const pack = tar.pack()
    // Set uid/gid to 1000 (node) so the agent can read/write the file
    pack.entry({ name: fileName, size: content.length, uid: 1000, gid: 1000 }, content)
    pack.finalize()

    await container.putArchive(pack, { path: containerDir })
  }

  async downloadFileFromContainer(containerId: string, filePath: string): Promise<Buffer> {
    if (!isContainerPathSafe(filePath)) {
      throw new Error(`Unsafe container file path: ${filePath}`)
    }
    const container = this.docker.getContainer(containerId)
    const archiveStream = await container.getArchive({ path: filePath })

    return new Promise<Buffer>((resolve, reject) => {
      const extract = tar.extract()
      const chunks: Buffer[] = []

      extract.on('entry', (_header, stream, next) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', next)
        stream.on('error', reject)
      })

      extract.on('finish', () => {
        resolve(Buffer.concat(chunks))
      })

      extract.on('error', reject)
      archiveStream.pipe(extract)
    })
  }

  async downloadDirAsArchive(
    containerId: string,
    dirPath: string,
  ): Promise<NodeJS.ReadableStream> {
    if (!isContainerPathSafe(dirPath)) {
      throw new Error(`Unsafe container directory path: ${dirPath}`)
    }
    const container = this.docker.getContainer(containerId)
    // Append '/.' to get contents of the directory, not the directory itself
    const archiveStream = await container.getArchive({ path: dirPath + '/.' })
    const gzip = createGzip()
    archiveStream.pipe(gzip)
    return gzip
  }

  async removeContainerFile(containerId: string, filePath: string): Promise<void> {
    if (!isContainerPathSafe(filePath)) {
      throw new Error(`Unsafe container file path: ${filePath}`)
    }
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: ['rm', '-rf', '--', filePath],
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

  async moveContainerPath(
    containerId: string,
    source: string,
    target: string,
  ): Promise<void> {
    if (!isContainerPathSafe(source) || !isContainerPathSafe(target)) {
      throw new Error(`Unsafe container path: ${source} → ${target}`)
    }
    const container = this.docker.getContainer(containerId)
    const exec = await container.exec({
      Cmd: ['mv', '--', source, target],
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
