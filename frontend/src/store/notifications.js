import { create } from 'zustand'

const initial = [
  { id: 'n1', title: 'Classroom change', body: 'PHY101 moved to R-210 at P3 (Thu).', read: false, ts: Date.now() - 3600_000 },
  { id: 'n2', title: 'Faculty substitute', body: 'CSE102 today handled by Prof. Rao.', read: false, ts: Date.now() - 1800_000 },
  { id: 'n3', title: 'Holiday notice', body: 'College closed on Friday due to event.', read: true, ts: Date.now() - 86_400_000 },
]

const useNotifications = create((set, get) => ({
  items: initial,
  unreadCount: initial.filter(n => !n.read).length,
  push: (n) => set((s) => ({ items: [n, ...s.items], unreadCount: s.unreadCount + (n.read ? 0 : 1) })),
  markRead: (id) => set((s) => {
    const items = s.items.map(n => n.id === id ? { ...n, read: true } : n)
    return { items, unreadCount: items.filter(n => !n.read).length }
  }),
  markAllRead: () => set((s) => ({ items: s.items.map(n => ({ ...n, read: true })), unreadCount: 0 })),
  clear: () => set({ items: [], unreadCount: 0 })
}))

export default useNotifications
