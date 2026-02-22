import { create } from "zustand"
import { api, ApiError } from "@/lib/api-client"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  departmentId: string | null
  departmentName: string | null
  avatar: string | null
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
        const data = await api.get<{ user: AuthUser }>("/api/v1/auth/me")
        const user = data.user
        set({ user, isLoading: false })
      } catch {
        set({ user: null, isLoading: false })
      }
    },

    login: async (email, password) => {
      await api.post("/api/v1/auth/login", { email, password })
      await get().fetchUser()
      broadcast("login", get().user)
    },

    register: async (email, password, name) => {
      await api.post("/api/v1/auth/register", { email, password, name })
      await get().fetchUser()
      broadcast("login", get().user)
    },

    logout: async () => {
      await api.post("/api/v1/auth/logout")
      set({ user: null })
      broadcast("logout", null)
    },
  }
})
