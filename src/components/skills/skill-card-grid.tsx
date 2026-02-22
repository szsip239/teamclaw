"use client"

import { SkillCard } from "./skill-card"
import type { SkillOverview } from "@/types/skill"

interface SkillCardGridProps {
  skills: SkillOverview[]
  onSelect: (skill: SkillOverview) => void
}

export function SkillCardGrid({ skills, onSelect }: SkillCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {skills.map((skill, i) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          index={i}
          onClick={onSelect}
        />
      ))}
    </div>
  )
}
