import dotenv from 'dotenv'

// Load env BEFORE importing server (which imports routes/models)
dotenv.config()

const { default: app } = await import('./server.js')

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
