"use client"

import { AgentCard } from "./agent-card"
import type { AgentOverview } from "@/types/agent"

interface AgentCardGridProps {
  agents: AgentOverview[]
  onSelect: (agent: AgentOverview) => void
  onClone?: (agent: AgentOverview) => void
}

export function AgentCardGrid({ agents, onSelect, onClone }: AgentCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent, i) => (
        <AgentCard
          key={`${agent.instanceId}:${agent.id}`}
          agent={agent}
          index={i}
          onClick={onSelect}
          onClone={onClone}
        />
      ))}
    </div>
  )
}
