import piWrapperPackage from '../../../pi-wrapper/package.json'

type PackageJson = {
  version?: string
  dependencies?: Record<string, string>
}

const pkg = piWrapperPackage as PackageJson

export const PI_WRAPPER_VERSION = pkg.version ?? null
export const PI_CODING_AGENT_VERSION =
  pkg.dependencies?.['@mariozechner/pi-coding-agent'] ?? PI_WRAPPER_VERSION
