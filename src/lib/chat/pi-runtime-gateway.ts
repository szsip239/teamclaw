const PI_WRAPPER_PORT = 18790

interface PiRuntimeInstance {
  containerName?: string | null
  dockerConfig: unknown
}

interface ResolvePiGatewayUrlOptions {
  inDockerNetwork?: boolean
}

interface ChatAttachmentParam {
  fileName: string
  mimeType: string
  content: string
}

export function resolvePiGatewayUrl(
  instance: PiRuntimeInstance,
  options: ResolvePiGatewayUrlOptions = {},
): string {
  const inDockerNetwork = options.inDockerNetwork ?? Boolean(process.env.DOCKER_NETWORK)
  if (inDockerNetwork && instance.containerName) {
    return `ws://${instance.containerName}:${PI_WRAPPER_PORT}`
  }

  const hostPiPort = getHostPiPort(instance.dockerConfig)
  if (!hostPiPort) {
    throw new Error('Pi runtime is not enabled for this instance')
  }
  const host = inDockerNetwork ? 'host.docker.internal' : '127.0.0.1'
  return `ws://${host}:${hostPiPort}`
}

export function buildPiChatSendParams(params: {
  sessionKey: string
  message: string
  idempotencyKey: string
  cwd: string
  attachments?: ChatAttachmentParam[]
}): Record<string, unknown> {
  return {
    sessionKey: params.sessionKey,
    message: params.message,
    idempotencyKey: params.idempotencyKey,
    cwd: params.cwd,
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  }
}

function getHostPiPort(dockerConfig: unknown): number | null {
  if (!dockerConfig || typeof dockerConfig !== 'object') return null
  const hostPiPort = (dockerConfig as Record<string, unknown>).hostPiPort
  if (typeof hostPiPort === 'number' && Number.isInteger(hostPiPort) && hostPiPort > 0) {
    return hostPiPort
  }
  if (typeof hostPiPort === 'string' && /^\d+$/.test(hostPiPort)) {
    const parsed = Number(hostPiPort)
    return parsed > 0 ? parsed : null
  }
  return null
}
