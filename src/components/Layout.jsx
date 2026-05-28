import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, Layers, Clock, TrendingUp, LogOut, Menu, X, Gift, CreditCard, Target, Map } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/buckets', label: 'Buckets', icon: Layers },
  { path: '/history', label: 'History', icon: Clock },
  { path: '/insights', label: 'Insights', icon: TrendingUp },
  { path: '/wishlist', label: 'Wishlist', icon: Gift },
  { path: '/emi', label: 'EMI', icon: CreditCard },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/trips', label: 'Trips', icon: Map }
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="app-layout">
      <button
        className="mobile-nav-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        id="mobile-nav-toggle"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">Money.</div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
              id={`nav-${label.toLowerCase()}`}
              end={path === '/'}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          {user?.photoURL && <img src={user.photoURL} alt="" />}
          <div className="sidebar-user-info">
            <div className="name">{user?.displayName}</div>
            <div className="email">{user?.email}</div>
          </div>
          <button className="logout-btn" onClick={logout} id="logout-btn" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
