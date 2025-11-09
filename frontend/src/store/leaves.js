import { create } from 'zustand'
import useNotifications from './notifications'

const useLeaves = create((set, get) => ({
  requests: [
    // { id:'lv1', facultyId:'FAC123', facultyName:'Prof. Rao', date:'2025-11-10', session:'Full Day', reason:'Medical', status:'pending' }
  ],
  submit: ({ facultyId, facultyName, date, session, reason }) => set((s) => ({
    requests: [{ id: `lv${Date.now()}`, facultyId, facultyName, date, session, reason, status: 'pending' }, ...s.requests]
  })),
  approve: (id) => {
    const n = useNotifications.getState()
    set((s) => ({ requests: s.requests.map(r => r.id === id ? { ...r, status: 'approved' } : r) }))
    n.push({ id: `n${Date.now()}`, title: 'Leave approved', body: 'Your leave request has been approved by Admin.', read: false, ts: Date.now() })
  },
  reject: (id) => {
    const n = useNotifications.getState()
    set((s) => ({ requests: s.requests.map(r => r.id === id ? { ...r, status: 'rejected' } : r) }))
    n.push({ id: `n${Date.now()}`, title: 'Leave rejected', body: 'Your leave request has been rejected by Admin.', read: false, ts: Date.now() })
  }
}))

export default useLeaves
