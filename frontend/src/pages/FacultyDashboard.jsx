import { useEffect, useState } from 'react'
import TimetableGrid from '../components/TimetableGrid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import useRequests from '../store/requests'
import { Link as RouterLink } from 'react-router-dom'
import useAuth from '../store/auth'
import api from '../services/api'

export default function FacultyDashboard() {
  const [slot, setSlot] = useState(null)
  const sendRequest = useRequests((s) => s.sendRequest)
  const { user } = useAuth()
  const [grid, setGrid] = useState({})
  const [periodTimes, setPeriodTimes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toDay, setToDay] = useState('')
  const [toPeriod, setToPeriod] = useState('')
  const [reason, setReason] = useState('')
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat']
  const [available, setAvailable] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notifyTo, setNotifyTo] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true); setError('')
        const fid = user?.faculty_id
        if (!fid) { setError('Missing faculty id. Please re-login as faculty.'); setLoading(false); return }
        const res = await api.get(`/faculty_users/${encodeURIComponent(fid)}/timetable`)
        const data = res.data || {}
        setGrid(data.grid || {})
        setPeriodTimes(data.periodTimes || [])
        try {
          const nres = await api.get(`/faculty_users/${encodeURIComponent(user?.faculty_id || '')}/notifications`)
          setNotifications((nres.data || {}).notifications || [])
        } catch {}
      } catch (e) {
        setError('Unable to load your timetable')
        // still render any partial
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.faculty_id])

  const openManage = ({ day, period, value }) => {
    if (!value) return
    setSlot({ day, period, value })
    // load real available substitutes for this slot
    loadAvailable({ day, period, value })
  }

  // Helper: subject match
  const canTeach = (fac, subjectLabel) => {
    const list = Array.isArray(fac?.subjects_can_teach) ? fac.subjects_can_teach : []
    if (!list.length) return true
    const set = new Set(list.map(x => String(x).toLowerCase()))
    const name = String(subjectLabel || '').toLowerCase()
    return set.has(name)
  }

  // Load available faculty from DB for the given slot
  const loadAvailable = async ({ day, period, value }) => {
    try {
      const dept_id = value?.dept_id
      const year = value?.year
      const semester = value?.semester
      const subjectLabel = value?.label
      const [facRes, tRes] = await Promise.all([
        api.get('/faculty'),
        api.get('/timetables', { params: { dept_id, year, semester } })
      ])
      const facAll = (facRes.data || []).filter(f => !dept_id || f.dept_id === dept_id)
      // Build busy set (faculty id or name) for this day/period across sections
      const docs = (tRes.data || []).filter(d => d.isActive) // prefer active
      const useDocs = docs.length ? docs : (tRes.data || [])
      const busy = new Set()
      const dName = day
      for (const doc of useDocs) {
        const bySection = doc.bySection || {}
        for (const grid of Object.values(bySection)) {
          if (Array.isArray(grid)) {
            const dIdx = days.indexOf(dName)
            const r = grid[dIdx] || []
            const cell = r[Number(period) - 1]
            const fac = cell?.faculty || {}
            const fid = fac.id || fac.faculty_id
            const fname = fac.name
            if (fid) busy.add(String(fid))
            else if (fname) busy.add(`name:${fname.toLowerCase()}`)
          } else if (grid && typeof grid === 'object') {
            const row = grid[dName] || grid[dName?.toLowerCase()] || grid[dName?.toUpperCase()]
            const cell = row?.[String(period)]
            const fac = cell?.faculty || {}
            const fid = fac.id || fac.faculty_id
            const fname = fac.name
            if (fid) busy.add(String(fid))
            else if (fname) busy.add(`name:${fname.toLowerCase()}`)
          }
        }
      }
      // Map real candidates
      const currentFid = value?.faculty?.id || value?.faculty?.faculty_id
      const candidates = facAll
        .filter(f => canTeach(f, subjectLabel))
        .filter(f => String(f.faculty_id || '') !== String(currentFid || ''))
        .filter(f => !busy.has(String(f.faculty_id || '')) && !busy.has(`name:${String(f.faculty_name || '').toLowerCase()}`))
        .map(f => ({ id: f.faculty_id || f.faculty_number, name: f.faculty_name, phone: f.faculty_number }))
      setAvailable(candidates)
    } catch (e) {
      console.warn('Failed to load available substitutes', e)
      setAvailable([])
    }
  }

  const requestSubstitute = async (fac) => {
    if (!slot) return
    const payload = {
      from: user?.faculty_id || 'YOU', fromName: user?.name || 'You', to: fac.id, toName: fac.name,
      subject: slot.value.label, section: slot.value.section, room: slot.value.room,
      day: slot.day, period: String(slot.period)
    }
    try {
      await api.post('/substitute_requests', payload)
      alert('Request sent')
    } catch (e) {
      alert('Failed to send request')
    }
    setSlot(null)
  }

  const submitReschedule = async () => {
    if (!slot) return
    try {
      const v = slot.value || {}
      const body = {
        faculty_id: user?.faculty_id,
        faculty_name: user?.name,
        dept_id: v.dept_id,
        year: v.year,
        semester: v.semester,
        section_id: v.section || v.section_id,
        subject: v.label,
        from_day: slot.day,
        from_period: slot.period,
        to_day: toDay,
        to_period: toPeriod,
        reason,
        notify_to: notifyTo
      }
      await api.post('/faculty_reschedules', body)
      setSlot(null)
      setToDay(''); setToPeriod(''); setReason(''); setNotifyTo('')
      alert('Reschedule request submitted')
    } catch (e) {
      alert('Failed to submit reschedule')
    }
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
            <Typography variant="h5">My Schedule</Typography>
            <Button component={RouterLink} to="/faculty/requests" variant="outlined">Requests</Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">Click a class to request a substitute or swap.</Typography>
          {loading && (
            <Typography variant="caption" color="text.secondary">Loading timetable…</Typography>
          )}
          {error && (
            <Typography variant="caption" color="error">{error}</Typography>
          )}
        </CardContent>
      </Card>


      {notifications && notifications.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Notifications</Typography>
            <List>
              {notifications.map(n => (
                <ListItem key={n._id || `${n.type}-${n.date}-${n.section_id}`}>
                  <ListItemText primary={n.message} secondary={`${n.date}${n.day ? ` (${n.day})` : ''}${n.periods?.length ? ` • Periods: ${n.periods.join(', ')}` : ''}`} />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      <TimetableGrid title="This Week" data={grid} periodTimes={periodTimes} showDetails onSlotClick={openManage} mode="faculty" />

      <Dialog open={Boolean(slot)} onClose={() => setSlot(null)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Slot</DialogTitle>
        <DialogContent>
          {slot && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <Typography variant="body2">{slot.day} • P{slot.period}</Typography>
              <Typography variant="body1"><strong>{slot.value.label}</strong> • {slot.value.section} • {slot.value.room}</Typography>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Available Faculty (same time)</Typography>
              <List>
                {available.map(f => (
                  <ListItem key={f.id} secondaryAction={<Button size="small" onClick={() => requestSubstitute(f)}>Send Request</Button>}>
                    <ListItemText primary={`${f.name} (${f.id})`} secondary={f.phone} />
                  </ListItem>
                ))}
              </List>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Request Reschedule</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <select value={toDay} onChange={(e) => setToDay(e.target.value)}>
                  <option value="">Select day</option>
                  {days.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={toPeriod} onChange={(e) => setToPeriod(e.target.value)}>
                  <option value="">Select period</option>
                  {Array.from({ length: (periodTimes || []).length || 8 }, (_, i) => String(i + 1)).map(p => (
                    <option key={p} value={p}>{`P${p}`}</option>
                  ))}
                </select>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <select value={notifyTo} onChange={(e) => setNotifyTo(e.target.value)}>
                  <option value="">Notify Faculty (optional)</option>
                  {available.map(f => (
                    <option key={f.id} value={f.id}>{`${f.name} (${f.id})`}</option>
                  ))}
                </select>
              </Stack>
              <textarea rows={3} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="contained" size="small" onClick={submitReschedule} disabled={!toDay || !toPeriod}>Submit Reschedule</Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSlot(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
