import { createTheme } from '@mui/material/styles'

export const getDesignTokens = (mode) => ({
  palette: {
    mode,
    primary: { main: mode === 'dark' ? '#5b8cff' : '#3b6cff' },
    secondary: { main: '#22d3ee' },
    background: {
      default: mode === 'dark' ? '#0b1020' : '#f6f7fb',
      paper: mode === 'dark' ? '#121735' : '#ffffff'
    }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCard: { styleOverrides: { root: { borderRadius: 14 } } }
  }
})

export const buildTheme = (mode = 'dark') => createTheme(getDesignTokens(mode))
