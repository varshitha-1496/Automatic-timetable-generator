// Switched from mock store to backend APIs
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import api from '../services/api'
import useAuth from '../store/auth'

export default function FacultyRequests() {
  const { user } = useAuth()
  const [tab, setTab] = useState(0)
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [loading, setLoading] = useState(false)

  // New request dialog state
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ day: 'Mon', period: '1', subject: '', section: '', room: '', to: '' })
  const [facultyList, setFacultyList] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        // populate faculty options
        const res = await api.get('/faculty')
        const rows = Array.isArray(res.data) ? res.data : []
        setFacultyList(rows.map(f => ({ id: f.faculty_id || f.faculty_number, name: f.faculty_name })))
        // fetch requests for logged-in faculty
        const fid = user?.faculty_id || ''
        if (fid) {
          await refresh(fid)
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.faculty_id])

  const refresh = async (fid) => {
    const who = fid || user?.faculty_id || ''
    const [inRes, outRes] = await Promise.all([
      api.get('/substitute_requests', { params: { to: who } }),
      api.get('/substitute_requests', { params: { from: who } })
    ])
    setIncoming((inRes.data || {}).rows || [])
    setOutgoing((outRes.data || {}).rows || [])
  }

  const accept = async (id) => {
    try { await api.post(`/substitute_requests/${id}/accept`); await refresh() } catch { alert('Failed to accept') }
  }
  const decline = async (id) => {
    try { await api.post(`/substitute_requests/${id}/decline`); await refresh() } catch { alert('Failed to decline') }
  }

  const incomingFiltered = incoming
  const outgoingFiltered = outgoing

  const renderList = (items, isIncoming) => (
    <List>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No requests</Typography>
      ) : items.map((r) => (
        <ListItem key={r._id || r.id} divider>
          <ListItemText
            primary={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography>{r.subject} • {r.section} • {r.day} P{r.period}</Typography>
                <Chip size="small" label={r.status} color={r.status === 'accepted' ? 'success' : r.status === 'declined' ? 'error' : 'default'} />
              </Stack>
            }
            secondary={`${isIncoming ? 'From' : 'To'}: ${r.fromName || r.toName || ''} (${isIncoming ? r.from : r.to}) • Room ${r.room || '-'}`}
          />
          {r.status === 'pending' && isIncoming && (
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => accept(r._id || r.id)} variant="contained">Accept</Button>
              <Button size="small" onClick={() => decline(r._id || r.id)} variant="outlined" color="error">Decline</Button>
            </Stack>
          )}
        </ListItem>
      ))}
    </List>
  )

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h5">Requests</Typography>
          {tab === 1 && (
            <Button variant="contained" size="small" onClick={() => setOpen(true)}>New Request</Button>
          )}
        </Stack>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab label={`Incoming (${incomingFiltered.length})`} />
          <Tab label={`Outgoing (${outgoingFiltered.length})`} />
        </Tabs>
        {tab === 0 ? renderList(incomingFiltered, true) : renderList(outgoingFiltered, false)}

        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>New Substitute Request</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction="row" spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel id="day">Day</InputLabel>
                  <Select labelId="day" label="Day" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                    {['Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel id="period">Period</InputLabel>
                  <Select labelId="period" label="Period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                    {['1','2','3','4','5','6','7','8'].map(p => <MenuItem key={p} value={p}>{`P${p}`}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>
              <TextField size="small" label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} fullWidth />
              <Stack direction="row" spacing={2}>
                <TextField size="small" label="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} fullWidth />
                <TextField size="small" label="Room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} fullWidth />
              </Stack>
              <FormControl fullWidth size="small">
                <InputLabel id="to">Request To</InputLabel>
                <Select labelId="to" label="Request To" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                  {facultyList.length === 0 ? (
                    <MenuItem disabled value="">No faculty found</MenuItem>
                  ) : facultyList.map(f => <MenuItem key={f.id} value={f.id}>{`${f.name} (${f.id})`}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => { try { const toName = facultyList.find(f=>f.id===form.to)?.name; await api.post('/substitute_requests', { from: user?.faculty_id, fromName: user?.name, to: form.to, toName, subject: form.subject, section: form.section, room: form.room, day: form.day, period: form.period }); await refresh(); setOpen(false) } catch (e) { alert('Failed to send'); } }} variant="contained" disabled={!form.to}>Send</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  )
}
