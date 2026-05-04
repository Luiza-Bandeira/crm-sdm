import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ProtocoloView from './pages/ProtocoloView'
import AuthGuard from './components/AuthGuard'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/crm" replace />} />
      <Route 
        path="/crm" 
        element={
          <AuthGuard>
            <Dashboard />
          </AuthGuard>
        } 
      />
      <Route 
        path="/protocolo/:id" 
        element={
          <AuthGuard>
            <ProtocoloView />
          </AuthGuard>
        } 
      />
    </Routes>
  )
}
