import { NextResponse } from 'next/server'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import type { ConfigSchemaResult, ConfigGetResult } from '@/types/gateway'

// GET /api/v1/instances/[id]/schema — Fetch config.schema + config.get from gateway
// Returns both schema and current config in a single call for the config editor.
// Uses registry.request() to avoid globalThis singleton stale method issue.
export const GET = withAuth(
  withPermission('instances:manage', async (_req, ctx) => {
    const id = param(ctx, 'id')
    await ensureRegistryInitialized()

    if (!registry.isConnected(id)) {
      return NextResponse.json(
        { error: '实例未连接，无法获取 Schema' },
        { status: 400 },
      )
    }

    try {
      const [schemaResult, configResult] = await Promise.all([
        registry.request(id, 'config.schema') as Promise<ConfigSchemaResult>,
        registry.request(id, 'config.get') as Promise<ConfigGetResult>,
      ])

      return NextResponse.json({
        schema: schemaResult.schema,
        uiHints: schemaResult.uiHints,
        version: schemaResult.version,
        config: configResult.config,
        hash: configResult.hash,
      })
    } catch (err) {
      return NextResponse.json(
        { error: `获取配置数据失败: ${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
