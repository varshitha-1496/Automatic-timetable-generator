import { create } from 'zustand'

const useUI = create((set) => ({
  mode: 'dark',
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' }))
}))

export default useUI
