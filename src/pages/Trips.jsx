import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  addTrip,
  getTrips,
  getTrip,
  addTripExpense,
  addTripIncome,
  deleteTripEntry,
  topUpTrip,
  completeTrip,
  deleteTrip
} from '../services/firestore'
import { format, addDays, parseISO, differenceInDays } from 'date-fns'
import { Plus, Trash2, ArrowLeft, ChevronRight, Calendar, Compass, PieChart, Landmark, TrendingUp } from 'lucide-react'
import confetti from 'canvas-confetti'

const CATEGORY_MAP = {
  food: { label: 'Food & Drinks', emoji: '🍔', color: '#ea580c' },
  fuel: { label: 'Fuel / Transport', emoji: '⛽', color: '#0284c7' },
  stay: { label: 'Stay / Hotel', emoji: '🏨', color: '#16a34a' },
  activities: { label: 'Activities / Tickets', emoji: '🎟️', color: '#7c3aed' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: '#db2777' },
  misc: { label: 'Emergency / Misc', emoji: '💊', color: '#4b5563' }
}

export default function Trips() {
  const { user } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeTripId, setActiveTripId] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const list = await getTrips(user.uid)
    // Sort active first, then upcoming (startDate order), then completed (createdAt order desc)
    const nowStr = format(new Date(), 'yyyy-MM-dd')
    setTrips(list.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1
      if (a.status !== 'completed' && b.status === 'completed') return -1

      // Dynamic check for active vs upcoming
      const aUpcoming = a.startDate > nowStr
      const bUpcoming = b.startDate > nowStr
      if (aUpcoming && !bUpcoming) return 1
      if (!aUpcoming && bUpcoming) return -1

      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleAdd = async (data) => {
    const ref = await addTrip(user.uid, data)
    setShowAddModal(false)
    await load()
    setActiveTripId(ref.id)
  }

  const handleDelete = async (id) => {
    if (confirm('Delete this trip entire data?')) {
      await deleteTrip(user.uid, id)
      setActiveTripId(null)
      load()
    }
  }

  const activeTrip = trips.find(t => t.id === activeTripId)

  if (loading) return <div className="loading-screen" style={{ minHeight: 400 }}><div className="loader" /></div>

  if (activeTrip) {
    return <TripDetailView
      trip={activeTrip}
      user={user}
      onBack={() => setActiveTripId(null)}
      onDelete={() => handleDelete(activeTrip.id)}
      onRefresh={load}
    />
  }

  const nowStr = format(new Date(), 'yyyy-MM-dd')
  const activeTrips = trips.filter(t => t.status === 'active' && t.startDate <= nowStr)
  const upcomingTrips = trips.filter(t => t.status === 'active' && t.startDate > nowStr)
  const completedTrips = trips.filter(t => t.status === 'completed')

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Trip Tracker</h2>
          <div className="subtitle">Track budgets, logging expenses on the go</div>
        </div>
        <button className="action-btn primary" onClick={() => setShowAddModal(true)} id="add-trip-btn">
          <Plus size={16} /> New Trip
        </button>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧳</div>
          <p>No trips tracked yet. Planning to go somewhere?</p>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--gray-400)', marginTop: 8 }}>
            Keep a dedicated budget container and log all expenses day-by-day.
          </p>
        </div>
      ) : (
        <>
          {activeTrips.length > 0 && (
            <div className="goals-list-section">
              <h3 className="buckets-heading">🟢 Active Trips</h3>
              <div className="goals-list">
                {activeTrips.map(trip => <TripListItem key={trip.id} trip={trip} onClick={() => setActiveTripId(trip.id)} />)}
              </div>
            </div>
          )}

          {upcomingTrips.length > 0 && (
            <div className="goals-list-section" style={{ marginTop: 24 }}>
              <h3 className="buckets-heading">🟡 Upcoming Journeys</h3>
              <div className="goals-list">
                {upcomingTrips.map(trip => <TripListItem key={trip.id} trip={trip} upcoming onClick={() => setActiveTripId(trip.id)} />)}
              </div>
            </div>
          )}

          {completedTrips.length > 0 && (
            <div className="goals-list-section" style={{ marginTop: 40 }}>
              <h3 className="buckets-heading">📸 Trip Memories (Completed)</h3>
              <div className="goals-list">
                {completedTrips.map(trip => <TripListItem key={trip.id} trip={trip} completed onClick={() => setActiveTripId(trip.id)} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <AddTripModal
          onSubmit={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}

/* ── Trip ListItem (List Row Card) ── */
function TripListItem({ trip, completed, upcoming, onClick }) {
  const expenses = trip.expenses || []
  const income = trip.income || []
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0) - income.reduce((s, i) => s + i.amount, 0)
  const budget = trip.totalBudget || trip.originalBudget || 1
  const pct = Math.min((totalSpent / budget) * 100, 100)

  const dateText = `${format(parseISO(trip.startDate), 'MMM d')} - ${format(parseISO(trip.endDate), 'MMM d, yyyy')}`

  return (
    <div className={`goal-list-item ${completed ? 'completed' : ''} ${upcoming ? 'upcoming' : ''}`} onClick={onClick}>
      <div className="goal-list-left">
        <div className="goal-list-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{trip.name}</span>
          {completed && <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>📸 Saved Memory</span>}
        </div>
        <div className="goal-list-meta">
          {dateText}
          {completed ? (
             <span> · Total Spent: ₹{totalSpent.toLocaleString('en-IN')}</span>
          ) : (
             <span> · ₹{totalSpent.toLocaleString('en-IN')} spent of ₹{budget.toLocaleString('en-IN')}</span>
          )}
        </div>
      </div>
      <div className="goal-list-right">
        {!completed ? (
          <>
            <div className="goal-list-pct">{pct.toFixed(0)}%</div>
            <div className="goal-list-bar">
              <div className="goal-list-bar-fill" style={{ width: `${pct}%`, background: pct > 75 ? '#dc2626' : pct > 50 ? '#d97706' : '#000' }} />
            </div>
          </>
        ) : (
          <div className="trip-memory-indicator" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--gray-500)' }}>
            <span>Vault</span>
            <Compass size={14} />
          </div>
        )}
        <ChevronRight size={16} className="goal-list-arrow" />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   FULL-PAGE TRIP DETAIL VIEW
   ══════════════════════════════════════════ */
function TripDetailView({ trip, user, onBack, onDelete, onRefresh }) {
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showTopUpModal, setShowTopUpModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const expenses = trip.expenses || []
  const income = trip.income || []
  const topUps = trip.topUps || []

  // Math totals
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalIncome = income.reduce((s, i) => s + i.amount, 0)
  const totalSpent = Math.max(0, totalExpenses - totalIncome)

  const budget = trip.totalBudget || trip.originalBudget || 0
  const remaining = Math.max(0, budget - totalSpent)
  const pct = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0

  // Date Logic
  const startD = parseISO(trip.startDate)
  const endD = parseISO(trip.endDate)
  const totalTripDays = Math.max(1, differenceInDays(endD, startD) + 1)
  const daysElapsed = Math.max(1, differenceInDays(new Date(), startD) + 1)
  const daysLeft = Math.max(0, totalTripDays - daysElapsed)
  const isCompleted = trip.status === 'completed'

  // Daily budget calculations
  // suggest: remaining budget / days remaining (or 1 if 0)
  const dailyTarget = !isCompleted && daysLeft > 0 ? remaining / daysLeft : remaining / totalTripDays
  const avgDailySpend = totalSpent / (isCompleted ? totalTripDays : Math.min(daysElapsed, totalTripDays))

  // Find highest single expense
  const highestExpense = expenses.length > 0
    ? expenses.reduce((prev, curr) => prev.amount > curr.amount ? prev : curr)
    : null

  // Category summary array
  const categorySummary = Object.keys(CATEGORY_MAP).map(key => {
    const total = expenses.filter(e => e.category === key).reduce((s, e) => s + e.amount, 0)
    return { key, total, ...CATEGORY_MAP[key] }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  // Auto-group entries by day
  const dayRows = []
  for (let i = 0; i < totalTripDays; i++) {
    const dayDate = format(addDays(startD, i), 'yyyy-MM-dd')
    const dayLabel = format(addDays(startD, i), 'MMM d')
    const dayNum = i + 1

    const dayExpenses = expenses.filter(e => e.date === dayDate)
    const dayIncome = income.filter(inVal => inVal.date === dayDate)
    const daySpent = dayExpenses.reduce((s, e) => s + e.amount, 0) - dayIncome.reduce((s, inVal) => s + inVal.amount, 0)

    const isToday = dayDate === format(new Date(), 'yyyy-MM-dd')

    dayRows.push({
      dayNum,
      dayLabel,
      date: dayDate,
      daySpent,
      items: [
        ...dayExpenses.map(e => ({ ...e, type: 'expense' })),
        ...dayIncome.map(inVal => ({ ...inVal, type: 'income' }))
      ].sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds),
      isToday
    })
  }

  // Handlers
  const handleAddExpense = async (data) => {
    setSubmitting(true)
    await addTripExpense(user.uid, trip.id, data)
    await onRefresh()
    setShowExpenseModal(false)
    setSubmitting(false)
  }

  const handleAddIncome = async (data) => {
    setSubmitting(true)
    await addTripIncome(user.uid, trip.id, data)
    await onRefresh()
    setShowIncomeModal(false)
    setSubmitting(false)
  }

  const handleTopUp = async (amount, note, date) => {
    setSubmitting(true)
    await topUpTrip(user.uid, trip.id, amount, note, date)
    await onRefresh()
    setShowTopUpModal(false)
    setSubmitting(false)
  }

  const handleComplete = async () => {
    if (confirm('Mark this trip as completed and archive it in the Vault?')) {
      await completeTrip(user.uid, trip.id)
      try { confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } }) } catch(e) {}
      await onRefresh()
    }
  }

  const handleDeleteEntry = async (entryId, type) => {
    if (confirm('Delete this entry?')) {
      await deleteTripEntry(user.uid, trip.id, entryId, type)
      await onRefresh()
    }
  }

  // Get burn zone style
  const getBurnZoneClass = () => {
    if (pct >= 85) return 'critical'
    if (pct >= 60) return 'warning'
    return 'good'
  }

  return (
    <div className="goal-detail-page trip-detail-page">
      {/* Header */}
      <div className="goal-detail-header">
        <button className="goal-back-btn" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <div className="goal-detail-actions" style={{ display: 'flex', gap: 8 }}>
          {!isCompleted && (
            <>
              <button className="goal-action-pill" style={{ background: '#e0f2fe', color: '#0369a1' }} onClick={() => setShowTopUpModal(true)}>💸 Top Up</button>
              <button className="goal-action-pill" style={{ background: '#f0fdf4', color: '#166534' }} onClick={handleComplete}>✅ Archive Trip</button>
            </>
          )}
          <button className="goal-action-pill danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      {/* Main Trip Card info */}
      <div className="goal-detail-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>{trip.name}</span>
        <span className={`trip-status-badge ${trip.status}`}>{trip.status === 'completed' ? 'Vaulted' : 'Active'}</span>
      </div>
      <div className="goal-detail-subtitle">
        <Calendar size={13} style={{ marginRight: 4, display: 'inline' }} />
        {format(startD, 'MMM d, yyyy')} - {format(endD, 'MMM d, yyyy')} ({totalTripDays} days)
      </div>

      {/* Burn Rate and Budget container */}
      <div className="trip-budget-dashboard anim-section anim-in" style={{ '--anim-order': 1 }}>
        <div className="trip-budget-header">
          <div className="trip-budget-spent">
            <span>₹{totalSpent.toLocaleString('en-IN')}</span> spent
          </div>
          <div className="trip-budget-limit">
            of <span>₹{budget.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Multi-zone burn tracker bar */}
        <div className="trip-burn-track">
          <div className={`trip-burn-fill ${getBurnZoneClass()}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="trip-burn-bar-legend" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--gray-500)' }}>
          <span>Spent: {pct.toFixed(0)}%</span>
          {topUps.length > 0 && (
            <span className="trip-topup-badge">
              Base: ₹{trip.originalBudget.toLocaleString('en-IN')} + Top Ups: ₹{(budget - trip.originalBudget).toLocaleString('en-IN')}
            </span>
          )}
          <span>Remaining: ₹{remaining.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="goal-detail-stats anim-section anim-in" style={{ '--anim-order': 2 }}>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Remaining</div>
          <div className="goal-stat-value">₹{remaining.toLocaleString('en-IN')}</div>
        </div>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Days Left</div>
          <div className="goal-stat-value">{isCompleted ? 'Finished' : daysLeft}</div>
        </div>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">{isCompleted ? 'Target Avg' : 'Suggested Daily'}</div>
          <div className="goal-stat-value">₹{Math.max(0, dailyTarget).toFixed(0)}</div>
        </div>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Actual Avg/Day</div>
          <div className="goal-stat-value">₹{avgDailySpend.toFixed(0)}</div>
        </div>
      </div>

      {/* Trip Completed Summary Block */}
      {isCompleted && (
        <div className="trip-summary-card anim-section anim-in" style={{ '--anim-order': 3 }}>
          <div className="trip-summary-header">
            <h4>📊 Trip Summary & Insights</h4>
            <span className="trip-memorial-emoji">🎬</span>
          </div>
          <div className="trip-summary-content">
            <div className="trip-summary-row">
              <span>Total Travel Budget:</span>
              <strong>₹{budget.toLocaleString('en-IN')}</strong>
            </div>
            <div className="trip-summary-row">
              <span>Total Actual Spend:</span>
              <strong style={{ color: totalSpent > budget ? '#dc2626' : '#16a34a' }}>₹{totalSpent.toLocaleString('en-IN')}</strong>
            </div>
            <div className="trip-summary-row">
              <span>Net Savings:</span>
              <strong style={{ color: remaining > 0 ? '#16a34a' : 'inherit' }}>
                {remaining > 0 ? `₹${remaining.toLocaleString('en-IN')} saved!` : `₹${Math.abs(budget - totalSpent).toLocaleString('en-IN')} overbudget`}
              </strong>
            </div>
            <div className="trip-summary-row">
              <span>Avg Daily Outflow:</span>
              <strong>₹{avgDailySpend.toFixed(0)} / day</strong>
            </div>
            {highestExpense && (
              <div className="trip-summary-row highest-spend">
                <span>Highest Single Spend:</span>
                <strong>
                  {CATEGORY_MAP[highestExpense.category]?.emoji} {highestExpense.description} (₹{highestExpense.amount})
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category breakdown pie bar */}
      {categorySummary.length > 0 && (
        <div className="goal-days-section anim-section anim-in" style={{ '--anim-order': 4 }}>
          <h3 className="goal-days-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PieChart size={16} /> Category Breakdown
          </h3>
          <div className="trip-categories-container" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: '#fcfcfc', borderRadius: 12, border: '1px solid #f0f0f0' }}>
            {categorySummary.map(cat => {
              const catPct = (cat.total / totalExpenses) * 100
              return (
                <div key={cat.key} className="trip-category-row" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{cat.emoji}</span>
                      <span>{cat.label}</span>
                    </div>
                    <div>₹{cat.total.toLocaleString('en-IN')} <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>({catPct.toFixed(0)}%)</span></div>
                  </div>
                  <div className="trip-cat-bar" style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${catPct}%`, background: cat.color, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Day-by-Day expense breakdown logs */}
      <div className="goal-days-section anim-section anim-in" style={{ '--anim-order': 5 }}>
        <h3 className="goal-days-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Landmark size={16} /> Day-by-Day Log
        </h3>
        <div className="goal-days-list">
          {dayRows.map(row => (
            <div key={row.dayNum} className={`goal-day-row ${row.isToday && !isCompleted ? 'today' : ''}`} style={{ paddingBottom: 16 }}>
              <div className="goal-day-left" style={{ alignSelf: 'flex-start' }}>
                <div className="goal-day-square">
                  <div className="goal-day-square-fill" style={{ height: row.daySpent > 0 ? '100%' : '0%', background: '#000' }} />
                </div>
                <div className="goal-day-info">
                  <div className="goal-day-label">
                    Day {row.dayNum}
                    {row.isToday && !isCompleted && <span className="goal-today-tag">TODAY</span>}
                  </div>
                  <div className="goal-day-date">{row.dayLabel}</div>
                </div>
              </div>
              <div className="goal-day-line" />
              <div className="goal-day-right" style={{ flex: 1, paddingLeft: 12 }}>
                <div className="day-total-spent-row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  <span>Outflow:</span>
                  <span style={{ color: row.daySpent > 0 ? '#dc2626' : row.daySpent < 0 ? '#16a34a' : 'inherit' }}>
                    {row.daySpent > 0 ? `₹${row.daySpent.toLocaleString('en-IN')}` : row.daySpent < 0 ? `-₹${Math.abs(row.daySpent).toLocaleString('en-IN')}` : '₹0'}
                  </span>
                </div>
                {row.items.length > 0 ? (
                  <div className="day-entries-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {row.items.map(item => (
                      <div key={item.id} className="trip-item-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '8px 10px', background: '#f9fafb', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{item.type === 'expense' ? CATEGORY_MAP[item.category]?.emoji : '💰'}</span>
                          <div>
                            <div style={{ fontWeight: 500 }}>{item.description}</div>
                            {item.type === 'income' && <div style={{ fontSize: 10, color: '#16a34a' }}>Refund/Refunded</div>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, color: item.type === 'expense' ? '#dc2626' : '#16a34a' }}>
                            {item.type === 'expense' ? '−' : '+'}₹{item.amount.toLocaleString('en-IN')}
                          </span>
                          {!isCompleted && (
                            <button
                              onClick={() => handleDeleteEntry(item.id, item.type)}
                              style={{ border: 'none', background: 'none', color: 'var(--gray-400)', cursor: 'pointer', padding: 2 }}
                              className="delete-item-cross"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="goal-day-empty-text">No logging entries</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fixed bottom controls */}
      {!isCompleted && (
        <div className="goal-add-earning-btn-wrap" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, zIndex: 100 }}>
          <button className="goal-add-earning-btn" style={{ position: 'static', transform: 'none' }} onClick={() => setShowExpenseModal(true)} id="log-trip-expense-btn">
            <Plus size={18} /> Add Expense
          </button>
          <button className="goal-add-earning-btn" style={{ position: 'static', transform: 'none', background: '#f5f5f5', color: '#000', border: '1px solid #e0e0e0' }} onClick={() => setShowIncomeModal(true)} id="log-trip-income-btn">
            <Plus size={18} /> Add Refund
          </button>
        </div>
      )}

      {/* Modals */}
      {showExpenseModal && (
        <AddExpenseModal
          onSubmit={handleAddExpense}
          onClose={() => setShowExpenseModal(false)}
          days={dayRows}
          submitting={submitting}
        />
      )}

      {showIncomeModal && (
        <AddIncomeModal
          onSubmit={handleAddIncome}
          onClose={() => setShowIncomeModal(false)}
          days={dayRows}
          submitting={submitting}
        />
      )}

      {showTopUpModal && (
        <TopUpModal
          onSubmit={handleTopUp}
          onClose={() => setShowTopUpModal(false)}
          submitting={submitting}
        />
      )}
    </div>
  )
}

/* ── Add Trip Modal ── */
function AddTripModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [originalBudget, setOriginalBudget] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 4), 'yyyy-MM-dd'))
  const [submitting, setSubmitting] = useState(false)

  const sD = parseISO(startDate)
  const eD = parseISO(endDate)
  const daysTotal = Math.max(1, differenceInDays(eD, sD) + 1)
  const limitPreview = (Number(originalBudget) || 0) / daysTotal

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !Number(originalBudget) || daysTotal <= 0) return
    setSubmitting(true)
    await onSubmit({ name: name.trim(), originalBudget: Number(originalBudget), startDate, endDate })
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>🧳 Setup New Trip</h3>
        <div className="form-group">
          <label>Trip Destination / Name</label>
          <input type="text" placeholder="Goa Roadtrip, Munnar Staycation..." value={name} onChange={e => setName(e.target.value)} autoFocus required />
        </div>
        <div className="form-group">
          <label>Total Budget Allocation (₹)</label>
          <input type="number" placeholder="10000" value={originalBudget} onChange={e => setOriginalBudget(e.target.value)} min="1" required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
          </div>
        </div>

        {Number(originalBudget) > 0 && daysTotal > 0 && (
          <div className="emi-preview">
            <div>Duration: <strong>{daysTotal} Days</strong></div>
            <div>Suggested limit: <strong>₹{limitPreview.toFixed(0)}/day</strong></div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!name.trim() || !Number(originalBudget) || submitting}>
            {submitting ? 'Creating...' : 'Let\'s Go! 🚀'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Add Expense Modal ── */
function AddExpenseModal({ onSubmit, onClose, days, submitting }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('food')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!Number(amount) || !description.trim()) return
    onSubmit({ amount: Number(amount), description: description.trim(), category, date })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>💸 Log Expense</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Amount (₹)</label>
            <input type="number" placeholder="250" value={amount} onChange={e => setAmount(e.target.value)} min="1" autoFocus required />
          </div>
          <div className="form-group">
            <label>Date</label>
            <select value={date} onChange={e => setDate(e.target.value)} required>
              {days.map(d => (
                <option key={d.date} value={d.date}>{d.dayLabel} ({d.isToday ? 'Today' : d.dayNum})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>What did you spend on?</label>
          <input type="text" placeholder="Highway lunch, petrol, entry pass..." value={description} onChange={e => setDescription(e.target.value)} required />
        </div>

        <div className="form-group">
          <label>Category</label>
          <div className="category-emoji-picker" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
            {Object.keys(CATEGORY_MAP).map(key => {
              const cat = CATEGORY_MAP[key]
              const isSelected = category === key
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setCategory(key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '8px 4px',
                    borderRadius: 8,
                    border: isSelected ? '1.5px solid #000' : '1px solid #e5e7eb',
                    background: isSelected ? '#f9fafb' : '#fff',
                    fontWeight: isSelected ? '600' : '400',
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!Number(amount) || !description.trim() || submitting}>
            {submitting ? 'Adding...' : 'Log Spend'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Add Income Modal ── */
function AddIncomeModal({ onSubmit, onClose, days, submitting }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!Number(amount) || !description.trim()) return
    onSubmit({ amount: Number(amount), description: description.trim(), date })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>💰 Log Refund / Contribution</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Amount (₹)</label>
            <input type="number" placeholder="500" value={amount} onChange={e => setAmount(e.target.value)} min="1" autoFocus required />
          </div>
          <div className="form-group">
            <label>Date</label>
            <select value={date} onChange={e => setDate(e.target.value)} required>
              {days.map(d => (
                <option key={d.date} value={d.date}>{d.dayLabel} ({d.isToday ? 'Today' : d.dayNum})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Source / Description</label>
          <input type="text" placeholder="Friend paid back, hotel discount..." value={description} onChange={e => setDescription(e.target.value)} required />
        </div>

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!Number(amount) || !description.trim() || submitting}>
            {submitting ? 'Adding...' : 'Log Refund'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Top Up Modal ── */
function TopUpModal({ onSubmit, onClose, submitting }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!Number(amount)) return
    onSubmit(Number(amount), note.trim())
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>💸 Top Up Trip Budget</h3>
        <div className="form-group">
          <label>Top Up Amount (₹)</label>
          <input type="number" placeholder="2000" value={amount} onChange={e => setAmount(e.target.value)} min="1" autoFocus required />
        </div>
        <div className="form-group">
          <label>Reason / Note</label>
          <input type="text" placeholder="Emergency ATM cash withdrawal, extended stay..." value={note} onChange={e => setNote(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!Number(amount) || submitting}>
            {submitting ? 'Updating...' : 'Add to Budget'}
          </button>
        </div>
      </form>
    </div>
  )
}
