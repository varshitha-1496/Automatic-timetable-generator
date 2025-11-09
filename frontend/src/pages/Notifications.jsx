import useNotifications from '../store/notifications'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import Chip from '@mui/material/Chip'

export default function Notifications() {
  const items = useNotifications((s) => s.items)
  const markRead = useNotifications((s) => s.markRead)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const clear = useNotifications((s) => s.clear)

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h5">Notifications</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={markAllRead}>Mark all read</Button>
            <Button size="small" color="error" onClick={clear}>Clear</Button>
          </Stack>
        </Stack>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No notifications</Typography>
        ) : (
          <List>
            {items.map((n) => (
              <ListItem key={n.id} divider>
                <ListItemText
                  primary={<Stack direction="row" spacing={1} alignItems="center"><Typography>{n.title}</Typography>{!n.read && <Chip label="New" color="primary" size="small" />}</Stack>}
                  secondary={n.body}
                />
                <ListItemSecondaryAction>
                  {!n.read && <Button size="small" onClick={() => markRead(n.id)}>Mark read</Button>}
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  )
}
