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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...customHeaders,
  }

  const config: RequestInit = {
    ...rest,
    headers,
    credentials: "include",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  let response = await fetch(`${BASE_URL}${endpoint}`, config)

  // On 401, try refreshing the token once
  if (response.status === 401 && !endpoint.includes("/auth/refresh")) {
    const refreshRes = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })

    if (refreshRes.ok) {
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

  return response.json() as Promise<T>
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
