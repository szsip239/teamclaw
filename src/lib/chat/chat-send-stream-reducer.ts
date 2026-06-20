import type { ChatStreamEvent } from '@/types/chat'
import {
  extractImagesFromGatewayMessage,
  extractTextFromGatewayMessage,
  extractThinkingFromGatewayMessage,
} from './gateway-message-content'
import { computeTextDelta } from './stream-delta'

export interface ChatSendStreamState {
  lastTextContent: string
  lastThinkingContent: string
  lastImageCount: number
}

export interface ChatSendStreamUpdateInput {
  message: unknown
  deltaText?: string
  replace?: boolean
  skipDuplicateText?: boolean
}

export interface CapturedStreamImage {
  imageUrl: string
  mimeType?: string
}

export interface ChatSendStreamUpdateResult {
  state: ChatSendStreamState
  events: ChatStreamEvent[]
  capturedImages: CapturedStreamImage[]
}

export function initialChatSendStreamState(): ChatSendStreamState {
  return {
    lastTextContent: '',
    lastThinkingContent: '',
    lastImageCount: 0,
  }
}

export function reduceChatMessageStreamUpdate(
  state: ChatSendStreamState,
  input: ChatSendStreamUpdateInput,
): ChatSendStreamUpdateResult {
  const events: ChatStreamEvent[] = []
  const capturedImages: CapturedStreamImage[] = []
  const nextState = { ...state }

  const thinkingContent = extractThinkingFromGatewayMessage(input.message)
  if (thinkingContent && thinkingContent !== state.lastThinkingContent) {
    const newThinking = thinkingContent.slice(state.lastThinkingContent.length)
    if (newThinking) events.push({ type: 'thinking', content: newThinking })
    nextState.lastThinkingContent = thinkingContent
  }

  const textContent = extractTextFromGatewayMessage(input.message)
  if (!(input.skipDuplicateText && textContent === state.lastTextContent)) {
    const tdelta = computeTextDelta({
      deltaText: input.deltaText,
      replace: input.replace,
      cumulative: textContent,
      lastEmitted: state.lastTextContent,
    })
    if (tdelta.text) events.push({ type: 'text', content: tdelta.text })
    nextState.lastTextContent = tdelta.nextLast
  }

  const images = extractImagesFromGatewayMessage(input.message)
  for (let i = state.lastImageCount; i < images.length; i++) {
    events.push({
      type: 'image',
      imageUrl: images[i].url,
      mimeType: images[i].mimeType,
      alt: images[i].alt,
    })
    capturedImages.push({ imageUrl: images[i].url, mimeType: images[i].mimeType })
  }
  nextState.lastImageCount = images.length

  return { state: nextState, events, capturedImages }
}
