"use client"

import type { SessionFileEntry } from "@/types/session-files"
import type { SessionFileZone } from "@/stores/file-panel-store"
import { useT } from "@/stores/language-store"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Download, Trash2, FolderPlus } from "lucide-react"

interface FileContextMenuProps {
  children: React.ReactNode
  entry: SessionFileEntry
  zone: SessionFileZone
  sessionId: string
  onDownload: () => void
  onDelete: () => void
  onNewFolder: () => void
}

export function FileContextMenu({
  children,
  entry,
  zone,
  onDownload,
  onDelete,
  onNewFolder,
}: FileContextMenuProps) {
  const t = useT()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {entry.type === "file" && (
          <ContextMenuItem onClick={onDownload}>
            <Download />
            {t("filePanel.download")}
          </ContextMenuItem>
        )}
        {zone === "input" && (
          <>
            <ContextMenuItem onClick={onNewFolder}>
              <FolderPlus />
              {t("filePanel.newFolder")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              {t("filePanel.delete")}
            </ContextMenuItem>
          </>
        )}
        {zone === "output" && entry.type === "file" && null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
