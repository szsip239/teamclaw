'use client'

import type { ChatRuntime } from '@/lib/chat/runtime'
import { cn } from '@/lib/utils'

interface ChatRuntimeIconProps {
  runtime: ChatRuntime
  className?: string
}

export function ChatRuntimeIcon({ runtime, className }: ChatRuntimeIconProps) {
  const isFast = runtime === 'pi'
  const src = isFast
    ? '/icons/runtime-pi-robot.png?v=20260619-2'
    : '/icons/runtime-normal-robot.png?v=20260619-2'

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={cn('block size-8 shrink-0 object-contain', className)}
      draggable={false}
    />
  )
}
