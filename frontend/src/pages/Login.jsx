import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../store/auth'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import api from '../services/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('admin')
  const [regNo, setRegNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [passError, setPassError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const onSubmit = async (e) => {
    e.preventDefault()
    // Validate student creds: password must equal registration number
    if (role === 'student') {
      if (!regNo || !password || password !== regNo) {
        setPassError('For students, password must match the Registration Number')
        return
      }
    }
    setLoading(true)
    try {
      const payload = role === 'student'
        ? { role, email: regNo, password }
        : { role, email, password }
      const res = await api.post('/auth/login', payload)
      const user = res.data?.user
      if (!user) throw new Error('No user returned')
      login(user)
      navigate(role === 'admin' ? '/admin' : role === 'faculty' ? '/faculty' : '/student')
    } catch (err) {
      console.error('Login failed', err)
      setPassError('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <Card sx={{ width: 420, maxWidth: '92vw' }} component="form" onSubmit={onSubmit}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">Login</Typography>
            {role === 'student' ? (
              <TextField label="Registration Number" value={regNo} onChange={(e) => setRegNo(e.target.value)} required fullWidth autoComplete="username" />
            ) : (
              <TextField label={role === 'faculty' ? 'Faculty ID' : 'Email'} value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth autoComplete="username" />
            )}
            <TextField
              type={showPass ? 'text' : 'password'}
              label="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPassError('') }}
              required
              fullWidth
              error={Boolean(passError)}
              helperText={passError || (role === 'student' ? 'Use your Registration Number as the password' : '')}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton aria-label="toggle password visibility" onClick={() => setShowPass((v) => !v)} edge="end">
                      {showPass ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <FormControl fullWidth>
              <InputLabel id="role-label">Role</InputLabel>
              <Select labelId="role-label" label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="faculty">Faculty</MenuItem>
                <MenuItem value="student">Student</MenuItem>
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={18} /> : null}>
              {loading ? 'Signing in...' : 'Login'}
            </Button>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>
              <a href="/forgot" style={{ color: 'inherit' }}>Forgot password?</a>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
