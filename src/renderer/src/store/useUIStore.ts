import { create } from 'zustand'

export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

interface UIState {
  loginOpen: boolean
  loginReason: string | null
  searchOpen: boolean
  toasts: Toast[]
  openLogin: (reason?: string) => void
  closeLogin: () => void
  setSearchOpen: (open: boolean) => void
  pushToast: (toast: Omit<Toast, 'id' | 'variant' | 'duration'> & { variant?: ToastVariant; duration?: number }) => string
  dismissToast: (id: string) => void
}

let toastCounter = 0

export const useUIStore = create<UIState>((set, get) => ({
  loginOpen: false,
  loginReason: null,
  searchOpen: false,
  toasts: [],
  openLogin: (reason) =>
    set((state) => ({
      loginOpen: true,
      loginReason: reason ?? state.loginReason
    })),
  closeLogin: () => set({ loginOpen: false, loginReason: null }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  pushToast: (input) => {
    const id = `toast-${Date.now()}-${toastCounter++}`
    const toast: Toast = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant ?? 'default',
      duration: input.duration ?? 3200
    }
    set((state) => ({ toasts: [...state.toasts.slice(-2), toast] }))
    if (toast.duration > 0) {
      setTimeout(() => {
        if (get().toasts.some((item) => item.id === id)) get().dismissToast(id)
      }, toast.duration)
    }
    return id
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))
