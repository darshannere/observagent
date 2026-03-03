import { Routes, Route, Navigate } from 'react-router'

function LiveDashboardPlaceholder() {
  return <div className="p-4 text-foreground">Live Dashboard — coming in Plan 03</div>
}

function HistoryPagePlaceholder() {
  return <div className="p-4 text-foreground">History — coming in Plan 04</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/live" replace />} />
      <Route path="/live" element={<LiveDashboardPlaceholder />} />
      <Route path="/history" element={<HistoryPagePlaceholder />} />
    </Routes>
  )
}
