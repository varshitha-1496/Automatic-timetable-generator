import { useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import useLeaves from '../store/leaves'

export default function FacultyLeave() {
  const submit = useLeaves((s) => s.submit)
  const [date, setDate] = useState('')
  const [session, setSession] = useState('Full Day')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const onSubmit = (e) => {
    e.preventDefault()
    if (!date || !reason) return
    setSending(true)
    setTimeout(() => {
      submit({ facultyId: 'YOU', facultyName: 'You', date, session, reason })
      setSending(false)
      setDate('')
      setReason('')
    }, 600)
  }

  return (
    <Card component="form" onSubmit={onSubmit}>
      <CardContent>
        <Typography variant="h5" sx={{ mb: 2 }}>Request Leave</Typography>
        <Stack spacing={2}>
          <TextField type="date" label="Date" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} required />
          <FormControl>
            <InputLabel id="session">Session</InputLabel>
            <Select labelId="session" label="Session" value={session} onChange={(e) => setSession(e.target.value)}>
              <MenuItem value="Full Day">Full Day</MenuItem>
              <MenuItem value="Forenoon">Forenoon</MenuItem>
              <MenuItem value="Afternoon">Afternoon</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required multiline minRows={3} />
          <Button type="submit" variant="contained" disabled={sending}>{sending ? 'Submitting...' : 'Submit'}</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
