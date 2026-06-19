import { DEFAULT_PORT } from './protocol.js'
import { createPiGatewayServer } from './gateway-server.js'
import { getDefaultAgentDir } from './pi-runtime.js'

export { createPiGatewayServer } from './gateway-server.js'

export async function startPiWrapperFromEnv() {
  const port = Number(process.env.PI_PORT ?? DEFAULT_PORT)
  const host = process.env.PI_HOST ?? '0.0.0.0'
  const agentDir = getDefaultAgentDir()
  const server = createPiGatewayServer({ agentDir })

  const shutdown = async () => {
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await server.listen(port, host).then(() => {
    console.log(`[pi-wrapper] listening on ws://${host}:${port} agentDir=${agentDir}`)
  })
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startPiWrapperFromEnv().catch((err) => {
    console.error('[pi-wrapper] failed to start:', err)
    process.exit(1)
  })
}
