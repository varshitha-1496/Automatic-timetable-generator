import { create } from 'zustand'

// Holds generated timetables and global timing config
const useTimetables = create((set) => ({
  periodTimes: [], // array of strings like '09:00 - 09:50'
  bySection: {},   // { [sectionId]: timetableObject }

  setPeriodTimes: (arr) => set({ periodTimes: Array.isArray(arr) ? arr : [] }),
  setSectionTimetable: (sectionId, tt) => set((s) => ({ bySection: { ...s.bySection, [sectionId]: tt || {} } })),
  replaceAll: (payload) => set({ periodTimes: payload.periodTimes || [], bySection: payload.bySection || {} }),
  reset: () => set({ periodTimes: [], bySection: {} })
}))

export default useTimetables
