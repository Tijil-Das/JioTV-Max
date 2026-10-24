import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthMode, AuthSession, AuthUser } from '@shared/types'
import { authService } from '@/services/authService'

import { safeLocalStorage } from '@/lib/safeStorage'

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated'

interface AuthState {
  user: AuthUser | null
  status: AuthStatus
  lastError: string | null
  setAuthenticating: () => void
  setSession: (session: AuthSession) => void
  setError: (message: string | null) => void
  signOut: (mode: AuthMode) => Promise<void>
}

/**
 * Only the user profile and auth status are persisted. Tokens live in the
 * main process (safeStorage) — never in localStorage.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      status: 'anonymous',
      lastError: null,
      setAuthenticating: () => set({ status: 'authenticating', lastError: null }),
      setSession: (session) =>
        set({ user: session.user, status: 'authenticated', lastError: null }),
      setError: (message) => set({ lastError: message, status: 'anonymous' }),
      signOut: async (mode) => {
        await authService.logout(mode)
        set({ user: null, status: 'anonymous', lastError: null })
      }
    }),
    {
      name: 'streamdeck-auth',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        user: state.user,
        status: state.user?.mode === 'jio' && state.status === 'authenticated' ? 'authenticated' : 'anonymous'
      })
    }
  )
)
