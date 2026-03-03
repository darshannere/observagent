import { Routes, Route, Navigate } from 'react-router'
import { LiveDashboard } from '@/pages/LiveDashboard'
import { HistoryPage } from '@/pages/HistoryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/live" replace />} />
      <Route path="/live" element={<LiveDashboard />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  )
}
