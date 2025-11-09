import { useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import TimetableGrid from '../components/TimetableGrid'
import api from '../services/api'
import useAuth from '../store/auth'

// Transform backend 2D array grid into the object map TimetableGrid expects
function toGridMap(grid2d) {
  if (!Array.isArray(grid2d)) return {}
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const out = {}
  for (let r = 0; r < grid2d.length; r++) {
    const row = grid2d[r] || []
    const day = days[r] || `Day${r + 1}`
    out[day] = {}
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (cell) {
        out[day][String(c + 1)] = cell
      }
    }
  }
  return out
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('My Timetable')
  const [periodTimes, setPeriodTimes] = useState([])
  const [gridMap, setGridMap] = useState({})
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setLoading(true)
        setError('')
        const sid = user?.student_id
        if (!sid) throw new Error('Missing student_id in session')
        const res = await api.get(`/student_users/${encodeURIComponent(sid)}/timetable`)
        const data = res.data || {}
        if (!data.grid) throw new Error('No timetable grid available')
        if (!mounted) return
        setPeriodTimes(Array.isArray(data.periodTimes) ? data.periodTimes : [])
        setGridMap(toGridMap(data.grid))
        const disp = [user?.section_id, `Year ${data.year}`, `Sem ${data.semester}`].filter(Boolean).join(' • ')
        setTitle(disp || 'My Timetable')
        // fetch notifications for the student
        try {
          const nres = await api.get(`/student_users/${encodeURIComponent(sid)}/notifications`)
          setNotifications((nres.data || {}).notifications || [])
        } catch (e) {
          // ignore notification errors to not block timetable
        }
      } catch (err) {
        console.error('Student timetable load failed', err)
        if (mounted) setError('Could not load timetable')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [user])

  const content = useMemo(() => {
    if (loading) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography variant="body2">Loading your timetable...</Typography>
        </Stack>
      )
    }
    if (error) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <Typography color="error">{error}</Typography>
          <Button variant="outlined" onClick={() => window.location.reload()}>Retry</Button>
        </Stack>
      )
    }
    return (
      <TimetableGrid title={title} data={gridMap} periodTimes={periodTimes} showDetails />
    )
  }, [loading, error, title, gridMap, periodTimes])

  return (
    <div className="stack">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Student Timetable</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => window.print()}>Download PDF</Button>
        </Stack>
      </div>
      {notifications && notifications.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Notifications</Typography>
            <List dense>
              {notifications.map((n) => (
                <ListItem key={n._id}>
                  <ListItemText
                    primary={n.message}
                    secondary={`Date: ${n.date} (${n.day})${n.periods?.length ? ` • Periods: ${n.periods.join(', ')}` : ''}`}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
      {content}
    </div>
  )
}
