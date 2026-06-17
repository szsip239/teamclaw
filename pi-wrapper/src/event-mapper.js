import {
  extractAssistantText,
  findLastAssistantMessage,
  normalizeAssistantMessage,
  textFromToolResult,
} from './message-utils.js'

export function createPiEventBridge({ runId, emit }) {
  const state = {
    text: '',
    thinking: '',
    finalSent: false,
  }

  function emitChatDelta(deltaText) {
    emit('chat', {
      runId,
      state: 'delta',
      deltaText,
      message: normalizeAssistantMessage({
        text: state.text,
        thinking: state.thinking,
      }),
    })
  }

  function emitFinal(message) {
    if (state.finalSent) return
    state.finalSent = true
    const finalMessage = normalizeAssistantMessage({
      text: state.text || extractAssistantText(message),
      thinking: state.thinking,
      message,
    })
    emit('chat', {
      runId,
      state: 'final',
      message: finalMessage,
    })
  }

  function handleMessageUpdate(event) {
    const delta = event.assistantMessageEvent ?? {}
    if (delta.type === 'text_delta') {
      const text = typeof delta.delta === 'string' ? delta.delta : ''
      if (!text) return
      state.text += text
      emitChatDelta(text)
      return
    }
    if (delta.type === 'text_end') {
      if (typeof delta.content === 'string') state.text = delta.content
      return
    }
    if (delta.type === 'thinking_delta') {
      const thinking = typeof delta.delta === 'string' ? delta.delta : ''
      if (!thinking) return
      state.thinking += thinking
      emitChatDelta(undefined)
      return
    }
    if (delta.type === 'thinking_end') {
      if (typeof delta.content === 'string') state.thinking = delta.content
      return
    }
    if (delta.type === 'error') {
      emit('chat', {
        runId,
        state: delta.reason === 'aborted' ? 'aborted' : 'error',
        errorMessage: delta.errorMessage ?? delta.message ?? 'pi agent error',
      })
    }
  }

  function handleMessageEnd(event) {
    const message = event.message
    if (message?.role !== 'assistant') return
    const stopReason = message.stopReason
    if (stopReason === 'toolUse') return
    if (stopReason === 'error') {
      emit('chat', {
        runId,
        state: 'error',
        errorMessage: message.errorMessage ?? 'pi agent error',
      })
      return
    }
    if (stopReason === 'aborted') {
      emit('chat', {
        runId,
        state: 'aborted',
        errorMessage: message.errorMessage ?? 'Conversation aborted',
      })
      return
    }
    emitFinal(message)
  }

  function handleAgentEnd(event) {
    emit('agent', {
      runId,
      stream: 'lifecycle',
      data: { phase: 'end' },
    })
    if (state.finalSent) return
    const lastAssistant = findLastAssistantMessage(event.messages)
    if (!lastAssistant || lastAssistant.stopReason === 'toolUse') return
    handleMessageEnd({ message: lastAssistant })
  }

  function handleToolStart(event) {
    emit('agent', {
      runId,
      stream: 'item',
      data: {
        kind: 'tool',
        phase: 'start',
        id: event.toolCallId,
        name: event.toolName ?? 'tool',
        args: event.args ?? {},
      },
    })
  }

  function handleToolUpdate(event) {
    const output = textFromToolResult(event.partialResult)
    if (!output) return
    emit('agent', {
      runId,
      stream: 'command_output',
      data: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        output,
      },
    })
  }

  function handleToolEnd(event) {
    emit('agent', {
      runId,
      stream: 'item',
      data: {
        kind: 'tool',
        phase: 'end',
        id: event.toolCallId,
        name: event.toolName ?? 'tool',
        result: textFromToolResult(event.result),
        isError: Boolean(event.isError),
      },
    })
  }

  return {
    handle(event) {
      if (!event || typeof event !== 'object') return
      switch (event.type) {
        case 'agent_start':
          emit('agent', {
            runId,
            stream: 'lifecycle',
            data: { phase: 'start' },
          })
          break
        case 'agent_end':
          handleAgentEnd(event)
          break
        case 'message_update':
          handleMessageUpdate(event)
          break
        case 'message_end':
          handleMessageEnd(event)
          break
        case 'tool_execution_start':
          handleToolStart(event)
          break
        case 'tool_execution_update':
          handleToolUpdate(event)
          break
        case 'tool_execution_end':
          handleToolEnd(event)
          break
        default:
          break
      }
    },
    emitFinal,
  }
}
