import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import {
  subscribeToMomExpenses,
  subscribeToTripsRealtime,
  subscribeToCurrentPeriod,
  getCumulativeSavings,
  todayKey
} from '../services/firestore'
import { format } from 'date-fns'
import { Lock, Unlock, Calendar, Wallet, Heart, Activity, AlertCircle, Sparkles, RefreshCw } from 'lucide-react'

export default function MomView() {
  const [searchParams] = useSearchParams()
  const uid = searchParams.get('uid')

  // States
  const [sharingConfig, setSharingConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [isVerified, setIsVerified] = useState(() => {
    if (!uid) return false
    return sessionStorage.getItem(`mom_auth_${uid}`) === 'true'
  })
  
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(null)
  const [shake, setShake] = useState(false)

  // Real-time data
  const [periodData, setPeriodData] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [trips, setTrips] = useState([])
  const [cumulative, setCumulative] = useState({ totalSaved: 0 })
  const [expandedTripId, setExpandedTripId] = useState(null)

  // Page Setup
  useEffect(() => {
    document.title = "Mom's Dashboard 👩"
    
    // Add viewport optimization meta tag for mobile devices if not exists
    let meta = document.querySelector('meta[name="viewport"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'viewport'
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
      document.getElementsByTagName('head')[0].appendChild(meta)
    } else {
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
    }
  }, [])

  // 1. Listen to Sharing Configuration in Real-time
  useEffect(() => {
    if (!uid) {
      setConfigLoading(false)
      return
    }

    const ref = doc(db, 'users', uid, 'shared', 'momview')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setSharingConfig(data)
          if (!data.enabled) {
            setIsVerified(false)
            sessionStorage.removeItem(`mom_auth_${uid}`)
          }
        } else {
          setSharingConfig({ enabled: false, pin: '7043' })
          setIsVerified(false)
          sessionStorage.removeItem(`mom_auth_${uid}`)
        }
        setConfigLoading(false)
      },
      (err) => {
        console.error('Config fetch failed:', err)
        setSharingConfig({ enabled: false, pin: '7043' })
        setIsVerified(false)
        setConfigLoading(false)
      }
    )

    return unsub
  }, [uid])

  // 2. Listen to data only if verified
  useEffect(() => {
    if (!uid || !isVerified) return

    // Subscribe to current period totals
    const unsubPeriod = subscribeToCurrentPeriod(uid, (data) => {
      setPeriodData(data)
    })

    // Subscribe to expense-only transactions
    const unsubExpenses = subscribeToMomExpenses(uid, (data) => {
      setExpenses(data)
    })

    // Subscribe to trips list
    const unsubTrips = subscribeToTripsRealtime(uid, (data) => {
      setTrips(data)
    })

    return () => {
      unsubPeriod()
      unsubExpenses()
      unsubTrips()
    }
  }, [uid, isVerified])

  // 2.5 Load Cumulative Savings in Real-time whenever period changes
  useEffect(() => {
    if (!uid || !isVerified) return
    getCumulativeSavings(uid).then((data) => {
      setCumulative(data)
    }).catch(err => {
      console.error('Failed to get cumulative savings:', err)
    })
  }, [uid, isVerified, periodData])

  // 3. Handle PIN digit typing
  const handleKeyPress = (num) => {
    if (pinInput.length >= 4) return
    setPinError(null)
    const newVal = pinInput + num
    setPinInput(newVal)

    if (newVal.length === 4) {
      verifyPin(newVal)
    }
  }

  const handleBackspace = () => {
    setPinInput(prev => prev.slice(0, -1))
    setPinError(null)
  }

  const verifyPin = (enteredPin) => {
    const targetPin = sharingConfig?.pin || '7043'
    if (enteredPin === targetPin) {
      sessionStorage.setItem(`mom_auth_${uid}`, 'true')
      setIsVerified(true)
      setPinInput('')
    } else {
      setShake(true)
      setPinError('Incorrect PIN code')
      setTimeout(() => {
        setShake(false)
        setPinInput('')
      }, 500)
    }
  }

  // 4. Calculations
  const todaySpend = useMemo(() => {
    const today = todayKey()
    return expenses
      .filter(t => t.date === today)
      .reduce((sum, t) => sum + (t.amount || 0), 0)
  }, [expenses])

  const totalMonthlySpend = periodData?.totalExpenses || 0

  const activeTrips = useMemo(() => {
    return trips
      .filter(t => t.status === 'active')
      .map(t => {
        const spent = (t.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0)
        const budget = t.totalBudget || t.originalBudget || 1
        const pct = Math.min(Math.round((spent / budget) * 100), 100)
        return {
          ...t,
          spent,
          budget,
          pct
        }
      })
  }, [trips])

  // UI Render Paths
  if (!uid) {
    return (
      <div className="mom-fallback-container">
        <div className="mom-fallback-card">
          <AlertCircle size={40} className="icon-error" />
          <h2>Invalid Link</h2>
          <p>This sharing link is invalid or incomplete. Please request a new share link from the dashboard.</p>
        </div>
      </div>
    )
  }

  if (configLoading) {
    return (
      <div className="mom-fallback-container">
        <div className="mom-spinner" />
      </div>
    )
  }

  if (!sharingConfig || !sharingConfig.enabled) {
    return (
      <div className="mom-fallback-container">
        <div className="mom-fallback-card">
          <Lock size={40} className="icon-locked" />
          <h2>Access Expired</h2>
          <p>Sharing access has been disabled by the owner. Please ask them to re-enable sharing on their dashboard.</p>
        </div>
      </div>
    )
  }

  // PASSCODE UI SCREEN
  if (!isVerified) {
    return (
      <div className="mom-pin-screen">
        <div className="mom-pin-header">
          <div className="mom-avatar">👩</div>
          <h1>Mom's Dashboard</h1>
          <p>Enter the security PIN to view today's spending</p>
        </div>

        <div className={`mom-pin-dots ${shake ? 'shake' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i} 
              className={`pin-dot ${pinInput.length > i ? 'active' : ''} ${pinError ? 'error' : ''}`} 
            />
          ))}
        </div>

        {pinError && <div className="mom-pin-error">{pinError}</div>}

        <div className="mom-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} className="keypad-btn" onClick={() => handleKeyPress(num)}>
              {num}
            </button>
          ))}
          <button className="keypad-btn empty" disabled></button>
          <button className="keypad-btn" onClick={() => handleKeyPress(0)}>
            0
          </button>
          <button className="keypad-btn backspace" onClick={handleBackspace}>
            ⌫
          </button>
        </div>
      </div>
    )
  }

  // MAIN MOBILE DASHBOARD
  return (
    <div className="mom-dashboard-container">
      {/* Top Profile Header */}
      <header className="mom-dash-header">
        <div className="mom-header-profile">
          <span className="mom-header-avatar">👩</span>
          <div>
            <h3>Mom's View</h3>
            <span className="live-badge">
              <span className="live-dot" /> Live Spending
            </span>
          </div>
        </div>
        <button 
          className="mom-logout-btn" 
          onClick={() => {
            sessionStorage.removeItem(`mom_auth_${uid}`)
            setIsVerified(false)
          }}
        >
          Lock
        </button>
      </header>

      {/* Stats Cards Grid (Today's Spend, This Month's Spend, Total Savings) */}
      <section className="mom-stats-grid">
        <div className="mom-stat-card">
          <div className="mom-stat-label">Today's Spend</div>
          <div className="mom-stat-value">₹{todaySpend.toLocaleString('en-IN')}</div>
        </div>
        <div className="mom-stat-card">
          <div className="mom-stat-label">This Month's Spend</div>
          <div className="mom-stat-value">₹{totalMonthlySpend.toLocaleString('en-IN')}</div>
        </div>
        <div className="mom-stat-card highlight">
          <div className="mom-stat-label">Total Savings</div>
          <div className="mom-stat-value">₹{(cumulative.totalSaved || 0).toLocaleString('en-IN')}</div>
        </div>
      </section>

      {/* Trip Spending */}
      {activeTrips.length > 0 && (
        <section className="mom-section">
          <div className="mom-section-header">
            <Sparkles size={16} />
            <h2>Active Trip Budgets</h2>
          </div>
          <div className="mom-trips-list">
            {activeTrips.map(t => {
              const isExpanded = expandedTripId === t.id
              return (
                <div 
                  key={t.id} 
                  className="mom-trip-card" 
                  onClick={() => setExpandedTripId(isExpanded ? null : t.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="mom-trip-item">
                    <div className="mom-trip-info">
                      <span className="mom-trip-title" style={{ color: t.themeColor }}>
                        {t.coverEmoji} {t.name}
                      </span>
                      <span className="mom-trip-spend">
                        ₹{t.spent.toLocaleString('en-IN')} / ₹{t.budget.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="mom-progress-track">
                      <div 
                        className="mom-progress-fill" 
                        style={{ 
                          width: `${t.pct}%`, 
                          backgroundColor: t.themeColor || '#000000' 
                        }} 
                      />
                    </div>
                    <div className="mom-trip-click-hint">
                      {isExpanded ? '▼ Hide Trip Expenses' : '▲ Show Trip Expenses'}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mom-trip-expenses-expanded" onClick={(e) => e.stopPropagation()}>
                      {(t.expenses || []).length === 0 ? (
                        <div className="mom-trip-empty-expenses">No expenses registered for this trip yet.</div>
                      ) : (
                        <div className="mom-trip-expenses-list">
                          {t.expenses.map(exp => (
                            <div key={exp.id} className="mom-trip-exp-row">
                              <div className="mom-trip-exp-left">
                                <span className="mom-trip-exp-desc">{exp.description}</span>
                                <span className="mom-trip-exp-date">{exp.date ? format(new Date(exp.date), 'MMM d') : ''}</span>
                              </div>
                              <span className="mom-trip-exp-amt">₹{(exp.amount || 0).toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Transaction History (Expenses Only) */}
      <section className="mom-section">
        <div className="mom-section-header">
          <Calendar size={16} />
          <h2>Recent Expense Details</h2>
        </div>
        <div className="mom-card no-padding">
          {expenses.length === 0 ? (
            <div className="mom-empty-state" style={{ padding: 32 }}>
              No expenses logged in this period.
            </div>
          ) : (
            <div className="mom-txn-list">
              {expenses.slice(0, 25).map(txn => (
                <div key={txn.id} className="mom-txn-row">
                  <div className="mom-txn-details">
                    <div className="mom-txn-desc">{txn.description}</div>
                    <div className="mom-txn-meta">
                      {format(new Date(txn.date), 'MMM d')} · {txn.timestamp?.toDate ? format(txn.timestamp.toDate(), 'h:mm a') : ''}
                    </div>
                  </div>
                  <div className="mom-txn-amount">
                    -₹{txn.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer warning info */}
      <footer className="mom-dash-footer-text">
        <Heart size={12} className="mom-heart-icon" /> Safe travels! View-only access of expenses.
      </footer>
    </div>
  )
}
