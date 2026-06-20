import path from 'path'

export const PI_WRAPPER_CONTAINER_PORT = 18790
const PI_WRAPPER_MOUNT_PATH = '/opt/teamclaw/pi-wrapper'

export function resolvePiWrapperRepoRoot(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  const configuredRoot = env.TEAMCLAW_REPO_ROOT?.trim()
  if (configuredRoot) return path.resolve(configuredRoot)

  if (env.DOCKER_NETWORK) {
    throw new Error(
      'TEAMCLAW_REPO_ROOT must point to the host TeamClaw repo path when app runs in Docker',
    )
  }

  return path.resolve(cwd)
}

export function buildPiWrapperBind(repoRoot: string = resolvePiWrapperRepoRoot()): string {
  return `${path.join(path.resolve(repoRoot), 'pi-wrapper')}:${PI_WRAPPER_MOUNT_PATH}:ro`
}

export function buildOpenClawGatewayCommandWithPiWrapper(): string[] {
  const script = [
    'PI_SRC=/opt/teamclaw/pi-wrapper',
    'PI_RUN=/tmp/teamclaw-pi-wrapper',
    'if [ -d "$PI_SRC" ]; then ( rm -rf "$PI_RUN" && cp -R "$PI_SRC" "$PI_RUN" && cd "$PI_RUN" && (npm config set registry https://registry.npmmirror.com/ >/dev/null 2>&1 || true) && npm ci --omit=dev --ignore-scripts >/tmp/teamclaw-pi-wrapper-npm.log 2>&1 && PI_WRAPPER_HOST=0.0.0.0 PI_WRAPPER_PORT=18790 PI_AGENT_DIR=/home/node/.openclaw node src/server.js ) & fi',
    'exec node openclaw.mjs gateway',
  ].join('; ')
  return ['sh', '-lc', script]
}

export function derivePiHostPort(gatewayHostPort: number): number {
  return gatewayHostPort + 1000
}
