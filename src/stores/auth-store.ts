import { create } from "zustand"
import { api, ApiError, setAccessToken } from "@/lib/api-client"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  departmentId: string | null
  departmentName: string | null
  avatar: string | null
}

// Go backend login/refresh response shape (after unwrapping `data`).
interface TokenResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  setUser: (user: AuthUser | null) => void
  fetchUser: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
}

const CHANNEL_NAME = "teamclaw-auth"

export const useAuthStore = create<AuthState>((set, get) => {
  // Cross-tab sync via BroadcastChannel
  if (typeof window !== "undefined") {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = (event) => {
        const { type, user } = event.data as {
          type: "login" | "logout"
          user: AuthUser | null
        }
        if (type === "login") {
          set({ user, isLoading: false })
        } else if (type === "logout") {
          set({ user: null, isLoading: false })
          setAccessToken(null)
        }
      }
    } catch {
      // BroadcastChannel not available in some environments
    }
  }

  function broadcast(type: "login" | "logout", user: AuthUser | null) {
    if (typeof window === "undefined") return
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channel.postMessage({ type, user })
      channel.close()
    } catch {
      // Silently ignore
    }
  }

  return {
    user: null,
    isLoading: true,

    setUser: (user) => set({ user }),

    fetchUser: async () => {
      try {
        set({ isLoading: true })
        // Go backend returns the user object directly inside the `data` envelope (unwrapped by api-client).
        const data = await api.get<AuthUser>("/api/v1/auth/me")
        set({ user: data, isLoading: false })
      } catch {
        set({ user: null, isLoading: false })
      }
    },

    login: async (email, password) => {
      // Go backend returns { accessToken, refreshToken, user } inside `data` envelope.
      const data = await api.post<TokenResponse>("/api/v1/auth/login", {
        email,
        password,
      })
      // Store access token for Bearer auth on subsequent requests.
      if (data?.accessToken) {
        setAccessToken(data.accessToken)
      }
      // Use user from login response directly to skip an extra round-trip.
      if (data?.user) {
        set({ user: data.user, isLoading: false })
      } else {
        await get().fetchUser()
      }
      broadcast("login", get().user)
    },

    register: async (email, password, name) => {
      const data = await api.post<TokenResponse>("/api/v1/auth/register", {
        email,
        password,
        name,
      })
      if (data?.accessToken) {
        setAccessToken(data.accessToken)
      }
      if (data?.user) {
        set({ user: data.user, isLoading: false })
      } else {
        await get().fetchUser()
      }
      broadcast("login", get().user)
    },

    logout: async () => {
      try {
        await api.post("/api/v1/auth/logout")
      } catch {
        // Best-effort; clear local state regardless.
      }
      setAccessToken(null)
      set({ user: null })
      broadcast("logout", null)
    },
  }
})
