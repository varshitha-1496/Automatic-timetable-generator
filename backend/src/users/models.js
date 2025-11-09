import mongoose from 'mongoose'
import { usersConn } from '../services/mongo.js'

const baseOpts = { timestamps: true }

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  name: String
}, baseOpts)

const FacultyUserSchema = new mongoose.Schema({
  faculty_id: String,
  faculty_number: String,
  phone: String,
  email: String,
  password: String,
  name: String
}, baseOpts)

const StudentUserSchema = new mongoose.Schema({
  student_id: String,
  email: String,
  password: String,
  name: String,
  dept_id: String,
  year: String,
  semester: String,
  section_id: String
}, baseOpts)

// Leave request raised by faculty
const LeaveRequestSchema = new mongoose.Schema({
  faculty_id: String,
  faculty_name: String,
  date: String, // ISO date (YYYY-MM-DD)
  day: String,  // Mon, Tue, ... filled by server
  periods: [String], // optional list of period numbers as strings
  reason: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, baseOpts)

// Notification for students (section-scoped)
const NotificationSchema = new mongoose.Schema({
  type: { type: String, default: 'faculty_leave' },
  message: String,
  dept_id: String,
  year: String,
  semester: String,
  section_id: String,
  date: String, // ISO
  day: String,
  faculty_id: String,
  faculty_name: String,
  periods: [String]
}, baseOpts)

// Faculty reschedule request (from one slot to another)
const RescheduleRequestSchema = new mongoose.Schema({
  faculty_id: String,
  faculty_name: String,
  dept_id: String,
  year: String,
  semester: String,
  section_id: String,
  subject: String,
  from_day: String,
  from_period: String,
  to_day: String,
  to_period: String,
  reason: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' }
}, baseOpts)

// Substitute request (from one faculty to another for same slot)
const SubstituteRequestSchema = new mongoose.Schema({
  from: String,
  fromName: String,
  to: String,
  toName: String,
  subject: String,
  section: String,
  room: String,
  day: String,
  period: String,
  status: { type: String, enum: ['pending','accepted','declined'], default: 'pending' }
}, baseOpts)

const connPromise = usersConn()

export async function getUserModels() {
  const conn = await connPromise
  return {
    Admin: conn.model('admin', AdminSchema, 'admin'),
    FacultyUser: conn.model('faculty_users', FacultyUserSchema),
    StudentUser: conn.model('student_users', StudentUserSchema),
    LeaveRequest: conn.model('leave_requests', LeaveRequestSchema),
    Notification: conn.model('notifications', NotificationSchema),
    RescheduleRequest: conn.model('reschedule_requests', RescheduleRequestSchema),
    SubstituteRequest: conn.model('substitute_requests', SubstituteRequestSchema)
  }
}
