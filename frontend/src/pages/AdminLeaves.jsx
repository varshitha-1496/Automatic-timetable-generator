import useLeaves from '../store/leaves'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'

export default function AdminLeaves() {
  const items = useLeaves((s) => s.requests)
  const approve = useLeaves((s) => s.approve)
  const reject = useLeaves((s) => s.reject)

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" sx={{ mb: 1 }}>Leave Requests</Typography>
        <List>
          {items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No leave requests</Typography>
          ) : items.map((r) => (
            <ListItem key={r.id} divider secondaryAction={
              r.status === 'pending' ? (
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => approve(r.id)} variant="contained">Approve</Button>
                  <Button size="small" onClick={() => reject(r.id)} variant="outlined" color="error">Reject</Button>
                </Stack>
              ) : null
            }>
              <ListItemText
                primary={<Stack direction="row" spacing={1} alignItems="center"><Typography>{r.facultyName} ({r.facultyId})</Typography><Chip size="small" label={r.status} color={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'error' : 'default'} /></Stack>}
                secondary={`${r.date} • ${r.session} • ${r.reason}`}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  )
}
