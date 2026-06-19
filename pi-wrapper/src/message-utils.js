export function getTextFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

export function extractAssistantText(message) {
  if (!message || message.role !== 'assistant') return ''
  return getTextFromContent(message.content)
}

export function normalizeAssistantMessage({ text = '', thinking = '', message } = {}) {
  if (message?.role === 'assistant' && Array.isArray(message.content)) {
    return message
  }

  const content = []
  if (thinking) content.push({ type: 'thinking', thinking })
  if (text) content.push({ type: 'text', text })
  return {
    role: 'assistant',
    content,
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

export function findLastAssistantMessage(messages) {
  if (!Array.isArray(messages)) return undefined
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'assistant') return message
  }
  return undefined
}

export function textFromToolResult(result) {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return result == null ? '' : String(result)
  if (Array.isArray(result.content)) return getTextFromContent(result.content)
  if (typeof result.output === 'string') return result.output
  return JSON.stringify(result)
}

export function toGatewayHistoryMessage(message, fallbackTimestamp) {
  if (!message || typeof message !== 'object') return undefined
  const timestamp = message.timestamp ?? fallbackTimestamp
  if (message.role === 'user') {
    return {
      role: 'user',
      content: normalizeContent(message.content),
      ...(timestamp ? { timestamp } : {}),
    }
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: normalizeContent(message.content),
      stopReason: message.stopReason,
      errorMessage: message.errorMessage,
      ...(timestamp ? { timestamp } : {}),
    }
  }
  if (message.role === 'toolResult') {
    return {
      role: 'toolResult',
      content: normalizeContent(message.content),
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: Boolean(message.isError),
      ...(timestamp ? { timestamp } : {}),
    }
  }
  if (message.role === 'bashExecution') {
    return {
      role: 'command',
      content: message.output ?? '',
      toolName: 'bash',
      isError: typeof message.exitCode === 'number' ? message.exitCode !== 0 : false,
      ...(timestamp ? { timestamp } : {}),
    }
  }
  return undefined
}

export function gatewayMessagesFromSessionEntries(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => entry?.type === 'message')
    .map((entry) => toGatewayHistoryMessage(entry.message, entry.timestamp))
    .filter(Boolean)
}

function normalizeContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(normalizeContentBlock).filter(Boolean)
}

function normalizeContentBlock(block) {
  if (!block || typeof block !== 'object') return undefined
  if (block.type === 'text') {
    return { type: 'text', text: String(block.text ?? '') }
  }
  if (block.type === 'thinking') {
    return { type: 'thinking', thinking: String(block.thinking ?? '') }
  }
  if (block.type === 'toolCall') {
    return {
      type: 'toolCall',
      id: block.id,
      name: block.name,
      arguments: block.arguments,
    }
  }
  if (block.type === 'image') {
    if (block.source) return block
    if (typeof block.data === 'string') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.mimeType ?? 'image/png',
          data: block.data,
        },
      }
    }
  }
  return block
}
