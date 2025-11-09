import React, { useEffect, useState } from 'react'
import Stack from '@mui/material/Stack'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import LoadingOverlay from '../components/LoadingOverlay'
import { AutoAwesome, Replay } from '@mui/icons-material'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Grid from '@mui/material/Grid'
import useDataset from '../store/dataset'
import useTimetables from '../store/timetables'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// Placeholder drag-n-drop free builder; integrate dnd-kit later
export default function TimetableBuilder() {
  const [message, setMessage] = useState('Drag and drop courses into slots (coming soon).')
  const [generating, setGenerating] = useState(false)

  // Generation configuration
  const [department, setDepartment] = useState('CSE')
  const [year, setYear] = useState('1')
  const [semester, setSemester] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [periodMinutes, setPeriodMinutes] = useState(50)
  const dataset = useDataset()
  const setData = useDataset((s) => s.setData)
  const setTT = useTimetables((s) => s.replaceAll)
  const navigate = useNavigate()

  // Prefetch dataset from backend so generation has data
  useEffect(() => {
    const load = async () => {
      try {
        const [deps, secs, subs, facs, rms] = await Promise.all([
          api.get('/departments'),
          api.get('/sections'),
          api.get('/subjects'),
          api.get('/faculty'),
          api.get('/rooms')
        ])
        setData('departments', deps.data || [])
        setData('sections', secs.data || [])
        setData('subjects', subs.data || [])
        setData('faculty', facs.data || [])
        setData('rooms', rms.data || [])
      } catch (e) {
        console.error('Failed to prefetch dataset', e)
      }
    }
    load()
  }, [])

  const computePeriods = () => {
    try {
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const start = sh * 60 + sm
      const end = eh * 60 + em
      const out = []
      let t = start
      while (t + periodMinutes <= end) {
        const sH = String(Math.floor(t / 60)).padStart(2, '0')
        const sM = String(t % 60).padStart(2, '0')
        const e = t + periodMinutes
        const eH = String(Math.floor(e / 60)).padStart(2, '0')
        const eM = String(e % 60).padStart(2, '0')
        out.push(`${sH}:${sM} - ${eH}:${eM}`)
        t = e
      }
      return out
    } catch {
      return []
    }
  }

  const onGenerate = async () => {
    setGenerating(true)
    const times = computePeriods()
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat']

    const departments = dataset.departments || []
    const sections = dataset.sections || []
    const subjects = dataset.subjects || []
    const faculty = dataset.faculty || []
    const rooms = dataset.rooms || []

    const selectedDeptIds = new Set(
      departments
        .filter(d => (d.dept_name || '').toString().toUpperCase() === department)
        .map(d => d.dept_id)
    )
    const selectedDeptNames = new Set([department])

    let secs = sections.filter(s => {
      const y = (s.year || '').toString()
      const deptId = s.dept_id || s.department || s.dept
      if (selectedDeptIds.size > 0) return selectedDeptIds.has(deptId) && y === year
      const deptName = (s.department || s.dept || '').toString().toUpperCase()
      return deptName === department && y === year
    })
    // Fallback: if nothing matched by id, try name-only match regardless of departments list
    if (secs.length === 0) {
      secs = sections.filter(s => {
        const y = (s.year || '').toString()
        const deptName = (s.department || s.dept || '').toString().toUpperCase()
        return deptName === department && y === year
      })
    }
    const sectionIds = new Set(secs.map(s => s.section_id || s.id || s.section || s.label))

    const relevantSubjects = subjects.filter(sub => {
      const deptIdOrName = (sub.dept_id || sub.department || sub.dept || '').toString()
      const deptUpper = deptIdOrName.toUpperCase()
      const y = (sub.year || '').toString()
      const sem = (sub.semester || '').toString()
      // Accept either: dept matches one of ids OR matches the selected name/code (e.g., 'ECE')
      const deptMatches = (selectedDeptIds.size > 0 && selectedDeptIds.has(deptIdOrName))
        || selectedDeptNames.has(deptUpper)
      return deptMatches && y === year && sem === semester
    })

    // Pre-checks
    if (secs.length === 0) {
      setGenerating(false)
      setMessage('No sections found for selected Department/Year. Upload sections.csv with matching dept_id and year.')
      return
    }
    if (relevantSubjects.length === 0) {
      setGenerating(false)
      setMessage('No subjects found for selected Department/Year/Semester. Upload subjects.csv for this combination.')
      return
    }
    if (faculty.length === 0 || rooms.length === 0) {
      setGenerating(false)
      setMessage('Faculty or Rooms data missing. Upload faculty.csv and rooms.csv and try again.')
      return
    }

    const bySection = {}
    // Global conflict trackers
    const facultyAtSlot = {} // key: `${d}|${p}` -> Set(facultyId)
    const roomAtSlot = {}    // key: `${d}|${p}` -> Set(roomId)

    const parseHM = (t) => {
      const [h, m] = t.split(':').map(Number)
      return (isFinite(h) && isFinite(m)) ? h * 60 + m : NaN
    }
    const parseRange = (s) => {
      const cleaned = (s || '').toString().replace(/\s+/g, '') // 09:00-11:00
      if (!cleaned.includes('-')) return null
      const [a, b] = cleaned.split('-')
      const start = parseHM(a)
      const end = parseHM(b)
      if (isNaN(start) || isNaN(end)) return null
      return { start, end }
    }
    const timeOk = (entitySlots, periodTime) => {
      if (!entitySlots || entitySlots.length === 0) return true
      // Compute period start/end
      const [ps, pe] = periodTime.split('-').map(x => x.trim())
      const pStart = parseHM(ps)
      const pEnd = parseHM(pe)
      for (const s of entitySlots) {
        if (!s) continue
        if (s === periodTime) return true
        const r = parseRange(s)
        if (r && !isNaN(pStart) && !isNaN(pEnd)) {
          if (pStart >= r.start && pEnd <= r.end) return true
        }
      }
      return false
    }
    const dayOk = (entityDays, d) => {
      if (!entityDays?.length) return true
      const key = d.toLowerCase()
      return entityDays.some(x => x && x.toString().toLowerCase().startsWith(key))
    }

    const roomMatches = (room, subj, sec) => {
      const type = (subj.type || subj.subject_type || 'theory').toString().toLowerCase()
      const req = type === 'lab' ? 'lab' : 'class'
      const cap = Number(room.capacity || 0)
      const size = Number(sec.no_of_students || 0)
      return ((room.room_type || room.type) === req) && (!cap || !size || cap >= size)
    }

    const facultyLoad = new Map()
    const issues = []

    for (const sec of secs) {
      const secId = sec.section_id || sec.id || sec.section || sec.label
      const tt = {}
      days.forEach(d => { tt[d] = {} })

      // pick subjects for this section
      const subjectsForSec = [...relevantSubjects]
      let subjIdx = 0

      for (const d of days) {
        for (let p = 0; p < times.length; p++) {
          if (!subjectsForSec.length) break
          let placed = false
          let tries = 0
          while (!placed && tries < subjectsForSec.length) {
            const subj = subjectsForSec[(subjIdx + tries) % subjectsForSec.length]
            const periodTime = times[p]
            const slotKey = `${d}|${p+1}`

            const eligibleFaculty = faculty.filter(f => {
              const teaches = (f.subjects_can_teach || []).map(x => x?.toString()?.toLowerCase())
              const sId = (subj.subject_id || subj.id || '').toString().toLowerCase()
              const sName = (subj.subject_name || subj.name || '').toString().toLowerCase()
              const canTeach = teaches.includes(sId) || teaches.includes(sName) || teaches.length === 0
              if (!canTeach) return false
              if (!dayOk(f.availability_days, d)) return false
              if (!timeOk(f.availability_time_slots, periodTime)) return false
              // not double-booked at this slot
              const bookedSet = facultyAtSlot[slotKey]
              const fid = f.faculty_id || f.id
              if (bookedSet && bookedSet.has(fid)) return false
              // load check
              const used = facultyLoad.get(fid) || 0
              const max = Number(f.max_load_hours || 0)
              if (max && used + periodMinutes > max * 60) return false
              return true
            })

            const eligibleRooms = rooms.filter(r => {
              if (!roomMatches(r, subj, sec)) return false
              if (!dayOk(r.availability_days, d)) return false
              if (!timeOk(r.availability_time_slots, periodTime)) return false
              const bookedSet = roomAtSlot[slotKey]
              const roomKey = r.room_id || r.id || r.name
              if (bookedSet && bookedSet.has(roomKey)) return false
              return true
            })

            let assignedFaculty = eligibleFaculty[0] || null

            const chosenRoom = eligibleRooms[0]

            if (assignedFaculty && chosenRoom) {
              const label = subj.subject_name || subj.name || 'SUB'
              tt[d][String(p + 1)] = {
                label,
                section: secId,
                faculty: {
                  name: assignedFaculty.faculty_name || assignedFaculty.name,
                  id: assignedFaculty.faculty_id || assignedFaculty.id,
                  phone: assignedFaculty.faculty_number || assignedFaculty.phone
                },
                room: chosenRoom.room_name || chosenRoom.name || chosenRoom.room_id || chosenRoom.id
              }
              const fid = assignedFaculty.faculty_id || assignedFaculty.id
              facultyLoad.set(fid, (facultyLoad.get(fid) || 0) + periodMinutes)
              // mark bookings
              if (!facultyAtSlot[slotKey]) facultyAtSlot[slotKey] = new Set()
              facultyAtSlot[slotKey].add(fid)
              if (!roomAtSlot[slotKey]) roomAtSlot[slotKey] = new Set()
              roomAtSlot[slotKey].add(chosenRoom.room_id || chosenRoom.id || chosenRoom.name)
              placed = true
              subjIdx = (subjIdx + 1) % subjectsForSec.length
            } else {
              tries++
            }
          }
          if (!placed) {
            issues.push({ section: secId, day: d, period: p + 1, reason: 'No eligible faculty/room or load exceeded' })
          }
        }
      }

      bySection[secId] = tt
    }

    setTT({ periodTimes: times, bySection })
    // Persist generated timetable to DB
    try {
      const dept_id = [...selectedDeptIds][0] || department
      await api.post('/timetables', { dept_id, year, semester, periodTimes: times, bySection })
      // Auto-activate the latest timetable for this combo so Sections/Faculty see it immediately
      try {
        await api.post('/timetables/activate_latest', { dept_ids: [dept_id], years: [year], semesters: [semester] })
        setMessage('Timetable saved and activated')
      } catch (actErr) {
        console.warn('Failed to auto-activate latest timetable', actErr)
      }
    } catch (e) {
      const data = e?.response?.data
      if (data?.conflicts?.length) {
        const sample = data.conflicts.slice(0, 3).map(c => `FID ${c.facultyId} ${c.day} P${c.period} (${c.sections.join(', ')})`).join(' | ')
        setMessage(`Save blocked: ${data.conflicts.length} faculty double-booking conflict(s). ${sample}`)
      } else {
        setMessage('Failed to save timetable. Please try again.')
      }
      console.error('Failed to save timetable', e)
    }
    await new Promise((r) => setTimeout(r, 400))
    setGenerating(false)
    if (issues.length) {
      setMessage(`Generated with ${issues.length} unassigned slots due to constraints. Review and adjust data/availability.`)
    }
    navigate('/admin/sections')
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <LoadingOverlay open={generating} label="Generating optimized timetable..." />
      <Card>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 1 }}>Visual Timetable Builder</Typography>
          <Typography variant="body2" color="text.secondary">{message}</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="dept">Department</InputLabel>
                  <Select labelId="dept" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}>
                    {[...new Set(((dataset.departments || []).map(d => (d.dept_name || '').toString().toUpperCase())))]
                      .filter(Boolean)
                      .concat(['CSE','ECE','EEE','MECH','CIVIL'])
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((d) => (<MenuItem key={d} value={d}>{d}</MenuItem>))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="year">Year</InputLabel>
                  <Select labelId="year" label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
                    <MenuItem value="1">1st Year</MenuItem>
                    <MenuItem value="2">2nd Year</MenuItem>
                    <MenuItem value="3">3rd Year</MenuItem>
                    <MenuItem value="4">4th Year</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="sem">Semester</InputLabel>
                  <Select labelId="sem" label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)}>
                    <MenuItem value="1">Odd (1)</MenuItem>
                    <MenuItem value="2">Even (2)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth size="small" type="time" label="College Start" value={startTime} onChange={(e) => setStartTime(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth size="small" type="time" label="College End" value={endTime} onChange={(e) => setEndTime(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth size="small" type="number" label="Minutes per Period" value={periodMinutes} onChange={(e) => setPeriodMinutes(parseInt(e.target.value || 0, 10))} />
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">Preview periods: {computePeriods().join(' | ') || '—'}</Typography>
          </Stack>
        </CardContent>
        <CardActions>
          <Button variant="contained" startIcon={<AutoAwesome />} onClick={onGenerate}>Auto-Generate</Button>
          <Button variant="outlined" startIcon={<Replay />} onClick={() => setMessage('Only affected portions will be regenerated (mock).')}>Regenerate Affected</Button>
        </CardActions>
      </Card>
    </Stack>
  )
}
