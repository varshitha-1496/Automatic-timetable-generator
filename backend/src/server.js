import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { timetableConn, usersConn } from './services/mongo.js'
import timetableRouter from './timetable/routes.js'
import usersRouter from './users/routes.js'

const app = express()
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json())

// Ensure env is loaded before using it in connections
dotenv.config()

// initialize db connections
await timetableConn()
await usersConn()

app.get('/', (req, res) => res.json({ ok: true }))
app.use('/api', timetableRouter)
app.use('/api', usersRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
})

export default app
