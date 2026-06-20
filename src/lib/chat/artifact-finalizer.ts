import {
  appendArtifactLinks,
  normalizeContainerSessionArtifacts,
  normalizeExternalSessionArtifacts,
} from '@/lib/session-files/artifacts'
import type { SessionArtifact, SessionOutputSnapshot } from '@/lib/session-files/artifacts'

export interface FinalizeAssistantArtifactsOptions {
  agentId: string
  chatSessionId: string
  runStartedAt: Date
  assistantText: string
  containerId?: string | null
  workspacePath?: string | null
  execWithOutput?: (containerId: string, cmd: string[]) => Promise<string>
  containerOutputSnapshot?: SessionOutputSnapshot | null
  externalOutputSnapshot?: SessionOutputSnapshot | null
}

export interface FinalizedAssistantArtifacts {
  artifacts: SessionArtifact[]
  content: string
}

export function messageHasOutputArtifactLink(content: string): boolean {
  return /\]\((?:\.\/)?output\/[^)]+\)/.test(content)
}

export async function finalizeAssistantArtifacts(
  opts: FinalizeAssistantArtifactsOptions,
): Promise<FinalizedAssistantArtifacts | null> {
  let artifacts: SessionArtifact[] = []

  if (opts.containerId && opts.execWithOutput) {
    try {
      artifacts = await normalizeContainerSessionArtifacts({
        containerId: opts.containerId,
        agentId: opts.agentId,
        chatSessionId: opts.chatSessionId,
        runStartedAt: opts.runStartedAt,
        execWithOutput: opts.execWithOutput,
        assistantText: opts.assistantText,
        outputSnapshot: opts.containerOutputSnapshot ?? null,
      })
    } catch (err) {
      console.warn('[session-artifacts] container normalization failed:', (err as Error).message)
    }
  }

  if (artifacts.length === 0 && opts.workspacePath) {
    try {
      artifacts = await normalizeExternalSessionArtifacts({
        workspacePath: opts.workspacePath,
        agentId: opts.agentId,
        chatSessionId: opts.chatSessionId,
        runStartedAt: opts.runStartedAt,
        assistantText: opts.assistantText,
        outputSnapshot: opts.externalOutputSnapshot ?? null,
      })
    } catch (err) {
      console.warn('[session-artifacts] external normalization failed:', (err as Error).message)
    }
  }

  if (artifacts.length === 0) return null
  const content = appendArtifactLinks(opts.assistantText, artifacts)
  if (content === opts.assistantText) return null
  return { artifacts, content }
}
