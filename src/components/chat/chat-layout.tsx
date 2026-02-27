"use client"

import { useChatStore } from "@/stores/chat-store"
import { ChatSidebar } from "./chat-sidebar"
import { ChatMain } from "./chat-main"
import { ChatFilePanel } from "./file-panel/chat-file-panel"

export function ChatLayout() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const selectedAgent = useChatStore((s) => s.selectedAgent)

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && <ChatSidebar />}
      <ChatMain />
      {activeSessionId && selectedAgent?.hasContainer !== false && <ChatFilePanel />}
    </div>
  )
}
