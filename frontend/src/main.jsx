import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

import { ThemeProvider, CssBaseline } from '@mui/material'
import { buildTheme } from './theme'
import useUI from './store/ui'

function ThemedApp() {
  const mode = useUI((s) => s.mode)
  const theme = React.useMemo(() => buildTheme(mode), [mode])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
)
