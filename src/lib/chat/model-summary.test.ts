import { describe, expect, it } from 'vitest'
import {
  formatChatModelLabel,
  resolveChatModelSummary,
  resolveOpenClawChatModelSummary,
  resolvePiChatModelSummary,
} from './model-summary'

const config = {
  agents: {
    defaults: {
      model: {
        primary: 'openai/gpt-primary',
        fallbacks: ['anthropic/claude-fallback'],
      },
    },
    list: [
      {
        id: 'telecom',
        model: 'openai/gpt-agent',
      },
    ],
  },
  models: {
    providers: {
      openai: {
        models: [
          { id: 'gpt-primary', name: 'GPT Primary' },
          { id: 'gpt-agent', name: 'GPT Agent' },
        ],
      },
      anthropic: {
        models: [
          { id: 'claude-fallback', name: 'Claude Fallback' },
        ],
      },
    },
  },
}

describe('chat model summary', () => {
  it('uses the active session model before the configured primary', () => {
    expect(
      resolveOpenClawChatModelSummary({
        config,
        agentId: 'telecom',
        session: {
          modelProvider: 'anthropic',
          model: 'claude-fallback',
        },
      }),
    ).toEqual({
      ref: 'anthropic/claude-fallback',
      label: 'Claude Fallback',
      source: 'session',
    })
  })

  it('ignores OpenClaw gateway-injected session model metadata', () => {
    expect(
      resolveOpenClawChatModelSummary({
        config,
        agentId: 'main',
        session: {
          modelProvider: 'openclaw',
          model: 'gateway-injected',
        },
      }),
    ).toEqual({
      ref: 'openai/gpt-primary',
      label: 'GPT Primary',
      source: 'default',
    })
  })

  it('uses an agent model before the default model', () => {
    expect(
      resolveOpenClawChatModelSummary({
        config,
        agentId: 'telecom',
      }),
    ).toEqual({
      ref: 'openai/gpt-agent',
      label: 'GPT Agent',
      source: 'agent',
    })
  })

  it('uses the default primary model when no agent model exists', () => {
    expect(
      resolveOpenClawChatModelSummary({
        config,
        agentId: 'main',
      }),
    ).toEqual({
      ref: 'openai/gpt-primary',
      label: 'GPT Primary',
      source: 'default',
    })
  })

  it('uses pi settings for pi runtime', () => {
    expect(
      resolvePiChatModelSummary({
        config: {
          providers: {
            anthropic: {
              models: [{ id: 'claude-fallback', name: 'Claude Fallback' }],
            },
          },
        },
        settings: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-fallback',
        },
      }),
    ).toEqual({
      ref: 'anthropic/claude-fallback',
      label: 'Claude Fallback',
      source: 'pi-settings',
    })
  })

  it('returns null when the selected runtime has no model config', () => {
    expect(
      resolveChatModelSummary({
        runtime: 'pi',
        config: {},
        agentId: 'telecom',
      }),
    ).toBeNull()
  })

  it('falls back to the model id as the compact label', () => {
    expect(formatChatModelLabel('custom/vendor-model-v1', {})).toBe('vendor-model-v1')
  })
})
