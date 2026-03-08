"use client"

import { useChatStore } from "@/stores/chat-store"
import { useIsMobile } from "@/hooks/use-mobile"
import { useT } from "@/stores/language-store"
import { ChatSidebar } from "./chat-sidebar"
import { ChatMain } from "./chat-main"
import { ChatFilePanel } from "./file-panel/chat-file-panel"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

export function ChatLayout() {
  const t = useT()
  const isMobile = useIsMobile()
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const selectedAgent = useChatStore((s) => s.selectedAgent)

  const mobileSidebarOpen = useChatStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen)
  const mobileFilePanelOpen = useChatStore((s) => s.mobileFilePanelOpen)
  const setMobileFilePanelOpen = useChatStore((s) => s.setMobileFilePanelOpen)

  const showFilePanel = activeSessionId && selectedAgent?.hasContainer !== false

  if (isMobile) {
    return (
      <div className="flex h-full overflow-hidden">
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-none p-0 [&>button]:hidden" showCloseButton={false}>
            <SheetHeader className="sr-only">
              <SheetTitle>{t('chat.agents')}</SheetTitle>
              <SheetDescription>{t('chat.agents')}</SheetDescription>
            </SheetHeader>
            <ChatSidebar className="h-full w-full" />
          </SheetContent>
        </Sheet>

        <ChatMain />

        {showFilePanel && (
          <Sheet open={mobileFilePanelOpen} onOpenChange={setMobileFilePanelOpen}>
            <SheetContent side="right" className="w-[85vw] max-w-none p-0 [&>button]:hidden" showCloseButton={false}>
              <SheetHeader className="sr-only">
                <SheetTitle>{t('filePanel.title')}</SheetTitle>
                <SheetDescription>{t('filePanel.title')}</SheetDescription>
              </SheetHeader>
              <ChatFilePanel className="h-full w-full" />
            </SheetContent>
          </Sheet>
        )}
      </div>
    )
  }

  // Desktop: identical to original layout, only adds className props
  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && <ChatSidebar className="border-r w-72 shrink-0" />}
      <ChatMain />
      {showFilePanel && <ChatFilePanel className="border-l w-96 shrink-0" />}
    </div>
  )
}
