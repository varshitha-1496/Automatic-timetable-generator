import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { timetableConn, usersConn } from './services/mongo.js'
import timetableRouter from './timetable/routes.js'
import usersRouter from './users/routes.js'

dotenv.config()

const app = express()

app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ],
  credentials: true
}))

app.use(express.json())

// DB connections
await timetableConn()
await usersConn()

app.get('/', (req, res) => {
  res.json({ message: "Backend working!" })
})

app.use('/api', timetableRouter)
app.use('/api', usersRouter)

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: "Internal Server Error" })
})

// ⭐️ VERY IMPORTANT FOR RENDER ⭐️
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
