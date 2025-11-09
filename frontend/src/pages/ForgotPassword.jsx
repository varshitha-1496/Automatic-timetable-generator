import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import LoadingOverlay from '../components/LoadingOverlay'

export default function ForgotPassword() {
  const [role, setRole] = useState('student')
  const [regNo, setRegNo] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [serverOtp, setServerOtp] = useState('')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const sendOtp = async () => {
    setError('')
    if (role === 'student' && (!regNo || !phone)) { setError('Enter registration number and phone'); return }
    if (role !== 'student' && (!email || !phone)) { setError('Enter ID and phone'); return }
    setLoading(true)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    setTimeout(() => {
      setServerOtp(code)
      setLoading(false)
      setStep(2)
    }, 800)
  }

  const verifyOtp = async () => {
    setError('')
    if (!otp || otp.length < 6) { setError('Enter the 6-digit OTP'); return }
    setLoading(true)
    setTimeout(() => {
      if (otp !== serverOtp) {
        setLoading(false)
        setError('Invalid OTP')
        return
      }
      setLoading(false)
      setStep(3)
    }, 600)
  }

  const resetPassword = async () => {
    setError('')
    if (!newPass || newPass.length < 4) { setError('Enter a valid new password'); return }
    if (newPass !== confirmPass) { setError('Passwords do not match'); return }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      navigate('/login')
    }, 700)
  }

  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <LoadingOverlay open={loading} label={step === 1 ? 'Sending OTP...' : step === 2 ? 'Verifying OTP...' : 'Updating password...'} />
      <Card sx={{ width: 480, maxWidth: '94vw' }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">Forgot Password</Typography>
            {step === 1 && (
              <>
                <FormControl fullWidth>
                  <InputLabel id="role">Role</InputLabel>
                  <Select labelId="role" label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="faculty">Faculty</MenuItem>
                    <MenuItem value="student">Student</MenuItem>
                  </Select>
                </FormControl>
                {role === 'student' ? (
                  <TextField label="Registration Number" value={regNo} onChange={(e) => setRegNo(e.target.value)} fullWidth />
                ) : (
                  <TextField label="ID" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
                )}
                <TextField label="Phone Number" placeholder="10-digit" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth />
                {error && <Typography color="error" variant="body2">{error}</Typography>}
              </>
            )}
            {step === 2 && (
              <>
                <Typography variant="body2">Enter the 6-digit OTP sent to your phone</Typography>
                <TextField label="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} fullWidth />
                {error && <Typography color="error" variant="body2">{error}</Typography>}
              </>
            )}
            {step === 3 && (
              <>
                <TextField type="password" label="New Password" value={newPass} onChange={(e) => setNewPass(e.target.value)} fullWidth />
                <TextField type="password" label="Confirm Password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} fullWidth />
                {error && <Typography color="error" variant="body2">{error}</Typography>}
              </>
            )}
          </Stack>
        </CardContent>
        <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
          {step > 1 ? (
            <Button onClick={() => setStep(step - 1)}>Back</Button>
          ) : <span />}
          {step === 1 && <Button variant="contained" onClick={sendOtp}>Send OTP</Button>}
          {step === 2 && <Button variant="contained" onClick={verifyOtp}>Verify OTP</Button>}
          {step === 3 && <Button variant="contained" onClick={resetPassword}>Set New Password</Button>}
        </CardActions>
      </Card>
    </Box>
  )
}
