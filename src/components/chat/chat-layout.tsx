"use client"

import { useChatStore } from "@/stores/chat-store"
import { ChatSidebar } from "./chat-sidebar"
import { ChatMain } from "./chat-main"

export function ChatLayout() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && <ChatSidebar />}
      <ChatMain />
    </div>
  )
}
