import { Link as RouterLink } from 'react-router-dom'
import { useEffect } from 'react'
import api from '../services/api'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { Schedule, CloudUpload, Dashboard as DashboardIcon } from '@mui/icons-material'
import Chip from '@mui/material/Chip'
import useDataset from '../store/dataset'
import useRequests from '../store/requests'
import useLeaves from '../store/leaves'

export default function AdminDashboard() {
  const ds = useDataset()
  const setData = useDataset((s) => s.setData)
  const rqIncoming = useRequests((s) => s.incoming)
  const rqOutgoing = useRequests((s) => s.outgoing)
  const leaves = useLeaves((s) => s.requests)

  const kpis = [
    { label: 'Departments', value: ds.departments?.length || 0 },
    { label: 'Sections', value: ds.sections?.length || 0 },
    { label: 'Faculty', value: ds.faculty?.length || 0 },
    { label: 'Rooms', value: ds.rooms?.length || 0 },
    { label: 'Subjects', value: ds.subjects?.length || 0 },
    { label: 'Pending Requests', value: (rqIncoming?.filter(r=>r.status==='pending').length || 0) },
    { label: 'Pending Leaves', value: (leaves?.filter(l=>l.status==='pending').length || 0) },
  ]

  useEffect(() => {
    const load = async () => {
      try {
        const [deps, secs, facs, rms, subs] = await Promise.all([
          api.get('/departments'),
          api.get('/sections'),
          api.get('/faculty'),
          api.get('/rooms'),
          api.get('/subjects')
        ])
        setData('departments', deps.data || [])
        setData('sections', secs.data || [])
        setData('faculty', facs.data || [])
        setData('rooms', rms.data || [])
        setData('subjects', subs.data || [])
      } catch (e) {
        // non-blocking
        console.error('Failed to prefetch dashboard data', e)
      }
    }
    load()
  }, [])

  const cardSx = {
    height: '100%',
    borderRadius: 2,
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 }
  }

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      <Card sx={{ ...cardSx, boxShadow: 4 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'start', md: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <DashboardIcon />
              <Typography variant="h5">Admin Dashboard</Typography>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button component={RouterLink} to="/admin/upload" startIcon={<CloudUpload />}>Upload CSV</Button>
              <Button component={RouterLink} to="/admin/builder" startIcon={<Schedule />}>Timetable Builder</Button>
            </Stack>
          </Stack>
          <Grid container spacing={1.25}>
            {kpis.map((k) => (
              <Grid key={k.label} item xs={12} sm={6} md={3} lg={3}>
                <Card sx={{ ...cardSx, minHeight: 128 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 0.5 }}>{k.label}</Typography>
                    <Typography variant="h2" sx={{ lineHeight: 1 }}>{k.value}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
      <Card sx={cardSx}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Shortcuts</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button component={RouterLink} to="/admin/faculty" variant="outlined">Faculty Directory</Button>
            <Button component={RouterLink} to="/admin/sections" variant="outlined">Sections & Timetables</Button>
            <Button component={RouterLink} to="/admin/leaves" variant="outlined">Leave Approvals</Button>
            <Button component={RouterLink} to="/notifications" variant="outlined">Notifications</Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
