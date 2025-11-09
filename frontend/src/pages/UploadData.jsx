import { useState } from 'react'
import Papa from 'papaparse'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import useDataset from '../store/dataset'
import api from '../services/api'

export default function UploadData() {
  const [result, setResult] = useState(null)
  const [detected, setDetected] = useState('')
  const [department, setDepartment] = useState('CSE')
  const [bulk, setBulk] = useState({ departments: null, subjects: null, faculty: null, sections: null, rooms: null })
  const [collegeStart, setCollegeStart] = useState('09:00')
  const [collegeEnd, setCollegeEnd] = useState('16:30')
  const [minutesPerPeriod, setMinutesPerPeriod] = useState(50)
  const { departments, setData } = useDataset((s) => ({ departments: s.departments, setData: s.setData }))

  const parseCsv = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data || []
        setResult(rows)
        const headers = rows.length ? Object.keys(rows[0]).map(k => k.toLowerCase()) : []
        setDetected(detectType(headers))
      }
    })
  }

  const buildPeriodTimes = (startHHMM, endHHMM, minutes) => {
    const pad = (n) => (n < 10 ? '0' + n : '' + n)
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const toLabel = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
    const s = toMin(startHHMM)
    const e = toMin(endHHMM)
    if (!minutes || minutes <= 0 || e <= s) return []
    const arr = []
    let cur = s
    while (cur + minutes <= e) {
      const next = cur + minutes
      arr.push(`${toLabel(cur)} - ${toLabel(next)}`)
      cur = next
    }
    return arr
  }

  const onGenerateAll = async () => {
    // Generate gap-free timetables for all departments/years/semesters inferred from DB
    const periodTimes = buildPeriodTimes(collegeStart, collegeEnd, Number(minutesPerPeriod))
    if (!periodTimes.length) {
      alert('Please check timings: ensure End > Start and Minutes per Period > 0')
      return
    }
    const body = {
      filters: {},
      periodTimes,
      days: ['Mon','Tue','Wed','Thu','Fri','Sat'],
      useSaturday: true,
      useAllYearSubjects: true,
      minSubjects: 6,
      activate: true
    }
    const res = await api.post('/generate_timetable/bulk', body)
    const d = res.data || {}
    alert(`Generated ${d.generated || 0} timetables and activated ${d.activated || 0}.`)
  }

  const parseCsvFor = (type, file) => {
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data || []
        setBulk((b) => ({ ...b, [type]: rows }))
      }
    })
  }

  const onChange = (e) => {
    const file = e.target.files?.[0]
    if (file) parseCsv(file)
  }

  const detectType = (headers) => {
    const h = new Set(headers || [])
    // explicit schemas
    if ((h.has('dept_id') && h.has('dept_name'))) return 'departments'
    if (h.has('subject_id') || h.has('subject_name')) return 'subjects'
    if (h.has('faculty_id') || h.has('faculty_name') || h.has('faculty_na')) return 'faculty'
    if (h.has('section_id') || h.has('section_na') || (h.has('section') && (h.has('dept_id') || h.has('department') || h.has('year') || h.has('semester')))) return 'sections'
    if (h.has('room_id') || h.has('room_name') || h.has('room_nam')) return 'rooms'
    // fallback legacy
    if (h.has('section') && (h.has('course') || h.has('coursecode') || h.has('course code'))) return 'assignments'
    if ((h.has('code') || h.has('course') || h.has('course code'))) return 'courses'
    if (h.has('room') || h.has('roomid') || h.has('type')) return 'rooms'
    if ((h.has('name') || h.has('faculty') || h.has('facultyid')) && !h.has('section')) return 'faculty'
    if (h.has('section') || h.has('label')) return 'sections'
    if (h.has('department') || h.has('dept') || h.has('name')) return 'departments'
    return 'sections'
  }

  // For DB persistence we rely on CSV having dept_id already; no tagging needed
  const tagWithDept = (rows) => rows

  const normalizeRows = (type, rows) => {
    const arr = rows || []
    if (type === 'departments') {
      return arr.map(r => ({
        dept_id: r.dept_id || r.id,
        dept_name: r.dept_name || r.name,
        hod_name: r.hod_name,
        contact_email: r.contact_email
      }))
    }
    if (type === 'subjects') {
      return arr.map(r => ({
        subject_id: r.subject_id || r.id,
        subject_name: r.subject_name || r.name,
        dept_id: r.dept_id || r.department || r.dept,
        year: (r.year ?? '').toString(),
        semester: (r.semester ?? '').toString(),
        credits: r.credits ? Number(r.credits) : undefined,
        subject_type: (r.subject_type || r.type || '').toString().toLowerCase()
      }))
    }
    if (type === 'faculty') {
      return arr.map(r => ({
        faculty_id: r.faculty_id || r.id,
        faculty_number: r.faculty_number || r.faculty_ph || r.phone,
        faculty_name: r.faculty_name || r.faculty_na || r.name,
        dept_id: r.dept_id || r.department || r.dept,
        subjects_can_teach: (r.subjects_can_teach || r.subjects_c || '').toString().split(/[,;]\s*/).filter(Boolean),
        max_load_hours: r.max_load_hours ? Number(r.max_load_hours) : (r.max_load_ ? Number(r.max_load_) : undefined),
        availability_days: (r.availability_days || r.availability || r['availability_'] || '').toString().split(/[,;]\s*/).filter(Boolean),
        availability_time_slots: (r.availability_time_slots || '').toString().split(/[,;]\s*/).filter(Boolean)
      }))
    }
    if (type === 'sections') {
      const deptIdSet = new Set((departments || []).map(d => d.dept_id))
      const nameToId = new Map((departments || []).map(d => [(d.dept_name || '').toString().toUpperCase(), d.dept_id]))
      const semToYear = (s) => {
        const n = Number((s ?? '').toString())
        if (!n) return undefined
        if (n <= 2) return '1'
        if (n <= 4) return '2'
        if (n <= 6) return '3'
        return '4'
      }
      return arr.map(r => {
        const rawDept = (r.dept_id || r.department || r.dept || '').toString()
        const rawYear = (r.year ?? '').toString()
        let dept_id = rawDept
        let year = rawYear
        // Fix common swap: dept_id column has name, year column has D00X
        if ((!deptIdSet.has(dept_id) && nameToId.has(rawDept.toUpperCase())) || /^D\d{3}$/i.test(rawYear)) {
          if (/^D\d{3}$/i.test(rawYear)) dept_id = rawYear
          if (!deptIdSet.has(rawDept) && nameToId.has(rawDept.toUpperCase())) dept_id = nameToId.get(rawDept.toUpperCase())
        }
        // Ensure year is numeric string; if not, infer from semester
        if (!/^\d+$/.test(year)) {
          const infer = semToYear(r.semester)
          year = (infer || '1').toString()
        }
        return {
          section_id: r.section_id || r.id || r.section || r.section_na,
          dept_id,
          year: year.toString(),
          semester: (r.semester ?? '').toString(),
          no_of_students: r.no_of_students ? Number(r.no_of_students) : (r.no_of_stud ? Number(r.no_of_stud) : undefined),
          class_advisor_id: r.class_advisor_id
        }
      })
    }
    if (type === 'rooms') {
      return arr.map(r => ({
        room_id: r.room_id || r.id,
        room_name: r.room_name || r.room_nam || r.name,
        room_type: (r.room_type || r.type || '').toString().toLowerCase(),
        capacity: r.capacity ? Number(r.capacity) : undefined,
        availability_days: (r.availability_days || r.availability || '').toString().split(/[,;]\s*/).filter(Boolean),
        availability_time_slots: (r.availability_time_slots || '').split(/[,;]\s*/).filter(Boolean)
      }))
    }
    return arr
  }

  const onUpload = async () => {
    if (!result?.length) return
    const key = detected || 'sections'
    const withDept = tagWithDept(result)
    const normalized = normalizeRows(key, withDept)
    // Persist to backend
    const endpoint = `/${key}/bulk`
    await api.post(endpoint, normalized)
    // Refresh local cache from backend
    await refreshFromBackend()
    alert(`Saved ${normalized.length} rows to ${key} in DB for ${department}`)
  }

  const onUploadAll = async () => {
    const types = ['departments','subjects','faculty','sections','rooms']
    const summary = []
    for (const t of types) {
      const rows = bulk[t]
      if (rows && rows.length) {
        const withDept = t === 'departments' ? rows : tagWithDept(rows)
        const normalized = normalizeRows(t, withDept)
        await api.post(`/${t}/bulk`, normalized)
        summary.push(`${t}: ${normalized.length}`)
      }
    }
    if (summary.length) {
      await refreshFromBackend()
      alert(`Uploaded → ${summary.join(', ')} to DB for ${department}`)
    } else {
      alert('No files selected for upload')
    }
  }

  const refreshFromBackend = async () => {
    const [deps, subs, facs, secs, rms] = await Promise.all([
      api.get('/departments'),
      api.get('/subjects'),
      api.get('/faculty'),
      api.get('/sections'),
      api.get('/rooms')
    ])
    setData('departments', deps.data)
    setData('subjects', subs.data)
    setData('faculty', facs.data)
    setData('sections', secs.data)
    setData('rooms', rms.data)
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" sx={{ mb: 1 }}>Single Upload</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Use this to upload exactly one CSV at a time (auto-detects the type from headers) and saves it to the selected department.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="dept">Department</InputLabel>
            <Select labelId="dept" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}>
              {[...new Set((departments?.map(d => (d.name || d.department || d.dept || '').toString().toUpperCase()) || []))]
                .filter(Boolean)
                .concat(['CSE','ECE','EEE','MECH','CIVIL'])
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((d) => (<MenuItem key={d} value={d}>{d}</MenuItem>))}
            </Select>
          </FormControl>
          <Button variant="outlined" component="label">
            Choose CSV
            <input type="file" accept=".csv" hidden onChange={onChange} />
          </Button>
          <Button variant="contained" onClick={onUpload} disabled={!result}>Upload</Button>
        </Stack>
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Bulk Upload (Multiple CSVs)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Use this when you want to upload multiple CSV files together (Departments, Subjects, Faculty, Sections, Rooms).
          </Typography>
          <Grid container spacing={1.25} sx={{ mb: 1 }}>
            <Grid item xs={12} sm={4} md={3} lg={2}>
              <TextField fullWidth size="small" label="College Start" type="time" value={collegeStart} onChange={(e)=>setCollegeStart(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={4} md={3} lg={2}>
              <TextField fullWidth size="small" label="College End" type="time" value={collegeEnd} onChange={(e)=>setCollegeEnd(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={4} md={3} lg={2}>
              <TextField fullWidth size="small" label="Minutes per Period" type="number" value={minutesPerPeriod} onChange={(e)=>setMinutesPerPeriod(e.target.value)} />
            </Grid>
          </Grid>
          <Grid container spacing={1.25}>
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" component="label">Departments<input type="file" accept=".csv" hidden onChange={(e)=>parseCsvFor('departments', e.target.files?.[0])} /></Button>
                <Typography variant="caption">{bulk.departments?.length ? `${bulk.departments.length} rows` : 'No file'}</Typography>
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" component="label">Subjects<input type="file" accept=".csv" hidden onChange={(e)=>parseCsvFor('subjects', e.target.files?.[0])} /></Button>
                <Typography variant="caption">{bulk.subjects?.length ? `${bulk.subjects.length} rows` : 'No file'}</Typography>
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" component="label">Faculty<input type="file" accept=".csv" hidden onChange={(e)=>parseCsvFor('faculty', e.target.files?.[0])} /></Button>
                <Typography variant="caption">{bulk.faculty?.length ? `${bulk.faculty.length} rows` : 'No file'}</Typography>
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" component="label">Sections<input type="file" accept=".csv" hidden onChange={(e)=>parseCsvFor('sections', e.target.files?.[0])} /></Button>
                <Typography variant="caption">{bulk.sections?.length ? `${bulk.sections.length} rows` : 'No file'}</Typography>
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" component="label">Rooms<input type="file" accept=".csv" hidden onChange={(e)=>parseCsvFor('rooms', e.target.files?.[0])} /></Button>
                <Typography variant="caption">{bulk.rooms?.length ? `${bulk.rooms.length} rows` : 'No file'}</Typography>
              </Stack>
            </Grid>
          </Grid>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="contained" onClick={onUploadAll}>Upload All</Button>
            <Button variant="outlined" onClick={onGenerateAll}>Generate All Timetables</Button>
          </Stack>
        </Box>
        {result && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Preview ({result.length} rows){detected ? ` • Detected: ${detected}` : ''} • Department: {department}</Typography>
            <Box sx={{ maxHeight: 220, overflow: 'auto', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default' }}>
              <pre style={{ margin: 0 }}>{JSON.stringify(result.slice(0, 5), null, 2)}</pre>
            </Box>
          </Box>
        )}
      </CardContent>
      <CardActions />
    </Card>
  )
}

