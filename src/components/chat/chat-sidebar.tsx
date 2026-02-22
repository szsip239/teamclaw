"use client"

import { ChatSidebarHeader } from "./chat-sidebar-header"
import { ChatAgentList } from "./chat-agent-list"
import { ChatSessionList } from "./chat-session-list"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useT } from "@/stores/language-store"

export function ChatSidebar() {
  const t = useT()
  return (
    <div className="border-r flex w-72 shrink-0 flex-col bg-muted/30">
      <ChatSidebarHeader />
      <Separator />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-3">
          <p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase tracking-wider">
            Agents
          </p>
          <ChatAgentList />
        </div>
        <Separator className="my-2" />
        <div className="flex flex-col gap-1 p-3">
          <p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase tracking-wider">
            {t('chat.recentSessions')}
          </p>
          <ChatSessionList />
        </div>
      </ScrollArea>
    </div>
  )
}
