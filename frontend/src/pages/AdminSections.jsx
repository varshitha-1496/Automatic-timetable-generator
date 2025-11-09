import { useEffect, useMemo, useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TimetableGrid from '../components/TimetableGrid'
import useDataset from '../store/dataset'
import api from '../services/api'

const fallbackPeriodTimes = []

export default function AdminSections() {
  const [dept, setDept] = useState('')
  const [section, setSection] = useState('')
  const [viewGrid, setViewGrid] = useState({})
  const [viewPeriodTimes, setViewPeriodTimes] = useState([])
  const dataset = useDataset()
  const setData = useDataset((s) => s.setData)

  useEffect(() => {
    const fetchData = async () => {
      const [deps, secs, facs] = await Promise.all([
        api.get('/departments'),
        api.get('/sections'),
        api.get('/faculty')
      ])
      setData('departments', deps.data || [])
      setData('sections', secs.data || [])
      setData('faculty', facs.data || [])
      // default select first department if not set
      const depList = deps.data || []
      if (!dept && depList.length) setDept((depList[0].dept_name || '').toString().toUpperCase())
    }
    fetchData()
  }, [])

  const deptMapById = useMemo(() => {
    const map = new Map()
    for (const d of (dataset.departments || [])) {
      map.set(d.dept_id, (d.dept_name || '').toString().toUpperCase())
    }
    return map
  }, [dataset.departments])

  const selectedDeptId = useMemo(() => {
    const d = (dataset.departments || []).find(x => (x.dept_name || '').toString().toUpperCase() === dept)
    return d?.dept_id
  }, [dept, dataset.departments])

  const storeSections = (dataset.sections || [])
    .filter(s => {
      if (!dept) return true
      // Prefer exact dept_id match using selectedDeptId
      if (selectedDeptId) return (s.dept_id === selectedDeptId)
      // Fallback: try to map by name if dept_id->name mapping exists on the row
      const name = deptMapById.get(s.dept_id) || (s.department || s.dept || '').toString().toUpperCase()
      return name === dept
    })
    .map(s => {
      const name = deptMapById.get(s.dept_id) || (s.department || s.dept || '').toString().toUpperCase()
      const id = s.section_id || s.id || s.section
      return { id, dept: name, sem: s.semester || s.sem || '', label: `${name} - ${id}` }
    })

  const usingStore = false
  const filteredSections = useMemo(() => {
    const base = storeSections
    return base.filter(s => !dept || s.dept === dept)
  }, [dept, storeSections])

  // Auto-pick first section whenever department or list changes
  useEffect(() => {
    if (filteredSections.length) {
      if (!section || !filteredSections.find(s => s.id === section)) {
        setSection(filteredSections[0].id)
      }
    } else {
      setSection('')
    }
  }, [dept, filteredSections])

  // Transform timetable data (either 2D array [day][period] or object { Mon: { '1': val } })
  const toGridMap = (gridIn = [], periodCount = 8) => {
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat']
    const out = {}
    if (Array.isArray(gridIn)) {
      // 2D array format
      for (let d = 0; d < days.length; d++) {
        const row = gridIn[d] || []
        const rowObj = {}
        for (let p = 0; p < periodCount; p++) {
          const val = row[p]
          if (val) rowObj[String(p + 1)] = (typeof val === 'object') ? val : { label: val }
        }
        out[days[d]] = rowObj
      }
      return out
    }
    if (gridIn && typeof gridIn === 'object') {
      // Object format keyed by day -> periodIndex('1'..)
      for (const d of days) {
        const rowObj = {}
        const src = gridIn[d] || gridIn[d.toLowerCase()] || gridIn[d.toUpperCase()] || {}
        for (let p = 1; p <= periodCount; p++) {
          const v = src[String(p)]
          if (v) rowObj[String(p)] = (typeof v === 'object') ? v : { label: v }
        }
        out[d] = rowObj
      }
      return out
    }
    return out
  }

  // Infer faculty details for display if a cell has no faculty object
  const canTeach = (fac, subjectLabel, subjectId) => {
    const list = Array.isArray(fac?.subjects_can_teach) ? fac.subjects_can_teach : []
    if (!list.length) return true
    const lower = new Set(list.map(x => (x ?? '').toString().toLowerCase()))
    const sid = (subjectId ?? '').toString().toLowerCase()
    const sname = (subjectLabel ?? '').toString().toLowerCase()
    return lower.has(sid) || lower.has(sname)
  }
  const enrichWithFaculty = (gridObj) => {
    const out = { ...gridObj }
    const facs = dataset.faculty || []
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat']
    for (const d of days) {
      const row = out[d] || {}
      for (const p of Object.keys(row)) {
        const cell = row[p]
        if (!cell) continue
        // Case 1: already has faculty but missing phone -> backfill from dataset
        if (typeof cell === 'object' && cell.faculty) {
          if (!cell.faculty.phone) {
            const byId = facs.find(f => String(f.faculty_id||'').trim() === String(cell.faculty.id||'').trim())
            const byName = facs.find(f => String(f.faculty_name||'').trim().toLowerCase() === String(cell.faculty.name||'').trim().toLowerCase())
            const src = byId || byName
            if (src) {
              row[p] = {
                ...cell,
                faculty: { ...cell.faculty, phone: src.faculty_number || src.phone }
              }
            }
          }
          continue
        }
        // Case 2: no faculty object -> infer a matching faculty for display
        const label = typeof cell === 'object' ? cell.label : cell
        if (!label) continue
        const match = facs.find(f => canTeach(f, label, cell?.subject_id))
        if (match) {
          const next = typeof cell === 'object' ? { ...cell } : { label }
          next.faculty = {
            name: match.faculty_name || match.name,
            id: match.faculty_id || match.id,
            phone: match.faculty_number || match.phone
          }
          row[p] = next
        }
      }
      out[d] = row
    }
    return out
  }

  // load timetable when section selection changes
  useEffect(() => {
    const load = async () => {
      try {
        setViewGrid({}); setViewPeriodTimes([])
        if (!section) return
        const secRow = (dataset.sections || []).find(s => (s.section_id || s.id || s.section) === section)
        if (!secRow) return
        const dept_id = secRow.dept_id
        const year = (secRow.year ?? '').toString()
        const semester = (secRow.semester ?? '').toString()
        // Prefer active timetable; fallback to latest (filter by dept/year/semester if available)
        const params = new URLSearchParams()
        if (dept_id) params.set('dept_id', dept_id)
        if (year) params.set('year', year)
        if (semester) params.set('semester', semester)
        const res = await api.get(`/timetables?${params.toString()}`)
        let rows = res.data || []
        // Ultimate fallback: load any latest timetable if none match filters
        if (!rows.length) {
          // Attempt on-demand generation for this combo, then reload
          try {
            await api.post('/generate_timetable', { dept_id, year, semester, activate: true })
            const retry = await api.get(`/timetables?${params.toString()}`)
            rows = retry.data || []
          } catch {
            // fallback to any latest
            const all = await api.get('/timetables')
            rows = all.data || []
          }
        }
        if (!rows.length) return
        const active = rows.find(r => r.isActive)
        const doc = active || rows[0]
        let grid = (doc.bySection || {})[section]
        setViewPeriodTimes(doc.periodTimes || [])
        if (!grid) {
          const keys = Object.keys(doc.bySection || {})
          if (keys.length) {
            grid = doc.bySection[keys[0]]
            // Also switch the UI selection to the available section
            setSection(keys[0])
          }
        }
        if (grid) {
          const mapped = toGridMap(grid, (doc.periodTimes || []).length || 8)
          const enriched = enrichWithFaculty(mapped)
          setViewGrid(enriched)
        } else {
          setViewGrid({})
        }
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [section, dataset.sections])

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" sx={{ mb: 2 }}>Sections</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="dept">Department</InputLabel>
            <Select labelId="dept" label="Department" value={dept} onChange={(e) => {
              setDept(e.target.value)
              const base = storeSections
              const first = base.find(s => s.dept === e.target.value)
              if (first) setSection(first.id)
            }}>
              {[...new Set((dataset.departments || []).map(d => (d.dept_name || '').toString().toUpperCase()))]
                .filter(Boolean)
                .map(name => (<MenuItem key={name} value={name}>{name}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="section">Section</InputLabel>
            <Select labelId="section" label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
              {filteredSections.map(s => (
                <MenuItem key={s.id} value={s.id}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        <TimetableGrid
          title={`Timetable - ${section}`}
          data={viewGrid}
          periodTimes={viewPeriodTimes.length ? viewPeriodTimes : fallbackPeriodTimes}
          showDetails
          onSlotClick={({ day, period, value }) => {
            // Quick diagnostic: inspect what the cell contains (string vs object with faculty)
            // Open DevTools Console to see this output when you click a cell
            console.log('Timetable cell:', { day, period, value })
          }}
        />
        {!filteredSections.length && (
          <Typography variant="caption" color="text.secondary">No sections found for {dept}. Ensure sections.csv is uploaded with matching dept_id.</Typography>
        )}
        {!!filteredSections.length && (
          <Typography variant="caption" color="text.secondary">{filteredSections.length} section(s) found</Typography>
        )}
      </CardContent>
    </Card>
  )
}
