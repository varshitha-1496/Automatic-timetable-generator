import { create } from 'zustand'
import useNotifications from './notifications'

const keyIn = (fid) => `rq_in_${fid}`
const keyOut = (fid) => `rq_out_${fid}`
const readLS = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] }
}
const writeLS = (k, arr) => {
  try { localStorage.setItem(k, JSON.stringify(arr)) } catch {}
}

// Simple mock workflow store
const useRequests = create((set, get) => ({
  incoming: [
    // { id:'rq1', from:'FAC221', fromName:'Ms. Priya', to:'you', section:'A1', day:'Mon', period:'2', subject:'ENG101', room:'R-110', status:'pending' }
  ],
  outgoing: [],
  sendRequest: (payload) => {
    const withId = { id: `rq${Date.now()}`, status: 'pending', ...payload }
    set((s) => ({ outgoing: [withId, ...s.outgoing] }))
    const outKey = keyOut(String(payload.from || ''))
    const prev = readLS(outKey)
    writeLS(outKey, [withId, ...prev])
  },
  receiveRequest: (payload) => {
    const withId = { id: `rq${Date.now()}`, status: 'pending', ...payload }
    set((s) => ({ incoming: [withId, ...s.incoming] }))
    const inKey = keyIn(String(payload.to || ''))
    const prev = readLS(inKey)
    writeLS(inKey, [withId, ...prev])
  },
  getIncomingFor: (fid) => {
    const mem = get().incoming.filter(r => String(r.to || '') === String(fid))
    const persisted = readLS(keyIn(String(fid)))
    return [...persisted, ...mem]
  },
  getOutgoingFor: (fid) => {
    const mem = get().outgoing.filter(r => String(r.from || '') === String(fid))
    const persisted = readLS(keyOut(String(fid)))
    return [...persisted, ...mem]
  },
  acceptRequest: (id) => {
    const { incoming, outgoing } = get()
    const nStore = useNotifications.getState()
    const map = (arr) => arr.map(r => r.id === id ? { ...r, status: 'accepted' } : r)
    set({ incoming: map(incoming), outgoing: map(outgoing) })
    // Notify students (mock)
    nStore.push({ id: `n${Date.now()}`, title: 'Schedule updated', body: 'A class timing or faculty changed. Check your timetable.', read: false, ts: Date.now() })
  },
  declineRequest: (id) => {
    const { incoming, outgoing } = get()
    const map = (arr) => arr.map(r => r.id === id ? { ...r, status: 'declined' } : r)
    set({ incoming: map(incoming), outgoing: map(outgoing) })
  }
}))

export default useRequests
