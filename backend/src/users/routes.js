import { Router } from 'express'
import { getUserModels } from './models.js'
import { getModels as getTTModels } from '../timetable/models.js'
import bcrypt from 'bcryptjs'

const router = Router()
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
// Safe escape for building regex from user input
const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Day-of-week helper (Mon..Sat) from ISO date string
const dayNameFromISO = (iso) => {
  try {
    const d = new Date(iso)
    const n = d.getDay() // 0 Sun .. 6 Sat
    const map = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    return map[n] || 'Mon'
  } catch { return 'Mon' }
}

router.post('/auth/login', asyncH(async (req, res) => {
  const rawEmail = ((req.body || {}).email ?? '').toString().trim()
  const rawPassword = ((req.body || {}).password ?? '').toString()
  const role = ((req.body || {}).role || '').toString().toLowerCase()
  console.log('LOGIN attempt', { role, rawEmail })
  const models = await getUserModels()
  let Model
  if (role === 'admin') Model = models.Admin
  else if (role === 'faculty') Model = models.FacultyUser
  else if (role === 'student') Model = models.StudentUser
  else return res.status(400).json({ error: 'Invalid role' })

  // For students, allow login with email OR student_id in the 'email' field
  const query = role === 'student'
    ? { $or: [{ email: rawEmail }, { student_id: rawEmail }] }
    : (role === 'faculty'
      ? { $or: [
          { email: { $regex: new RegExp(`^${escapeRegex(rawEmail)}$`, 'i') } },
          { faculty_id: rawEmail }
        ] }
      : { email: { $regex: new RegExp(`^${escapeRegex(rawEmail)}$`, 'i') } })
  console.log('LOGIN query', query)
  const user = await Model.findOne(query).lean()
  if (!user) {
    console.log('LOGIN failed: user not found')
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  // Password rules:
  // - admin/faculty: plain or bcrypt
  // - student: ONLY allow password equal to stored plain password OR exactly student's own student_id
  let ok = false
  if (role === 'student') {
    const plainOk = (user.password && user.password === rawPassword)
    const studentIdOk = rawPassword === (user.student_id || '')
    ok = plainOk || studentIdOk
  } else {
    const plainOk = (user.password && user.password === rawPassword)
    const bcryptOk = await bcrypt.compare(rawPassword || '', user.password || '').catch(() => false)
    // For faculty: also allow phone number as password (coerce to string)
    const phoneOk = role === 'faculty' ? (rawPassword && (user.phone != null) && rawPassword === String(user.phone)) : false
    ok = plainOk || bcryptOk || phoneOk
  }
  if (!ok) {
    console.log('LOGIN failed: password mismatch for', { id: user._id })
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const base = { id: user._id, role, name: user.name || user.student_name || '', email: user.email || user.student_id }
  const facultyFields = role === 'faculty' ? {
    faculty_id: user.faculty_id,
    phone: user.phone,
    faculty_number: user.faculty_number
  } : {}
  const studentFields = role === 'student' ? {
    student_id: user.student_id,
    dept_id: user.dept_id,
    year: user.year,
    semester: user.semester,
    section_id: user.section_id
  } : {}
  res.json({ ok: true, user: { ...base, ...facultyFields, ...studentFields } })
}))

router.get('/student_users', asyncH(async (req, res) => {
  const { StudentUser } = await getUserModels()
  const rows = await StudentUser.find().lean()
  res.json(rows)
}))

router.post('/student_users/bulk', asyncH(async (req, res) => {
  const { StudentUser } = await getUserModels()
  const docs = Array.isArray(req.body) ? req.body : []
  const normalized = docs.map(d => ({
    student_id: d.student_id || d.registration_number,
    name: d.name || d.student_name,
    email: d.email || (d.registration_number ? `${d.registration_number}@college.edu` : undefined),
    password: d.password || d.password_hash || d.registration_number || d.student_id,
    dept_id: d.dept_id,
    year: (d.year ?? '').toString(),
    semester: (d.semester ?? '').toString(),
    section_id: d.section_id
  }))
  const ops = normalized.map(d => ({
    updateOne: { filter: d.student_id ? { student_id: d.student_id } : { email: d.email }, update: { $set: d }, upsert: true }
  }))
  if (ops.length) await StudentUser.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

// Faculty personal timetable aggregated across active/latest timetables
router.get('/faculty_users/:facultyId/timetable', asyncH(async (req, res) => {
  const { facultyId } = req.params
  const id = (facultyId ?? '').toString().trim()
  const { FacultyUser } = await getUserModels()
  const faculty = await FacultyUser.findOne({
    $or: [
      { faculty_id: id },
      { email: { $regex: new RegExp(`^${escapeRegex(id)}$`, 'i') } }
    ]
  }).lean()
  if (!faculty) return res.status(404).json({ error: 'Faculty not found' })

  const { Timetable } = await getTTModels()
  let docs = await Timetable.find({ isActive: true }).lean()
  if (!docs.length) {
    docs = await Timetable.find({}).sort({ createdAt: -1 }).limit(50).lean()
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const out = {}
  const assigned = new Map()
  let periodTimes = []

  for (const doc of docs) {
    if (!periodTimes.length && Array.isArray(doc.periodTimes)) periodTimes = doc.periodTimes
    const bySection = doc.bySection || {}
    for (const [sectionId, grid] of Object.entries(bySection)) {
      if (Array.isArray(grid)) {
        // Array format [day][period]
        for (let r = 0; r < grid.length; r++) {
          const row = grid[r] || []
          const day = days[r] || `Day${r + 1}`
          if (!out[day]) out[day] = {}
          for (let c = 0; c < row.length; c++) {
            const cell = row[c]
            if (!cell) continue
            const fac = cell.faculty || {}
            const eqId = (a,b) => a!=null && b!=null && String(a).trim() === String(b).trim()
            const match = (
              eqId(fac.faculty_id, faculty.faculty_id) ||
              eqId(fac.id, faculty.faculty_id)
            )
            if (match) {
              out[day][String(c + 1)] = { ...cell, section_id: sectionId, section: sectionId, dept_id: doc.dept_id, year: doc.year, semester: doc.semester }
              const subj = cell.subject_id || cell.label
              const key = `${subj || ''}::${sectionId}`
              if (!assigned.has(key)) assigned.set(key, { subject: subj || cell.label, section_id: sectionId, dept_id: doc.dept_id, year: doc.year, semester: doc.semester })
            }
          }
        }
        continue
      }
      if (grid && typeof grid === 'object') {
        // Object format { Mon: { '1': val } }
        for (let d = 0; d < days.length; d++) {
          const day = days[d]
          const rowObj = grid[day] || grid[day.toLowerCase()] || grid[day.toUpperCase()]
          if (!rowObj) continue
          if (!out[day]) out[day] = {}
          const periods = Array.from({ length: (doc.periodTimes || []).length || 8 }, (_, i) => String(i + 1))
          for (const p of periods) {
            const cell = rowObj[p]
            if (!cell) continue
            const fac = cell.faculty || {}
            const match = (
              (fac.faculty_id && faculty.faculty_id && String(fac.faculty_id) === String(faculty.faculty_id)) ||
              (fac.id && faculty.faculty_id && String(fac.id) === String(faculty.faculty_id))
            )
            if (match) {
              out[day][p] = { ...cell, section_id: sectionId, section: sectionId, dept_id: doc.dept_id, year: doc.year, semester: doc.semester }
              const subj = cell.subject_id || cell.label
              const key = `${subj || ''}::${sectionId}`
              if (!assigned.has(key)) assigned.set(key, { subject: subj || cell.label, section_id: sectionId, dept_id: doc.dept_id, year: doc.year, semester: doc.semester })
            }
          }
        }
      }
    }
  }

  return res.json({ ok: true, faculty_id: faculty.faculty_id, name: faculty.name, periodTimes, grid: out, assigned: Array.from(assigned.values()) })
}))

// Faculty user management
router.get('/faculty_users', asyncH(async (req, res) => {
  const { FacultyUser } = await getUserModels()
  const rows = await FacultyUser.find().lean()
  res.json(rows)
}))

router.post('/faculty_users/bulk', asyncH(async (req, res) => {
  const { FacultyUser } = await getUserModels()
  const docs = Array.isArray(req.body) ? req.body : []
  const norm = docs.map(d => {
    const faculty_id = (d.faculty_id ?? d.id ?? '').toString().trim() || undefined
    const faculty_number = (d.faculty_number ?? d.emp_no ?? d.employee_number ?? '').toString().trim() || undefined
    const phone = (
      d.phone ??
      d.mobile ??
      d.phone_number ??
      d.contact_number ??
      d['faculty_phn number'] ??
      d.faculty_phn_number
    )?.toString().trim() || undefined
    const email = (d.email ?? d.mail ?? '').toString().trim() || undefined
    const name = (d.name ?? d.faculty_name ?? d.full_name ?? '').toString().trim() || undefined
    const password = (d.password ?? '').toString()
    const finalPassword = password || phone || (faculty_number || '').toString() || (faculty_id || '').toString() || undefined
    return { faculty_id, faculty_number, phone, email, name, password: finalPassword }
  }).filter(x => x.email || x.faculty_id)
  const ops = norm.map(d => ({
    updateOne: {
      filter: d.email ? { email: d.email } : { faculty_id: d.faculty_id },
      update: { $set: d },
      upsert: true
    }
  }))
  if (ops.length) await FacultyUser.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

// Convenience endpoint: latest timetable for a given student_id
router.get('/student_users/:studentId/timetable', asyncH(async (req, res) => {
  const { studentId } = req.params
  const { StudentUser } = await getUserModels()
  const sid = (studentId ?? '').toString().trim()
  const student = await StudentUser.findOne({
    $or: [
      { student_id: sid },
      { student_id: { $regex: new RegExp(`^${escapeRegex(sid)}$`, 'i') } },
      { email: sid }
    ]
  }).lean()
  if (!student) return res.status(404).json({ error: 'Student not found' })
  const { Timetable } = await getTTModels()
  // Normalize to strings to avoid type-mismatch in Mongo query
  const sDept = (student.dept_id ?? '').toString().trim()
  const sYear = (student.year ?? '').toString().trim()
  const sSem = (student.semester ?? '').toString().trim()
  const sSec = (student.section_id ?? '').toString().trim()
  // Prefer active timetable; fallback to latest if none is active
  const baseQ = { dept_id: sDept, year: sYear, semester: sSem }
  let doc = await Timetable.findOne({ ...baseQ, isActive: true }).lean()
  let note = ''
  if (!doc) {
    doc = await Timetable.findOne(baseQ).sort({ createdAt: -1 }).lean()
  }
  // broader fallbacks
  if (!doc) {
    doc = await Timetable.findOne({ dept_id: sDept, year: sYear }).sort({ createdAt: -1 }).lean()
    if (doc) note = 'fallback_year_only'
  }
  if (!doc) {
    doc = await Timetable.findOne({ dept_id: sDept }).sort({ createdAt: -1 }).lean()
    if (doc && !note) note = 'fallback_dept_only'
  }
  if (!doc) return res.status(404).json({ error: 'Timetable not found for student combination' })
  const grid = (doc.bySection || {})[sSec]
  if (!grid) {
    const keys = Object.keys(doc.bySection || {})
    console.log('STUDENT timetable: section grid not found, using fallback if available', { baseQ, requested_section: sSec, available_sections: keys })
    if (!keys.length) {
      return res.status(404).json({ error: 'No sections available in timetable document' })
    }
    const fallbackSec = keys[0]
    const fallbackGrid = doc.bySection[fallbackSec]
    return res.json({ ok: true, note: note || 'fallback_section_used', fallback_from: sSec, section_id: fallbackSec, dept_id: doc.dept_id, year: doc.year, semester: doc.semester, periodTimes: doc.periodTimes || [], grid: fallbackGrid })
  }
  res.json({ ok: true, note, dept_id: doc.dept_id, year: doc.year, semester: doc.semester, periodTimes: doc.periodTimes || [], section_id: sSec, grid })
}))

// Admin management
router.get('/admins', asyncH(async (req, res) => {
  const { Admin } = await getUserModels()
  const rows = await Admin.find().lean()
  res.json(rows)
}))

router.post('/admins/bulk', asyncH(async (req, res) => {
  const { Admin } = await getUserModels()
  const docs = Array.isArray(req.body) ? req.body : []
  const ops = docs.map(d => ({
    updateOne: { filter: { email: d.email }, update: { $set: d }, upsert: true }
  }))
  if (ops.length) await Admin.bulkWrite(ops)
  res.json({ ok: true, count: ops.length })
}))

export default router

// ================= Leave Requests & Notifications =================
// Faculty applies for leave
router.post('/faculty_leaves', asyncH(async (req, res) => {
  const { LeaveRequest, FacultyUser } = await getUserModels()
  const body = req.body || {}
  const faculty_id = (body.faculty_id ?? '').toString().trim()
  let faculty_name = (body.faculty_name ?? '').toString().trim()
  if (!faculty_name && faculty_id) {
    const fac = await FacultyUser.findOne({ faculty_id }).lean()
    if (fac) faculty_name = fac.name || ''
  }
  const date = (body.date ?? '').toString().trim() // YYYY-MM-DD
  if (!date || !faculty_id) return res.status(400).json({ error: 'faculty_id and date are required' })
  const day = dayNameFromISO(date)
  const periods = Array.isArray(body.periods) ? body.periods.map(p => String(p)) : []
  const doc = await LeaveRequest.create({ faculty_id, faculty_name, date, day, periods, reason: body.reason || '' })
  res.json({ ok: true, leave: doc })
}))

// Admin: list leaves (optionally by status)
router.get('/faculty_leaves', asyncH(async (req, res) => {
  const { LeaveRequest } = await getUserModels()
  const status = (req.query.status ?? '').toString().trim()
  const q = status ? { status } : {}
  const rows = await LeaveRequest.find(q).sort({ createdAt: -1 }).lean()
  res.json(rows)
}))

// Helper to find affected sections/periods for a faculty on a given day
async function findAffectedSections({ faculty, day, periodsFilter }) {
  const { Timetable } = await getTTModels()
  const docs = await Timetable.find({ isActive: true }).lean()
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat']
  const out = new Map() // key: dept|year|sem|section -> {dept_id,year,semester,section_id,periods:Set}
  const eq = (a,b) => a!=null && b!=null && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
  for (const doc of docs) {
    const bySection = doc.bySection || {}
    for (const [sectionId, grid] of Object.entries(bySection)) {
      if (Array.isArray(grid)) {
        const dIdx = days.indexOf(day)
        if (dIdx < 0 || dIdx >= grid.length) continue
        const row = grid[dIdx] || []
        for (let c = 0; c < row.length; c++) {
          const cell = row[c]
          if (!cell) continue
          const fac = cell.faculty || {}
          const match = (
            eq(fac.faculty_id, faculty.faculty_id) ||
            eq(fac.id, faculty.faculty_id) ||
            eq(fac.name, faculty.name) ||
            eq(fac.phone, faculty.phone)
          )
          if (!match) continue
          const period = String(c + 1)
          if (periodsFilter.length && !periodsFilter.includes(period)) continue
          const key = `${doc.dept_id}|${doc.year}|${doc.semester}|${sectionId}`
          if (!out.has(key)) out.set(key, { dept_id: doc.dept_id, year: doc.year, semester: doc.semester, section_id: sectionId, periods: new Set() })
          out.get(key).periods.add(period)
        }
      } else if (grid && typeof grid === 'object') {
        const rowObj = grid[day] || grid[day.toLowerCase()] || grid[day.toUpperCase()]
        if (!rowObj) continue
        const periods = Object.keys(rowObj)
        for (const p of periods) {
          const cell = rowObj[p]
          if (!cell) continue
          const fac = cell.faculty || {}
          const match = (
            eq(fac.faculty_id, faculty.faculty_id) ||
            eq(fac.id, faculty.faculty_id) ||
            eq(fac.name, faculty.name) ||
            eq(fac.phone, faculty.phone)
          )
          if (!match) continue
          if (periodsFilter.length && !periodsFilter.includes(String(p))) continue
          const key = `${doc.dept_id}|${doc.year}|${doc.semester}|${sectionId}`
          if (!out.has(key)) out.set(key, { dept_id: doc.dept_id, year: doc.year, semester: doc.semester, section_id: sectionId, periods: new Set() })
          out.get(key).periods.add(String(p))
        }
      }
    }
  }
  return [...out.values()].map(x => ({ ...x, periods: [...x.periods].sort((a,b)=>Number(a)-Number(b)) }))
}

// Admin approve
router.post('/faculty_leaves/:id/approve', asyncH(async (req, res) => {
  const { LeaveRequest, FacultyUser, Notification } = await getUserModels()
  const id = req.params.id
  const leave = await LeaveRequest.findById(id)
  if (!leave) return res.status(404).json({ error: 'Leave not found' })
  leave.status = 'approved'
  leave.day = leave.day || dayNameFromISO(leave.date)
  await leave.save()
  // Resolve faculty details
  const faculty = await FacultyUser.findOne({ faculty_id: leave.faculty_id }).lean() || { faculty_id: leave.faculty_id, name: leave.faculty_name }
  const affected = await findAffectedSections({ faculty, day: leave.day, periodsFilter: Array.isArray(leave.periods) ? leave.periods.map(String) : [] })
  const notifs = affected.map(a => ({
    type: 'faculty_leave',
    message: `${faculty.name || faculty.faculty_id} is on leave on ${leave.date} (${leave.day})`,
    dept_id: a.dept_id,
    year: a.year,
    semester: a.semester,
    section_id: a.section_id,
    date: leave.date,
    day: leave.day,
    faculty_id: faculty.faculty_id,
    faculty_name: faculty.name,
    periods: a.periods
  }))
  if (notifs.length) await Notification.insertMany(notifs)
  res.json({ ok: true, leave, notifications_created: notifs.length, affected })
}))

// Admin reject
router.post('/faculty_leaves/:id/reject', asyncH(async (req, res) => {
  const { LeaveRequest } = await getUserModels()
  const id = req.params.id
  const leave = await LeaveRequest.findById(id)
  if (!leave) return res.status(404).json({ error: 'Leave not found' })
  leave.status = 'rejected'
  await leave.save()
  res.json({ ok: true, leave })
}))

// Student notifications fetch
router.get('/student_users/:studentId/notifications', asyncH(async (req, res) => {
  const { StudentUser, Notification } = await getUserModels()
  const sid = (req.params.studentId ?? '').toString().trim()
  const student = await StudentUser.findOne({ $or: [{ student_id: sid }, { email: sid }] }).lean()
  if (!student) return res.status(404).json({ error: 'Student not found' })
  const q = {
    dept_id: student.dept_id,
    year: student.year,
    semester: student.semester,
    section_id: student.section_id
  }
  const rows = await Notification.find(q).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ ok: true, notifications: rows })
}))

// ================= Faculty Reschedule Requests =================
// Create reschedule request by faculty
router.post('/faculty_reschedules', asyncH(async (req, res) => {
  const { RescheduleRequest, FacultyUser, Notification } = await getUserModels()
  const b = req.body || {}
  const faculty_id = (b.faculty_id ?? '').toString().trim()
  if (!faculty_id) return res.status(400).json({ error: 'faculty_id required' })
  let faculty_name = (b.faculty_name ?? '').toString().trim()
  if (!faculty_name) {
    const fac = await FacultyUser.findOne({ faculty_id }).lean()
    if (fac) faculty_name = fac.name || ''
  }
  const doc = await RescheduleRequest.create({
    faculty_id,
    faculty_name,
    dept_id: (b.dept_id ?? '').toString().trim(),
    year: (b.year ?? '').toString().trim(),
    semester: (b.semester ?? '').toString().trim(),
    section_id: (b.section_id ?? '').toString().trim(),
    subject: (b.subject ?? '').toString().trim(),
    from_day: (b.from_day ?? '').toString().trim(),
    from_period: String(b.from_period || ''),
    to_day: (b.to_day ?? '').toString().trim(),
    to_period: String(b.to_period || ''),
    reason: (b.reason ?? '').toString()
  })
  // Optional heads-up to a specific faculty
  const notifyTo = (b.notify_to ?? '').toString().trim()
  if (notifyTo) {
    const msg = `${faculty_name || faculty_id} requested to reschedule ${doc.subject} from ${doc.from_day} P${doc.from_period} to ${doc.to_day} P${doc.to_period}`
    await Notification.create({
      type: 'reschedule_request_submitted',
      message: msg,
      dept_id: doc.dept_id,
      year: doc.year,
      semester: doc.semester,
      section_id: doc.section_id,
      date: new Date().toISOString().slice(0,10),
      day: doc.from_day,
      faculty_id: notifyTo,
      faculty_name: '',
      periods: [String(doc.from_period), String(doc.to_period)]
    })
  }
  res.json({ ok: true, request: doc })
}))

// Admin: list reschedule requests
router.get('/faculty_reschedules', asyncH(async (req, res) => {
  const { RescheduleRequest } = await getUserModels()
  const status = (req.query.status ?? '').toString().trim()
  const q = status ? { status } : {}
  const rows = await RescheduleRequest.find(q).sort({ createdAt: -1 }).lean()
  res.json(rows)
}))

// Approve reschedule: notify affected section students
router.post('/faculty_reschedules/:id/approve', asyncH(async (req, res) => {
  const { RescheduleRequest, Notification } = await getUserModels()
  const id = req.params.id
  const reqDoc = await RescheduleRequest.findById(id)
  if (!reqDoc) return res.status(404).json({ error: 'Reschedule request not found' })
  reqDoc.status = 'approved'
  await reqDoc.save()
  const message = `${reqDoc.faculty_name || reqDoc.faculty_id} rescheduled ${reqDoc.subject} from ${reqDoc.from_day} P${reqDoc.from_period} to ${reqDoc.to_day} P${reqDoc.to_period}`
  await Notification.create({
    type: 'class_reschedule',
    message,
    dept_id: reqDoc.dept_id,
    year: reqDoc.year,
    semester: reqDoc.semester,
    section_id: reqDoc.section_id,
    date: new Date().toISOString().slice(0,10),
    day: reqDoc.to_day,
    faculty_id: reqDoc.faculty_id,
    faculty_name: reqDoc.faculty_name,
    periods: [String(reqDoc.from_period), String(reqDoc.to_period)]
  })
  res.json({ ok: true, request: reqDoc })
}))

router.post('/faculty_reschedules/:id/reject', asyncH(async (req, res) => {
  const { RescheduleRequest } = await getUserModels()
  const id = req.params.id
  const reqDoc = await RescheduleRequest.findById(id)
  if (!reqDoc) return res.status(404).json({ error: 'Reschedule request not found' })
  reqDoc.status = 'rejected'
  await reqDoc.save()
  res.json({ ok: true, request: reqDoc })
}))

// Faculty notifications fetch
router.get('/faculty_users/:facultyId/notifications', asyncH(async (req, res) => {
  const { facultyId } = req.params
  const id = (facultyId ?? '').toString().trim()
  const { Notification } = await getUserModels()
  const rows = await Notification.find({ faculty_id: id }).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ ok: true, notifications: rows })
}))

// ================= Substitute Requests =================
// Create
router.post('/substitute_requests', asyncH(async (req, res) => {
  const { SubstituteRequest } = await getUserModels()
  const b = req.body || {}
  const doc = await SubstituteRequest.create({
    from: (b.from || '').toString().trim(),
    fromName: (b.fromName || '').toString().trim(),
    to: (b.to || '').toString().trim(),
    toName: (b.toName || '').toString().trim(),
    subject: (b.subject || '').toString().trim(),
    section: (b.section || '').toString().trim(),
    room: (b.room || '').toString().trim(),
    day: (b.day || '').toString().trim(),
    period: (b.period || '').toString().trim(),
    status: 'pending'
  })
  res.json({ ok: true, request: doc })
}))

// List by to/from
router.get('/substitute_requests', asyncH(async (req, res) => {
  const { SubstituteRequest } = await getUserModels()
  const q = {}
  if (req.query.to) q.to = req.query.to.toString().trim()
  if (req.query.from) q.from = req.query.from.toString().trim()
  const rows = await SubstituteRequest.find(q).sort({ createdAt: -1 }).limit(200).lean()
  res.json({ ok: true, rows })
}))

// Accept
router.post('/substitute_requests/:id/accept', asyncH(async (req, res) => {
  const { SubstituteRequest } = await getUserModels()
  const id = req.params.id
  const doc = await SubstituteRequest.findById(id)
  if (!doc) return res.status(404).json({ error: 'Request not found' })
  doc.status = 'accepted'
  await doc.save()
  res.json({ ok: true, request: doc })
}))

// Decline
router.post('/substitute_requests/:id/decline', asyncH(async (req, res) => {
  const { SubstituteRequest } = await getUserModels()
  const id = req.params.id
  const doc = await SubstituteRequest.findById(id)
  if (!doc) return res.status(404).json({ error: 'Request not found' })
  doc.status = 'declined'
  await doc.save()
  res.json({ ok: true, request: doc })
}))
