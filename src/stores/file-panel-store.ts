"use client"

import { create } from "zustand"
import type { SessionFileEntry } from "@/types/session-files"

export type SessionFileZone = "input" | "output"

interface SelectedFile {
  zone: SessionFileZone
  entry: SessionFileEntry
}

interface FilePanelState {
  selectedFile: SelectedFile | null
  setSelectedFile: (file: SelectedFile | null) => void
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
  reset: () => void
}

export const useFilePanelStore = create<FilePanelState>((set) => ({
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  expandedDirs: new Set<string>(),
  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { expandedDirs: next }
    }),
  reset: () => set({ selectedFile: null, expandedDirs: new Set() }),
}))
