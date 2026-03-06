type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown
}

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data: unknown
  ) {
    super(`API Error ${status}: ${statusText}`)
    this.name = "ApiError"
  }
}

// In development: NEXT_PUBLIC_API_URL=http://localhost:3200 points directly to Go backend.
// In production: empty string — nginx proxies /api/v1/* to Go backend.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ""

// Go backend wraps all responses in { code, message, data }.
// This unwraps the envelope so callers receive `data` directly.
function unwrapGoResponse(json: unknown): unknown {
  if (
    json !== null &&
    typeof json === "object" &&
    "code" in (json as Record<string, unknown>) &&
    "data" in (json as Record<string, unknown>)
  ) {
    return (json as { code: number; data: unknown }).data
  }
  return json
}

// Token storage — kept in memory; survives page navigations but not hard refreshes.
// Hard refresh: fetchUser() re-authenticates via the httpOnly access_token cookie.
let _accessToken: string | null = null
let _refreshToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

export function setRefreshToken(token: string | null) {
  _refreshToken = token
}

export function getRefreshToken(): string | null {
  return _refreshToken
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...customHeaders,
  }

  // Attach Bearer token when available (Go backend prefers this over cookie).
  if (_accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${_accessToken}`
  }

  const config: RequestInit = {
    ...rest,
    headers,
    credentials: "include", // keep sending cookie for Next.js middleware
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  let response = await fetch(`${BASE_URL}${endpoint}`, config)

  // On 401, try refreshing the token once
  if (response.status === 401 && !endpoint.includes("/auth/refresh")) {
    const refreshBody = _refreshToken
      ? JSON.stringify({ refreshToken: _refreshToken })
      : undefined
    const refreshHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (_accessToken) refreshHeaders["Authorization"] = `Bearer ${_accessToken}`

    const refreshRes = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: refreshHeaders,
      body: refreshBody,
    })

    if (refreshRes.ok) {
      const refreshJson = await refreshRes.json()
      const refreshData = unwrapGoResponse(refreshJson) as {
        accessToken?: string
        refreshToken?: string
      } | null

      if (refreshData?.accessToken) {
        _accessToken = refreshData.accessToken
        ;(headers as Record<string, string>)["Authorization"] = `Bearer ${_accessToken}`
        config.headers = headers
      }
      if (refreshData?.refreshToken) {
        _refreshToken = refreshData.refreshToken
      }

      response = await fetch(`${BASE_URL}${endpoint}`, config)
    }
  }

  if (!response.ok) {
    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = null
    }
    throw new ApiError(response.status, response.statusText, data)
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return undefined as T
  }

  const json = await response.json()
  return unwrapGoResponse(json) as T
}

export const api = {
  get<T>(endpoint: string, options?: RequestOptions) {
    return request<T>(endpoint, { ...options, method: "GET" })
  },
  post<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return request<T>(endpoint, { ...options, method: "POST", body })
  },
  put<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return request<T>(endpoint, { ...options, method: "PUT", body })
  },
  patch<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return request<T>(endpoint, { ...options, method: "PATCH", body })
  },
  delete<T>(endpoint: string, options?: RequestOptions) {
    return request<T>(endpoint, { ...options, method: "DELETE" })
  },
}

export { ApiError }
