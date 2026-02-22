import { NextResponse } from 'next/server'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { getProviderInfoList } from '@/lib/resources/providers'
import type { ResourceType, ProviderListResponse } from '@/types/resource'

// GET /api/v1/resources/providers — List built-in providers
export const GET = withAuth(
  withPermission('resources:manage', async (req) => {
    const url = new URL(req.url)
    const type = url.searchParams.get('type') as ResourceType | null

    const response: ProviderListResponse = {
      providers: getProviderInfoList(type ?? undefined),
    }

    return NextResponse.json(response)
  }),
)
