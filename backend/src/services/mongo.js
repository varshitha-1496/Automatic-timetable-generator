import mongoose from 'mongoose'

let timetableDb
let usersDb

export async function timetableConn() {
  if (timetableDb) return timetableDb
  const uri = process.env.MONGO_URI_TIMETABLE || process.env.MONGO_URI
  if (!uri) throw new Error('Missing MONGO_URI_TIMETABLE / MONGO_URI env')
  timetableDb = await mongoose.createConnection(uri, { dbName: process.env.MONGO_DB_TIMETABLE || 'TimetableDB' }).asPromise()
  console.log('Connected to timetable DB')
  return timetableDb
}

export async function usersConn() {
  if (usersDb) return usersDb
  const uri = process.env.MONGO_URI_USERS || process.env.MONGO_URI
  if (!uri) throw new Error('Missing MONGO_URI_USERS / MONGO_URI env')
  usersDb = await mongoose.createConnection(uri, { dbName: process.env.MONGO_DB_USERS || 'UserDB' }).asPromise()
  console.log('Connected to users DB')
  return usersDb
}
