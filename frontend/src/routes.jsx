import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import FacultyDashboard from './pages/FacultyDashboard'
import FacultyRequests from './pages/FacultyRequests'
import StudentDashboard from './pages/StudentDashboard'
import UploadData from './pages/UploadData'
import TimetableBuilder from './pages/TimetableBuilder'
import NotFound from './pages/NotFound'
import useAuth from './store/auth'
import ForgotPassword from './pages/ForgotPassword'
import Notifications from './pages/Notifications'
import AdminFacultyDirectory from './pages/AdminFacultyDirectory'
import AdminSections from './pages/AdminSections'
import FacultyLeave from './pages/FacultyLeave'
import AdminLeaves from './pages/AdminLeaves'

function PrivateRoute({ children, role }) {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role && user?.role !== role) return <Navigate to="/login" replace />
  return children
}

export default function RoutesConfig() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot" element={<ForgotPassword />} />

      <Route
        path="/notifications"
        element={
          <PrivateRoute>
            <Notifications />
          </PrivateRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <PrivateRoute role="admin">
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/leaves"
        element={
          <PrivateRoute role="admin">
            <AdminLeaves />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/faculty"
        element={
          <PrivateRoute role="admin">
            <AdminFacultyDirectory />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/sections"
        element={
          <PrivateRoute role="admin">
            <AdminSections />
          </PrivateRoute>
        }
      />
      <Route
        path="/faculty"
        element={
          <PrivateRoute role="faculty">
            <FacultyDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/faculty/leave"
        element={
          <PrivateRoute role="faculty">
            <FacultyLeave />
          </PrivateRoute>
        }
      />
      <Route
        path="/faculty/requests"
        element={
          <PrivateRoute role="faculty">
            <FacultyRequests />
          </PrivateRoute>
        }
      />
      <Route
        path="/student"
        element={
          <PrivateRoute role="student">
            <StudentDashboard />
          </PrivateRoute>
        }
      />

      <Route
        path="/admin/upload"
        element={
          <PrivateRoute role="admin">
            <UploadData />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/builder"
        element={
          <PrivateRoute role="admin">
            <TimetableBuilder />
          </PrivateRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
