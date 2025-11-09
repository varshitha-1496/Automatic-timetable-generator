import { Router } from 'express'
import { getModels } from './models.js'
import { getUserModels } from '../users/models.js'

const router = Router()

// Helper to catch async errors
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Conflict detection helpers
const dayOrder = ['Mon','Tue','Wed','Thu','Fri','Sat']

function normalizeCellVal(val) {
  if (!val) return null
  if (typeof val === 'string') return null
  return val
}

// Faculty-subject capability check
function canFacultyTeachSubject(faculty, subject) {
  const list = Array.isArray(faculty?.subjects_can_teach) ? faculty.subjects_can_teach : []
  if (!list.length) return true // wildcard: can teach any
  const lower = new Set(list.map(x => (x ?? '').toString().toLowerCase()))
  const sid = (subject?.subject_id ?? '').toString().toLowerCase()
  const sname = (subject?.subject_name ?? '').toString().toLowerCase()
  return lower.has(sid) || lower.has(sname)
}

// Accepts either object map by day->period->val or 2D array [day][period]
function extractFacultyAssignments(bySection, periodTimes = []) {
  const assignments = [] // { section, day, periodIndex, facultyId }
  const perDayPeriods = (Array.isArray(periodTimes) && periodTimes.length) ? periodTimes.length : 8
  for (const [section, grid] of Object.entries(bySection || {})) {
    if (!grid) continue
    if (Array.isArray(grid)) {
      // 2D array
      for (let d = 0; d < Math.min(grid.length, dayOrder.length); d++) {
        const row = grid[d] || []
        for (let p = 0; p < Math.min(row.length || perDayPeriods, perDayPeriods); p++) {
          const cell = row[p]
          const val = normalizeCellVal(cell)
          const fid = val?.faculty?.id || val?.faculty?.faculty_id
          if (fid) assignments.push({ section, day: dayOrder[d], periodIndex: p, facultyId: String(fid) })
        }
      }
    } else if (typeof grid === 'object') {
      // Object map per day
      for (const d of dayOrder) {
        const rowObj = grid[d] || grid[d.toLowerCase()] || grid[d.toUpperCase()]
        if (!rowObj) continue
        for (let p = 0; p < perDayPeriods; p++) {
          const key = String(p + 1)
          const cell = rowObj[key]
          const val = normalizeCellVal(cell)
          const fid = val?.faculty?.id || val?.faculty?.faculty_id
          if (fid) assignments.push({ section, day: d, periodIndex: p, facultyId: String(fid) })
        }
      }
    }
  }
  return assignments
}

function detectFacultyConflicts(bySection, periodTimes = []) {
  const assn = extractFacultyAssignments(bySection, periodTimes)
  const map = new Map() // key: day|p -> Map(fid -> [sections])
  for (const a of assn) {
    const key = `${a.day}|${a.periodIndex}`
    if (!map.has(key)) map.set(key, new Map())
    const m = map.get(key)
    if (!m.has(a.facultyId)) m.set(a.facultyId, new Set())
    m.get(a.facultyId).add(a.section)
  }
  const conflicts = []
  for (const [key, m] of map.entries()) {
    const [day, pIdxStr] = key.split('|')
    const pNum = Number(pIdxStr) + 1
    for (const [fid, secsSet] of m.entries()) {
      const secs = Array.from(secsSet)
      if (secs.length > 1) {
        conflicts.push({ facultyId: fid, day, period: pNum, sections: secs })
      }
    }
  }
  return conflicts
}

// Create notifications for students when a timetable is published or rescheduled
async function notifyTimetablePublished(doc) {
  const { Notification } = await getUserModels()
  const entries = []
  for (const section_id of Object.keys(doc.bySection || {})) {
    entries.push({
      type: 'timetable_published',
      message: `New timetable published for ${doc.dept_id} • Year ${doc.year} • Sem ${doc.semester}`,
      dept_id: doc.dept_id,
      year: doc.year,
      semester: doc.semester,
      section_id,
      date: new Date().toISOString().slice(0,10),
      day: '',
      faculty_id: '',
      faculty_name: '',
      periods: []
    })
  }
  if (entries.length) await Notification.insertMany(entries)
}

// Diff two timetables and create simple per-day reschedule notifications (period numbers only)
function diffTimetables(oldDoc, newDoc) {
  const changes = [] // { section_id, day, periods: ["1","2"] }
  const days = dayOrder
  const bySecOld = oldDoc?.bySection || {}
  const bySecNew = newDoc?.bySection || {}
  for (const [sec, gridNew] of Object.entries(bySecNew)) {
    const gridOld = bySecOld[sec]
    if (!gridOld) continue
    // Only support 2D array format here (generator output)
    if (Array.isArray(gridOld) && Array.isArray(gridNew)) {
      for (let d = 0; d < Math.min(gridNew.length, days.length); d++) {
        const rowNew = gridNew[d] || []
        const rowOld = gridOld[d] || []
        const changed = []
        for (let p = 0; p < Math.max(rowNew.length, rowOld.length); p++) {
          const a = rowOld[p]
          const b = rowNew[p]
          const aLabel = a && typeof a === 'object' ? a.label : a
          const bLabel = b && typeof b === 'object' ? b.label : b
          const aFac = a && a.faculty ? (a.faculty.id || a.faculty.faculty_id || a.faculty.name) : ''
          const bFac = b && b.faculty ? (b.faculty.id || b.faculty.faculty_id || b.faculty.name) : ''
          const aRoom = a && a.room || ''
          const bRoom = b && b.room || ''
          if (aLabel !== bLabel || aFac !== bFac || aRoom !== bRoom) changed.push(String(p + 1))
        }
        if (changed.length) changes.push({ section_id: sec, day: days[d], periods: changed })
      }
    }
  }
  return changes
}

// Generic list endpoints
router.get('/departments', asyncH(async (req, res) => {
  const { Department } = await getModels()
  const rows = await Department.find().lean()
  res.json(rows)
}))
router.post('/departments/bulk', asyncH(async (req, res) => {
  const { Department } = await getModels()
  const docs = req.body || []
  const ops = docs.map(d => ({ updateOne: { filter: { dept_id: d.dept_id }, update: { $set: d }, upsert: true } }))
  if (ops.length) await Department.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

router.get('/subjects', asyncH(async (req, res) => {
  const { Subject } = await getModels()
  const rows = await Subject.find().lean()
  res.json(rows)
}))
router.post('/subjects/bulk', asyncH(async (req, res) => {
  const { Subject } = await getModels()
  const docs = req.body || []
  const ops = docs.map(d => ({ updateOne: { filter: { subject_id: d.subject_id }, update: { $set: d }, upsert: true } }))
  if (ops.length) await Subject.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

router.get('/faculty', asyncH(async (req, res) => {
  const { Faculty } = await getModels()
  const rows = await Faculty.find().lean()
  res.json(rows)
}))
router.post('/faculty/bulk', asyncH(async (req, res) => {
  const { Faculty } = await getModels()
  const docs = req.body || []
  const ops = docs.map(d => ({ updateOne: { filter: { faculty_id: d.faculty_id }, update: { $set: d }, upsert: true } }))
  if (ops.length) await Faculty.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

router.get('/sections', asyncH(async (req, res) => {
  const { Section } = await getModels()
  const rows = await Section.find().lean()
  res.json(rows)
}))
router.post('/sections/bulk', asyncH(async (req, res) => {
  const { Section } = await getModels()
  const docs = req.body || []
  const ops = docs.map(d => ({ updateOne: { filter: { section_id: d.section_id }, update: { $set: d }, upsert: true } }))
  if (ops.length) await Section.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

router.get('/rooms', asyncH(async (req, res) => {
  const { Room } = await getModels()
  const rows = await Room.find().lean()
  res.json(rows)
}))
router.post('/rooms/bulk', asyncH(async (req, res) => {
  const { Room } = await getModels()
  const docs = req.body || []
  const ops = docs.map(d => ({ updateOne: { filter: { room_id: d.room_id }, update: { $set: d }, upsert: true } }))
  if (ops.length) await Room.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

// Timetables
router.get('/sections/combos', asyncH(async (req, res) => {
  const { Section } = await getModels()
  const agg = await Section.aggregate([
    {
      $group: {
        _id: { dept_id: '$dept_id', year: '$year' },
        sections: { $addToSet: '$section_id' }
      }
    },
    { $project: { _id: 0, dept_id: '$_id.dept_id', year: '$_id.year', sections: 1 } },
    { $sort: { dept_id: 1, year: 1 } }
  ])
  res.json(agg)
}))

// Diagnostics: subjects for a combo
router.get('/diagnostics/subjects', asyncH(async (req, res) => {
  const { Subject } = await getModels()
  const { dept_id, year, semester } = req.query
  if (!dept_id || !year) return res.status(400).json({ error: 'dept_id and year required' })
  const q = { dept_id, year }
  if (semester) q.semester = semester
  const rows = await Subject.find(q).lean()
  const counts = rows.reduce((acc, s) => {
    acc.total++
    acc.byType[s.subject_type] = (acc.byType[s.subject_type] || 0) + 1
    return acc
  }, { total: 0, byType: {} })
  res.json({ ok: true, count: rows.length, counts, rows })
}))

// Diagnostics: faculty coverage for subjects in a combo
router.get('/diagnostics/faculty_coverage', asyncH(async (req, res) => {
  const { Subject, Faculty } = await getModels()
  const { dept_id, year, semester } = req.query
  if (!dept_id || !year) return res.status(400).json({ error: 'dept_id and year required' })
  const sq = { dept_id, year }
  if (semester) sq.semester = semester
  const subjects = await Subject.find(sq).lean()
  const fac = await Faculty.find({ dept_id }).lean()
  const coverage = subjects.map(s => ({
    subject_id: s.subject_id,
    subject_name: s.subject_name,
    type: s.subject_type,
    faculty_count: fac.filter(f => Array.isArray(f.subjects_can_teach) && f.subjects_can_teach.includes(s.subject_id)).length
  }))
  res.json({ ok: true, total_subjects: subjects.length, coverage })
}))

// Diagnostics: sections for a combo
router.get('/diagnostics/sections', asyncH(async (req, res) => {
  const { Section } = await getModels()
  const { dept_id, year } = req.query
  if (!dept_id || !year) return res.status(400).json({ error: 'dept_id and year required' })
  const rows = await Section.find({ dept_id, year }).lean()
  res.json({ ok: true, count: rows.length, sections: rows.map(r => r.section_id) })
}))
router.get('/timetables', asyncH(async (req, res) => {
  const { Timetable } = await getModels()
  const q = {}
  if (req.query.dept_id) q.dept_id = req.query.dept_id
  if (req.query.year) q.year = req.query.year
  if (req.query.semester) q.semester = req.query.semester
  const rows = await Timetable.find(q).sort({ createdAt: -1 }).lean()
  res.json(rows)
}))
router.post('/timetables', asyncH(async (req, res) => {
  const { Timetable } = await getModels()
  const body = req.body || {}
  const dept_id = (body.dept_id ?? '').toString().trim()
  const year = (body.year ?? '').toString().trim()
  const semester = (body.semester ?? '').toString().trim()
  const periodTimes = Array.isArray(body.periodTimes) ? body.periodTimes : []
  const bySection = body.bySection && typeof body.bySection === 'object' ? body.bySection : {}
  const isActive = !!body.isActive
  if (!dept_id || !year || !semester) {
    return res.status(400).json({ error: 'dept_id, year, semester are required' })
  }
  // Validate: prevent same faculty assigned twice at same time across sections
  const conflicts = detectFacultyConflicts(bySection, periodTimes)
  if (conflicts.length) {
    return res.status(400).json({ error: 'Faculty double-booking detected', conflicts })
  }
  console.log('CREATE TIMETABLE', { dept_id, year, semester, sections: Object.keys(bySection) })
  const doc = await Timetable.create({ dept_id, year, semester, periodTimes, bySection, isActive })
  res.json({ ok: true, id: doc._id, dept_id: doc.dept_id, year: doc.year, semester: doc.semester })
}))

router.post('/timetables/bulk', asyncH(async (req, res) => {
  const { Timetable } = await getModels()
  const docs = Array.isArray(req.body) ? req.body : []
  const prepared = docs.map((body) => {
    const dept_id = (body.dept_id ?? '').toString().trim()
    const year = (body.year ?? '').toString().trim()
    const semester = (body.semester ?? '').toString().trim()
    const periodTimes = Array.isArray(body.periodTimes) ? body.periodTimes : []
    const bySection = body.bySection && typeof body.bySection === 'object' ? body.bySection : {}
    const isActive = !!body.isActive
    if (!dept_id || !year || !semester) return null
    return { dept_id, year, semester, periodTimes, bySection, isActive }
  }).filter(Boolean)
  if (!prepared.length) return res.json({ ok: true, count: 0, ids: [] })
  const result = await Timetable.insertMany(prepared, { ordered: false })
  res.json({ ok: true, count: result.length, ids: result.map(d => d._id) })
}))

router.post('/timetables/:id/activate', asyncH(async (req, res) => {
  const { id } = req.params
  const { Timetable } = await getModels()
  const target = await Timetable.findById(id)
  if (!target) return res.status(404).json({ error: 'Timetable not found' })
  const { dept_id, year, semester } = target
  // capture previously active for diff
  const prev = await Timetable.findOne({ dept_id, year, semester, isActive: true }).lean()
  await Timetable.updateMany({ dept_id, year, semester }, { $set: { isActive: false } })
  await Timetable.updateOne({ _id: id }, { $set: { isActive: true } })
  // Notifications
  try {
    if (prev) {
      const changes = diffTimetables(prev, target.toObject())
      if (changes.length) {
        const { Notification } = await getUserModels()
        const notes = changes.map(ch => ({
          type: 'class_reschedule',
          message: `Classes rescheduled for ${dept_id} • Year ${year} • Sem ${semester}`,
          dept_id, year, semester,
          section_id: ch.section_id,
          date: new Date().toISOString().slice(0,10),
          day: ch.day,
          faculty_id: '', faculty_name: '',
          periods: ch.periods
        }))
        if (notes.length) await Notification.insertMany(notes)
      }
    }
    await notifyTimetablePublished(target.toObject())
  } catch (e) { console.warn('Notify activate failed', e) }
  res.json({ ok: true })
}))

router.post('/timetables/activate_latest', asyncH(async (req, res) => {
  const { Timetable } = await getModels()
  const { dept_ids, years, semesters } = req.body || {}
  const q = {}
  if (Array.isArray(dept_ids) && dept_ids.length) q.dept_id = { $in: dept_ids.map(s => s.toString().trim()) }
  if (Array.isArray(years) && years.length) q.year = { $in: years.map(s => s.toString().trim()) }
  if (Array.isArray(semesters) && semesters.length) q.semester = { $in: semesters.map(s => s.toString().trim()) }
  const rows = await Timetable.find(q).sort({ createdAt: -1 }).lean()
  const seen = new Set()
  let activated = 0
  for (const r of rows) {
    const key = `${r.dept_id}__${r.year}__${r.semester}`
    if (seen.has(key)) continue
    seen.add(key)
    const prev = await Timetable.findOne({ dept_id: r.dept_id, year: r.year, semester: r.semester, isActive: true }).lean()
    await Timetable.updateMany({ dept_id: r.dept_id, year: r.year, semester: r.semester }, { $set: { isActive: false } })
    await Timetable.updateOne({ _id: r._id }, { $set: { isActive: true } })
    activated++
    try {
      if (prev) {
        const changes = diffTimetables(prev, r)
        if (changes.length) {
          const { Notification } = await getUserModels()
          const notes = changes.map(ch => ({
            type: 'class_reschedule',
            message: `Classes rescheduled for ${r.dept_id} • Year ${r.year} • Sem ${r.semester}`,
            dept_id: r.dept_id, year: r.year, semester: r.semester,
            section_id: ch.section_id,
            date: new Date().toISOString().slice(0,10),
            day: ch.day,
            faculty_id: '', faculty_name: '',
            periods: ch.periods
          }))
          if (notes.length) await Notification.insertMany(notes)
        }
      }
      await notifyTimetablePublished(r)
    } catch (e) { console.warn('Notify activate_latest failed for', key, e) }
  }
  res.json({ ok: true, activated })
}))

// Simple gap-free generator: packs subjects per section left-to-right without internal gaps
router.post('/generate_timetable', asyncH(async (req, res) => {
  const { Subject, Section, Faculty, Room, Timetable } = await getModels()
  const body = req.body || {}
  const dept_id = (body.dept_id ?? '').toString().trim()
  const year = (body.year ?? '').toString().trim()
  const semester = (body.semester ?? '').toString().trim()
  const periodTimes = Array.isArray(body.periodTimes) && body.periodTimes.length ? body.periodTimes : (body.periodsPerDay && body.collegeStart && body.minutesPerPeriod ? [] : (body.periodTimes || []))
  const days = Array.isArray(body.days) && body.days.length ? body.days : ['Mon','Tue','Wed','Thu','Fri','Sat']
  const useSaturday = body.useSaturday === true || days.includes('Sat')
  const activate = !!body.activate
  if (!dept_id || !year || !semester) return res.status(400).json({ error: 'dept_id, year, semester are required' })

  // Fetch base data
  const sections = await Section.find({ dept_id, year }).lean()
  if (!sections.length) return res.status(400).json({ error: 'No sections found for dept/year' })
  const minSubjects = Number(body.minSubjects) || 6
  let subjects = await Subject.find(body.useAllYearSubjects ? { dept_id, year } : { dept_id, year, semester }).lean()
  // If too few subjects for this sem, augment with other sem subjects of same year
  if (!body.useAllYearSubjects && subjects.length < minSubjects) {
    const extra = await Subject.find({ dept_id, year, semester: { $ne: semester } }).lean()
    const seen = new Set(subjects.map(s => s.subject_id))
    for (const s of extra) if (!seen.has(s.subject_id)) { subjects.push(s); seen.add(s.subject_id) }
  }
  if (!subjects.length) return res.status(400).json({ error: 'No subjects found for dept/year/semester' })

  // Choose usable days
  const dayOrder = useSaturday ? ['Mon','Tue','Wed','Thu','Fri','Sat'] : ['Mon','Tue','Wed','Thu','Fri']
  const selectedDays = days.length ? days.filter(d => dayOrder.includes(d)) : dayOrder

  const perDayPeriods = periodTimes.length || Number(body.periodsPerDay) || 8
  const times = periodTimes.length ? periodTimes : Array.from({ length: perDayPeriods }, (_, i) => `P${i+1}`)

  // Build bySection without gaps: round-robin assign subjects across the grid
  const bySection = {}
  const theory = subjects.filter(s => s.subject_type === 'theory')
  const labs = subjects.filter(s => s.subject_type === 'lab')
  const facAll = await Faculty.find({ dept_id }).lean()
  const { FacultyUser } = await getUserModels()
  const facUsers = await FacultyUser.find({}).lean()
  const phoneById = new Map(facUsers.map(u => [String(u.faculty_id || '').trim(), String(u.phone || '').trim()]))
  const phoneByName = new Map(facUsers.map(u => [String(u.name || '').trim().toLowerCase(), String(u.phone || '').trim()]))
  const classRooms = await Room.find({ room_type: 'class' }).lean()
  const labRooms = await Room.find({ room_type: 'lab' }).lean()
  // Build a pool mapping subject_id -> candidate faculty (by id or name; wildcard if empty list)
  const facMap = new Map()
  subjects.forEach(s => {
    let list = facAll.filter(f => canFacultyTeachSubject(f, s))
    if (!list.length) list = facAll.slice(0)
    facMap.set(s.subject_id, list)
  })
  // Round-robin sequence mixing theory and labs to use all subjects
  const seq = []
  const maxLen = Math.max(theory.length, labs.length)
  for (let i = 0; i < maxLen; i++) {
    if (theory[i]) seq.push(theory[i])
    if (labs[i]) seq.push(labs[i])
  }
  if (!seq.length) seq.push(...subjects)

  // Track how many distinct subjects each faculty is handling in this generation
  const facSubjectCount = new Map() // key -> Set(subject_id)
  const facKey = (f) => String(f.faculty_id || f.faculty_number || f.faculty_name || '').trim()

  sections.forEach(sec => {
    const grid = selectedDays.map(() => Array(perDayPeriods).fill(null))
    // Preselect one faculty per subject for this section to keep consistency
    const chosenFacBySubject = new Map()
    subjects.forEach(subj => {
      const list = facMap.get(subj.subject_id) || []
      if (list.length) {
        // Prefer a faculty who currently handles < 2 distinct subjects in this generation
        // If none, choose the one with the smallest subject count to balance load
        let best = null
        let bestCount = Infinity
        for (const f of list) {
          const k = facKey(f)
          const set = facSubjectCount.get(k) || new Set()
          const cnt = set.size + (set.has(subj.subject_id) ? 0 : 0)
          // Hard preference: anyone with size < 2
          if (set.size < 2) { best = f; bestCount = set.size; break }
          if (set.size < bestCount) { best = f; bestCount = set.size }
        }
        const pick = best || list[0]
        const k = facKey(pick)
        if (k) {
          const set = facSubjectCount.get(k) || new Set()
          set.add(subj.subject_id)
          facSubjectCount.set(k, set)
        }
        chosenFacBySubject.set(subj.subject_id, pick)
      } else {
        chosenFacBySubject.set(subj.subject_id, {})
      }
    })
    let idx = 0
    for (let d = 0; d < selectedDays.length; d++) {
      for (let p = 0; p < perDayPeriods; p++) {
        const subj = seq[idx % seq.length]
        if (!subj) { idx++; continue }
        // pick the preselected faculty for this subject in this section
        const fac = chosenFacBySubject.get(subj.subject_id) || {}
        // pick room by type
        const pool = subj.subject_type === 'lab' ? labRooms : classRooms
        const room = pool[(idx + d + p) % Math.max(pool.length, 1)] || {}
        const fid = fac.faculty_id || fac.faculty_number || ''
        const fname = fac.faculty_name || ''
        const fphone = phoneById.get(String(fid).trim()) || phoneByName.get(String(fname).trim().toLowerCase()) || fac.faculty_number
        grid[d][p] = {
          label: subj.subject_name || subj.subject_id,
          faculty: fac.faculty_name ? { name: fname, id: fid, phone: fphone } : undefined,
          room: room.room_name || room.room_id
        }
        idx++
      }
    }
    bySection[sec.section_id] = grid
  })

  const doc = await Timetable.create({ dept_id, year, semester, periodTimes: times, bySection, isActive: false })
  if (activate) {
    const prev = await Timetable.findOne({ dept_id, year, semester, isActive: true }).lean()
    await Timetable.updateMany({ dept_id, year, semester }, { $set: { isActive: false } })
    await Timetable.updateOne({ _id: doc._id }, { $set: { isActive: true } })
    try {
      if (prev) {
        const changes = diffTimetables(prev, doc.toObject())
        if (changes.length) {
          const { Notification } = await getUserModels()
          const notes = changes.map(ch => ({
            type: 'class_reschedule',
            message: `Classes rescheduled for ${dept_id} • Year ${year} • Sem ${semester}`,
            dept_id, year, semester,
            section_id: ch.section_id,
            date: new Date().toISOString().slice(0,10),
            day: ch.day,
            faculty_id: '', faculty_name: '',
            periods: ch.periods
          }))
          if (notes.length) await Notification.insertMany(notes)
        }
      }
      await notifyTimetablePublished(doc.toObject())
    } catch (e) { console.warn('Notify generate_timetable activate failed', e) }
  }
  res.json({ ok: true, id: doc._id, dept_id, year, semester, isActive: activate })
}))

// Bulk gap-free generator across many (dept_id, year, semester) combos
router.post('/generate_timetable/bulk', asyncH(async (req, res) => {
  const { Subject, Section, Faculty, Room, Timetable } = await getModels()
  const body = req.body || {}
  const filters = body.filters || {}
  const periodTimes = Array.isArray(body.periodTimes) && body.periodTimes.length ? body.periodTimes : []
  const perDayPeriods = periodTimes.length || Number(body.periodsPerDay) || 8
  const days = Array.isArray(body.days) && body.days.length ? body.days : ['Mon','Tue','Wed','Thu','Fri','Sat']
  const useSaturday = body.useSaturday === true || days.includes('Sat')
  const activate = !!body.activate

  // Discover combos from sections
  const combosAgg = await Section.aggregate([
    {
      $group: {
        _id: { dept_id: '$dept_id', year: '$year' },
        sections: { $addToSet: '$section_id' }
      }
    },
    { $project: { _id: 0, dept_id: '$_id.dept_id', year: '$_id.year', sections: 1 } }
  ])
  // Optional filtering by dept_ids/years
  const deptFilter = Array.isArray(filters.dept_ids) && filters.dept_ids.length ? new Set(filters.dept_ids.map(s => s.toString().trim())) : null
  const yearFilter = Array.isArray(filters.years) && filters.years.length ? new Set(filters.years.map(s => s.toString().trim())) : null
  const semFilter = Array.isArray(filters.semesters) && filters.semesters.length ? new Set(filters.semesters.map(s => s.toString().trim())) : null

  const targetCombos = []
  for (const c of combosAgg) {
    if (deptFilter && !deptFilter.has(c.dept_id)) continue
    if (yearFilter && !yearFilter.has(c.year)) continue
    // Determine semesters to generate: if semFilter present use it; else infer from subjects present
    const subjSems = await Subject.distinct('semester', { dept_id: c.dept_id, year: c.year })
    const sems = semFilter ? Array.from(semFilter) : subjSems.map(s => s.toString())
    for (const sem of sems) {
      // Only include if we actually have subjects for that sem
      const subjCount = await Subject.countDocuments({ dept_id: c.dept_id, year: c.year, semester: sem })
      if (!subjCount) continue
      targetCombos.push({ dept_id: c.dept_id, year: c.year, semester: sem, sections: c.sections })
    }
  }
  if (!targetCombos.length) return res.json({ ok: true, generated: 0, activated: 0 })

  const dayOrder = useSaturday ? ['Mon','Tue','Wed','Thu','Fri','Sat'] : ['Mon','Tue','Wed','Thu','Fri']
  const selectedDays = days.length ? days.filter(d => dayOrder.includes(d)) : dayOrder
  const times = periodTimes.length ? periodTimes : Array.from({ length: perDayPeriods }, (_, i) => `P${i+1}`)

  let generated = 0
  for (const combo of targetCombos) {
    const minSubjects = Number(body.minSubjects) || 6
  let subjects = await Subject.find(body.useAllYearSubjects ? { dept_id: combo.dept_id, year: combo.year } : { dept_id: combo.dept_id, year: combo.year, semester: combo.semester }).lean()
  if (!body.useAllYearSubjects && subjects.length < minSubjects) {
    const extra = await Subject.find({ dept_id: combo.dept_id, year: combo.year, semester: { $ne: combo.semester } }).lean()
    const seen = new Set(subjects.map(s => s.subject_id))
    for (const s of extra) if (!seen.has(s.subject_id)) { subjects.push(s); seen.add(s.subject_id) }
  }
    const theory = subjects.filter(s => s.subject_type === 'theory')
    const labs = subjects.filter(s => s.subject_type === 'lab')
    const facAll = await Faculty.find({ dept_id: combo.dept_id }).lean()
    const { FacultyUser } = await getUserModels()
    const facUsers = await FacultyUser.find({}).lean()
    const phoneById = new Map(facUsers.map(u => [String(u.faculty_id || '').trim(), String(u.phone || '').trim()]))
    const phoneByName = new Map(facUsers.map(u => [String(u.name || '').trim().toLowerCase(), String(u.phone || '').trim()]))
    const classRooms = await Room.find({ room_type: 'class' }).lean()
    const labRooms = await Room.find({ room_type: 'lab' }).lean()
    const facMap = new Map()
    subjects.forEach(s => {
      let list = facAll.filter(f => canFacultyTeachSubject(f, s))
      if (!list.length) list = facAll.slice(0)
      facMap.set(s.subject_id, list)
    })
    const seq = []
    const maxLen = Math.max(theory.length, labs.length)
    for (let i = 0; i < maxLen; i++) {
      if (theory[i]) seq.push(theory[i])
      if (labs[i]) seq.push(labs[i])
    }
    if (!seq.length) seq.push(...subjects)
    if (!seq.length) continue
    const bySection = {}
    // Track per-combo assignments to keep each faculty within ~2 subjects
    const facSubjectCount = new Map()
    const facKey = (f) => String(f.faculty_id || f.faculty_number || f.faculty_name || '').trim()
    combo.sections.forEach(secId => {
      const grid = selectedDays.map(() => Array(perDayPeriods).fill(null))
      // Preselect one faculty per subject for this section to keep consistency
      const chosenFacBySubject = new Map()
      subjects.forEach(subj => {
        const list = facMap.get(subj.subject_id) || []
        if (list.length) {
          // Prefer faculty under the 2-subject cap in this combo
          let best = null
          let bestCount = Infinity
          for (const f of list) {
            const k = facKey(f)
            const set = facSubjectCount.get(k) || new Set()
            if (set.size < 2) { best = f; bestCount = set.size; break }
            if (set.size < bestCount) { best = f; bestCount = set.size }
          }
          const pick = best || list[0]
          const k = facKey(pick)
          if (k) {
            const set = facSubjectCount.get(k) || new Set()
            set.add(subj.subject_id)
            facSubjectCount.set(k, set)
          }
          chosenFacBySubject.set(subj.subject_id, pick)
        } else {
          chosenFacBySubject.set(subj.subject_id, {})
        }
      })
      let idx = 0
      for (let d = 0; d < selectedDays.length; d++) {
        for (let p = 0; p < perDayPeriods; p++) {
          const subj = seq[idx % seq.length]
          if (!subj) { idx++; continue }
          const fac = chosenFacBySubject.get(subj.subject_id) || {}
          const pool = subj.subject_type === 'lab' ? labRooms : classRooms
          const room = pool[(idx + d + p) % Math.max(pool.length, 1)] || {}
          const fid = fac.faculty_id || fac.faculty_number || ''
          const fname = fac.faculty_name || ''
          const fphone = phoneById.get(String(fid).trim()) || phoneByName.get(String(fname).trim().toLowerCase()) || fac.faculty_number
          grid[d][p] = {
            label: subj.subject_name || subj.subject_id,
            faculty: fac.faculty_name ? { name: fname, id: fid, phone: fphone } : undefined,
            room: room.room_name || room.room_id
          }
          idx++
        }
      }
      bySection[secId] = grid
    })
    await Timetable.create({ dept_id: combo.dept_id, year: combo.year, semester: combo.semester, periodTimes: times, bySection, isActive: false })
    generated++
  }

  let activated = 0
  if (activate) {
    // Reuse activate_latest logic by querying and marking newest per combo active
    const rows = await Timetable.find({}).sort({ createdAt: -1 }).lean()
    const seen = new Set()
    for (const r of rows) {
      const key = `${r.dept_id}__${r.year}__${r.semester}`
      if (seen.has(key)) continue
      seen.add(key)
      await Timetable.updateMany({ dept_id: r.dept_id, year: r.year, semester: r.semester }, { $set: { isActive: false } })
      await Timetable.updateOne({ _id: r._id }, { $set: { isActive: true } })
      activated++
    }
  }

  res.json({ ok: true, generated, activated, combos: targetCombos.length })
}))

export default router
