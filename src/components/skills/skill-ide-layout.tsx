"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SkillFileTree } from "./skill-file-tree"
import { SkillEditor } from "./skill-editor"
import { SkillMetadataPanel } from "./skill-metadata-panel"
import { SkillInstallationsTab } from "./skill-installations-tab"
import { Code, Info, Download } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { SkillDetail } from "@/types/skill"

interface SkillIdeLayoutProps {
  skill: SkillDetail
  canEdit: boolean
}

export function SkillIdeLayout({ skill, canEdit }: SkillIdeLayoutProps) {
  const t = useT()
  const [selectedFile, setSelectedFile] = useState<string | null>("SKILL.md")

  return (
    <div className="flex flex-1 gap-0 min-h-0 rounded-lg border overflow-hidden">
      {/* Left: File tree */}
      <div className="w-56 shrink-0 border-r bg-muted/30">
        <SkillFileTree
          skillId={skill.id}
          selectedPath={selectedFile}
          onSelectFile={setSelectedFile}
          canEdit={canEdit}
        />
      </div>

      {/* Center: Editor */}
      <div className="flex-1 min-w-0">
        <SkillEditor
          skillId={skill.id}
          filePath={selectedFile}
          canEdit={canEdit}
        />
      </div>

      {/* Right: Info panel */}
      <div className="w-72 shrink-0 border-l">
        <Tabs defaultValue="info" className="flex flex-col h-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-2">
            <TabsTrigger value="info" className="gap-1.5 text-[12px]">
              <Info className="size-3" />
              {t('skill.infoTab')}
            </TabsTrigger>
            <TabsTrigger value="installations" className="gap-1.5 text-[12px]">
              <Download className="size-3" />
              {t('skill.installTab')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="info" className="flex-1 overflow-y-auto p-4 mt-0">
            <SkillMetadataPanel skill={skill} skillId={skill.id} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="installations" className="flex-1 overflow-y-auto p-4 mt-0">
            <SkillInstallationsTab skillId={skill.id} canEdit={canEdit} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
