import { Link as RouterLink, useNavigate } from 'react-router-dom'
import useAuth from '../store/auth'
import useUI from '../store/ui'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import Box from '@mui/material/Box'
import { Brightness4, Brightness7, Logout, Login, Notifications as NotificationsIcon } from '@mui/icons-material'
import Badge from '@mui/material/Badge'
import useNotifications from '../store/notifications'

export default function Navbar() {
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuth()
  const { mode, toggleMode } = useUI()
  const unread = useNotifications((s) => s.unreadCount)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppBar position="sticky" color="default" enableColorOnDark>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="h6" component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'inherit', fontWeight: 700 }}>
          ATGS
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
            <IconButton onClick={toggleMode} color="inherit">
              {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          </Tooltip>

          {isAuthenticated ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={user?.role} size="small" />
              <IconButton component={RouterLink} to="/notifications" color="inherit">
                <Badge color="error" badgeContent={unread} max={9} overlap="circular">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
              {user?.role === 'admin' && (
                <>
                  <Button component={RouterLink} to="/admin">Dashboard</Button>
                  <Button component={RouterLink} to="/admin/upload">Upload CSV</Button>
                  <Button component={RouterLink} to="/admin/faculty">Faculty</Button>
                  <Button component={RouterLink} to="/admin/sections">Sections</Button>
                  <Button component={RouterLink} to="/admin/leaves">Leaves</Button>
                </>
              )}
              {user?.role === 'faculty' && (
                <>
                  <Button component={RouterLink} to="/faculty">My Schedule</Button>
                  <Button component={RouterLink} to="/faculty/leave">Leave</Button>
                  <Button component={RouterLink} to="/faculty/requests">Requests</Button>
                </>
              )}
              {user?.role === 'student' && (
                <Button component={RouterLink} to="/student">Timetable</Button>
              )}
              <Box>
                <Button variant="contained" color="primary" startIcon={<Logout />} onClick={handleLogout}>Logout</Button>
              </Box>
            </Stack>
          ) : (
            <Button component={RouterLink} to="/login" variant="contained" startIcon={<Login />}>Login</Button>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  )
}
