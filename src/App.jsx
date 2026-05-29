import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Buckets from './pages/Buckets'
import History from './pages/History'
import Insights from './pages/Insights'
import WishlistPage from './pages/Wishlist'
import EMITracker from './pages/EMITracker'
import MiniGoals from './pages/MiniGoals'
import Trips from './pages/Trips'
import Layout from './components/Layout'
import MomView from './pages/MomView'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/mom" element={<MomView />} />
      <Route path="*" element={
        !user ? <Login /> : (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/buckets" element={<Buckets />} />
              <Route path="/history" element={<History />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/emi" element={<EMITracker />} />
              <Route path="/goals" element={<MiniGoals />} />
              <Route path="/trips" element={<Trips />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        )
      } />
    </Routes>
  )
}

