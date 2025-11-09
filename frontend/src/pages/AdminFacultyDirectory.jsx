import { useEffect, useMemo, useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import api from '../services/api'

export default function AdminFacultyDirectory() {
  const [q, setQ] = useState('')
  const [faculty, setFaculty] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/faculty')
        setFaculty(res.data || [])
      } catch (e) {
        console.error('Failed to fetch faculty', e)
      }
    }
    load()
  }, [])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = faculty.map(f => ({
      id: f.faculty_id || f.id,
      name: f.faculty_name || f.name,
      number: f.faculty_number,
      dept_id: f.dept_id,
      subjects: Array.isArray(f.subjects_can_teach) ? f.subjects_can_teach : (f.subjects_can_teach ? String(f.subjects_can_teach).split(/[,;]\s*/) : []),
      load: f.max_load_hours || 0
    }))
    if (!t) return list
    return list.filter(f =>
      (f.name || '').toLowerCase().includes(t) ||
      (f.id || '').toLowerCase().includes(t) ||
      (f.number || '').toLowerCase().includes(t) ||
      f.subjects.some(c => (c || '').toLowerCase().includes(t))
    )
  }, [q, faculty])

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5">Faculty Directory</Typography>
          <TextField size="small" placeholder="Search by name, ID, course, section" value={q} onChange={e => setQ(e.target.value)} />
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Faculty</TableCell>
              <TableCell>Faculty No.</TableCell>
              <TableCell>Teaches</TableCell>
              <TableCell align="right">Max Load (hrs)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(f => (
              <TableRow key={f.id || f.name} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={f.id} size="small" />
                    <Typography>{f.name}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>{f.number || '—'}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {f.subjects.map(c => <Chip key={c} label={c} size="small" />)}
                  </Stack>
                </TableCell>
                <TableCell align="right">{f.load}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
