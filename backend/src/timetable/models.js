import mongoose from 'mongoose'
import { timetableConn } from '../services/mongo.js'

const baseOpts = { timestamps: true }

const DepartmentSchema = new mongoose.Schema({
  dept_id: String,
  dept_name: { type: String, index: true },
  hod_name: String,
  contact_email: String
}, baseOpts)

const SubjectSchema = new mongoose.Schema({
  subject_id: String,
  subject_name: String,
  dept_id: String,
  year: String,
  semester: String,
  credits: Number,
  subject_type: { type: String, enum: ['theory','lab'], default: 'theory' }
}, baseOpts)

const FacultySchema = new mongoose.Schema({
  faculty_id: String,
  faculty_number: String,
  faculty_name: String,
  dept_id: String,
  subjects_can_teach: [String],
  max_load_hours: Number,
  availability_days: [String],
  availability_time_slots: [String]
}, baseOpts)

const SectionSchema = new mongoose.Schema({
  section_id: String,
  dept_id: String,
  year: String,
  no_of_students: Number
}, baseOpts)

const RoomSchema = new mongoose.Schema({
  room_id: String,
  room_name: String,
  room_type: { type: String, enum: ['class','lab'], default: 'class' },
  capacity: Number,
  availability_days: [String],
  availability_time_slots: [String]
}, baseOpts)

const TimetableSchema = new mongoose.Schema({
  dept_id: String,
  year: String,
  semester: String,
  periodTimes: [String],
  bySection: mongoose.Schema.Types.Mixed,
  isActive: { type: Boolean, default: false }
}, baseOpts)

const connPromise = timetableConn()

export async function getModels() {
  const conn = await connPromise
  return {
    Department: conn.model('departments', DepartmentSchema),
    Subject: conn.model('subjects', SubjectSchema),
    Faculty: conn.model('faculty', FacultySchema),
    Section: conn.model('sections', SectionSchema),
    Room: conn.model('rooms', RoomSchema),
    Timetable: conn.model('timetables', TimetableSchema)
  }
}
