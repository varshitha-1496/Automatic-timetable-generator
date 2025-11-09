import { create } from 'zustand'

// Simple in-memory dataset store populated via CSV uploads
// Expected shapes (free-form for now, just arrays of objects):
// - departments: [{ id, name }]
// - sections: [{ id, department, label }]
// - faculty: [{ id, name, phone }]
// - courses: [{ code, name, type }] // type: 'theory' | 'lab'
// - subjects: [{ id, name, dept_id, year, semester, credits, type }]
// - rooms: [{ id, type }] // type: 'class' | 'lab'
// - assignments: [{ section, course, facultyId }]

const useDataset = create((set, get) => ({
  departments: [],
  sections: [],
  faculty: [],
  courses: [],
  subjects: [],
  rooms: [],
  assignments: [],

  setData: (key, rows) => set({ [key]: rows || [] }),
  appendData: (key, rows) => set((state) => ({ [key]: [ ...(state[key] || []), ...(rows || []) ] })),
  getData: (key) => get()[key] || [],
  reset: () => set({ departments: [], sections: [], faculty: [], courses: [], subjects: [], rooms: [], assignments: [] })
}))

export default useDataset
