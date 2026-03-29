"use client"

import { KbCard } from "./kb-card"
import type { KnowledgeBaseOverview } from "@/types/knowledge-base"

interface KbCardGridProps {
  knowledgeBases: KnowledgeBaseOverview[]
  onSelect: (kb: KnowledgeBaseOverview) => void
}

export function KbCardGrid({ knowledgeBases, onSelect }: KbCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {knowledgeBases.map((kb, i) => (
        <KbCard
          key={kb.id}
          kb={kb}
          index={i}
          onClick={onSelect}
        />
      ))}
    </div>
  )
}
