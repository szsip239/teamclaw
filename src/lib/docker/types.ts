export interface ContainerCreateOptions {
  name: string
  imageName: string
  env?: Record<string, string>
  portBindings?: Record<string, string> // "18789/tcp" → "18789"
  volumes?: Record<string, string> // host path → container path
  extraBinds?: string[] // additional bind mounts in "host:container" format (for when volumes would have duplicate keys)
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure'
  memoryLimit?: number // bytes
  networkName?: string // default: 'gateway-net'
}

export interface ContainerInfo {
  id: string
  name: string
  state: string // 'running' | 'exited' | 'created' | 'paused' etc.
  status: string // human-readable e.g. "Up 2 hours"
  imageName: string
  version?: string // extracted from env/labels
  ports: Record<string, string>
  createdAt: string
}

export interface ContainerLogs {
  stdout: string
  stderr: string
}
