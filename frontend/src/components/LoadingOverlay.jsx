import Backdrop from '@mui/material/Backdrop'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'

export default function LoadingOverlay({ open, label = 'Loading...' }) {
  return (
    <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }} open={open}>
      <Stack alignItems="center" spacing={2}>
        <CircularProgress color="inherit" thickness={4} />
        <Typography variant="body2">{label}</Typography>
      </Stack>
    </Backdrop>
  )
}
