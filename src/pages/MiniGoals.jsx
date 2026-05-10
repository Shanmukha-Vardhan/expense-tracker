import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { addMiniGoal, getMiniGoals, logMiniGoalEarning, deleteMiniGoal, getTransactions } from '../services/firestore'
import { format, addDays, parseISO, differenceInDays } from 'date-fns'
import { Plus, Trash2, TrendingUp, Trophy, Repeat, Target, ArrowLeft, ChevronRight } from 'lucide-react'
import confetti from 'canvas-confetti'

export default function MiniGoals() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeGoalId, setActiveGoalId] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const list = await getMiniGoals(user.uid)
    setGoals(list.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (a.status !== 'active' && b.status === 'active') return 1
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleAdd = async (data) => {
    const ref = await addMiniGoal(user.uid, data)
    setShowAddModal(false)
    await load()
    setActiveGoalId(ref.id)
  }

  const handleDelete = async (id) => {
    if (confirm('Delete this goal?')) {
      await deleteMiniGoal(user.uid, id)
      setActiveGoalId(null)
      load()
    }
  }

  const handleRepeat = (goal) => {
    setShowAddModal({ prefill: { name: goal.name, targetAmount: goal.targetAmount, days: goal.days } })
  }

  const activeGoal = goals.find(g => g.id === activeGoalId)

  if (loading) return <div className="loading-screen" style={{ minHeight: 400 }}><div className="loader" /></div>

  // If a goal is selected, show full-page detail
  if (activeGoal) {
    return <GoalDetailView
      goal={activeGoal}
      user={user}
      onBack={() => setActiveGoalId(null)}
      onDelete={() => handleDelete(activeGoal.id)}
      onRepeat={() => handleRepeat(activeGoal)}
      onRefresh={load}
      allGoals={goals}
    />
  }

  // Otherwise show goal list
  const activeGoals = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Mini Goals</h2>
          <div className="subtitle">Set earning challenges, crush them daily</div>
        </div>
        <button className="action-btn primary" onClick={() => setShowAddModal(true)} id="add-goal-btn">
          <Plus size={16} /> New Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <p>No goals yet. Create a mini earning challenge!</p>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--gray-400)', marginTop: 8 }}>
            Example: "₹5,000 in 5 days" — log daily, watch it grow
          </p>
        </div>
      ) : (
        <>
          {activeGoals.length > 0 && (
            <div className="goals-list-section">
              <h3 className="buckets-heading">🔥 Active Challenges</h3>
              <div className="goals-list">
                {activeGoals.map(goal => <GoalListItem key={goal.id} goal={goal} onClick={() => setActiveGoalId(goal.id)} />)}
              </div>
            </div>
          )}
          {completedGoals.length > 0 && (
            <div className="goals-list-section" style={{ marginTop: 40 }}>
              <h3 className="buckets-heading">🏆 Completed</h3>
              <div className="goals-list">
                {completedGoals.map(goal => <GoalListItem key={goal.id} goal={goal} completed onClick={() => setActiveGoalId(goal.id)} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <AddGoalModal
          onSubmit={handleAdd}
          onClose={() => setShowAddModal(false)}
          prefill={showAddModal?.prefill}
        />
      )}
    </>
  )
}

/* ── Goal List Item (compact row for selection) ── */
function GoalListItem({ goal, completed, onClick }) {
  const logs = goal.dailyLogs || []
  const totalEarned = logs.reduce((s, l) => s + l.amount, 0)
  const pct = goal.targetAmount > 0 ? Math.min((totalEarned / goal.targetAmount) * 100, 100) : 0
  const daysElapsed = Math.max(1, differenceInDays(new Date(), parseISO(goal.startDate)) + 1)
  const daysLeft = Math.max(0, goal.days - daysElapsed)

  return (
    <div className={`goal-list-item ${completed ? 'completed' : ''}`} onClick={onClick}>
      <div className="goal-list-left">
        <div className="goal-list-name">{goal.name}</div>
        <div className="goal-list-meta">
          ₹{totalEarned.toLocaleString('en-IN')} / ₹{goal.targetAmount.toLocaleString('en-IN')}
          {!completed && <span> · {daysLeft}d left</span>}
        </div>
      </div>
      <div className="goal-list-right">
        <div className="goal-list-pct">{pct.toFixed(0)}%</div>
        <div className="goal-list-bar">
          <div className="goal-list-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <ChevronRight size={16} className="goal-list-arrow" />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   FULL-PAGE GOAL DETAIL VIEW
   ══════════════════════════════════════════ */
function GoalDetailView({ goal, user, onBack, onDelete, onRepeat, onRefresh, allGoals }) {
  const [showLogModal, setShowLogModal] = useState(false)
  const [todayIncome, setTodayIncome] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)

  const logs = goal.dailyLogs || []
  const totalEarned = logs.reduce((s, l) => s + l.amount, 0)
  const pct = goal.targetAmount > 0 ? Math.min((totalEarned / goal.targetAmount) * 100, 100) : 0
  const overflow = totalEarned > goal.targetAmount ? totalEarned - goal.targetAmount : 0
  const isComplete = goal.status === 'completed'

  const daysElapsed = Math.max(1, differenceInDays(new Date(), parseISO(goal.startDate)) + 1)
  const daysLeft = Math.max(0, goal.days - daysElapsed)
  const remaining = Math.max(0, goal.targetAmount - totalEarned)
  const dailyTarget = daysLeft > 0 ? remaining / daysLeft : remaining
  const originalDaily = goal.targetAmount / goal.days

  // Best & worst
  const bestDay = logs.length > 0 ? logs.reduce((a, b) => a.amount > b.amount ? a : b) : null
  const worstDay = logs.length > 1 ? logs.reduce((a, b) => a.amount < b.amount ? a : b) : null

  // Comparison with previous same-name completed goal
  const prevGoal = allGoals.find(g => g.name === goal.name && g.id !== goal.id && g.status === 'completed')
  let comparisonText = null
  if (prevGoal) {
    const prevTotal = (prevGoal.dailyLogs || []).reduce((s, l) => s + l.amount, 0)
    const diff = totalEarned - prevTotal
    if (diff > 0) comparisonText = `📈 +₹${diff.toLocaleString('en-IN')} more than last time!`
    else if (diff < 0) comparisonText = `📉 ₹${Math.abs(diff).toLocaleString('en-IN')} less than last time`
  }

  // Fetch today's income from Dashboard transactions
  useEffect(() => {
    if (!user) return
    const today = format(new Date(), 'yyyy-MM-dd')
    getTransactions(user.uid, today, today).then(txns => {
      const incomeToday = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      setTodayIncome(incomeToday)
    })
  }, [user])

  // Auto-sync today's income into the goal
  const handleAutoSync = async () => {
    if (!todayIncome || todayIncome <= 0) return
    const today = format(new Date(), 'yyyy-MM-dd')
    // Check if today already has a log
    const existing = logs.find(l => l.date === today)
    if (existing) {
      if (!confirm(`Today already has ₹${existing.amount.toLocaleString('en-IN')} logged. This will ADD ₹${todayIncome.toLocaleString('en-IN')} from Dashboard income. Continue?`)) return
    }
    setSyncing(true)
    const result = await logMiniGoalEarning(user.uid, goal.id, todayIncome, today)
    if (result?.isComplete && !isComplete) {
      setJustCompleted(true)
      try { confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } }) } catch(e) {}
      setTimeout(() => setJustCompleted(false), 6000)
    }
    await onRefresh()
    setSyncing(false)
  }

  const handleManualLog = async (amount, date) => {
    setShowLogModal(false)
    const result = await logMiniGoalEarning(user.uid, goal.id, amount, date)
    if (result?.isComplete && !isComplete) {
      setJustCompleted(true)
      try { confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } }) } catch(e) {}
      setTimeout(() => setJustCompleted(false), 6000)
    }
    await onRefresh()
  }

  // Build day rows
  const dayRows = []
  for (let i = 0; i < goal.days; i++) {
    const dayDate = format(addDays(parseISO(goal.startDate), i), 'yyyy-MM-dd')
    const dayLabel = format(addDays(parseISO(goal.startDate), i), 'MMM d')
    const log = logs.find(l => l.date === dayDate)
    const earned = log?.amount || 0
    const dayPct = goal.targetAmount > 0 ? (earned / goal.targetAmount) * 100 : 0
    const isToday = dayDate === format(new Date(), 'yyyy-MM-dd')
    const isBest = log && bestDay && log.date === bestDay.date && logs.length > 1
    const isWorst = log && worstDay && log.date === worstDay.date && logs.length > 1 && bestDay?.date !== worstDay?.date
    dayRows.push({ dayNum: i + 1, date: dayDate, dayLabel, earned, dayPct, isToday, isBest, isWorst, hasLog: !!log })
  }

  // Cumulative running total per day
  let runningTotal = 0
  dayRows.forEach(row => {
    runningTotal += row.earned
    row.runningTotal = runningTotal
    row.cumulativePct = goal.targetAmount > 0 ? Math.min((runningTotal / goal.targetAmount) * 100, 100) : 0
  })

  // Milestone
  const milestones = [
    { pct: 25, msg: 'Quarter way! 💪' },
    { pct: 50, msg: 'Halfway there! 🔥' },
    { pct: 75, msg: 'Almost there! 🚀' },
    { pct: 100, msg: 'GOAL CRUSHED! 🎉' }
  ]
  const currentMilestone = [...milestones].reverse().find(m => pct >= m.pct)

  return (
    <div className="goal-detail-page">
      {/* Header */}
      <div className="goal-detail-header">
        <button className="goal-back-btn" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <div className="goal-detail-actions">
          {isComplete && <button className="goal-action-pill" onClick={onRepeat}><Repeat size={14} /> Repeat</button>}
          <button className="goal-action-pill danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      {/* Celebration Banner */}
      {(justCompleted || isComplete) && (
        <div className={`goal-complete-banner ${justCompleted ? 'celebrating' : ''}`}>
          <Trophy size={24} />
          <div>
            <div className="goal-complete-title">{justCompleted ? '🎉 GOAL CRUSHED!' : '✅ Challenge Complete'}</div>
            {overflow > 0 && <div className="goal-complete-overflow">🌟 ₹{overflow.toLocaleString('en-IN')} BONUS beyond target!</div>}
          </div>
        </div>
      )}

      {/* Title + Big Stats */}
      <div className="goal-detail-title">{goal.name}</div>
      <div className="goal-detail-subtitle">{goal.days} day challenge · Started {format(parseISO(goal.startDate), 'MMM d, yyyy')}</div>

      {/* Big Progress Section */}
      <div className="goal-big-progress">
        <div className="goal-big-numbers">
          <div className="goal-big-earned">
            <span className="currency">₹</span>{totalEarned.toLocaleString('en-IN')}
          </div>
          <div className="goal-big-of">of ₹{goal.targetAmount.toLocaleString('en-IN')}</div>
        </div>
        <div className="goal-big-pct-ring">
          <svg viewBox="0 0 100 100" className="goal-ring-svg">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f0f0f0" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#000" strokeWidth="8"
              strokeDasharray={`${pct * 2.64} 264`} strokeLinecap="round"
              transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div className="goal-ring-text">{pct.toFixed(0)}%</div>
        </div>
      </div>

      {/* Progress Bar Full Width */}
      <div className="goal-full-progress-track">
        <div className="goal-full-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Quick Stats Row */}
      <div className="goal-detail-stats">
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Remaining</div>
          <div className="goal-stat-value">₹{remaining.toLocaleString('en-IN')}</div>
        </div>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Days Left</div>
          <div className="goal-stat-value">{isComplete ? '—' : daysLeft}</div>
        </div>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Daily Target</div>
          <div className="goal-stat-value">
            ₹{isComplete ? '—' : dailyTarget.toFixed(0)}
            {!isComplete && dailyTarget > originalDaily && <span className="goal-warning"> ↑</span>}
            {!isComplete && dailyTarget < originalDaily && <span className="goal-ahead"> ↓</span>}
          </div>
        </div>
        <div className="goal-detail-stat">
          <div className="goal-stat-label">Avg / Day</div>
          <div className="goal-stat-value">₹{logs.length > 0 ? (totalEarned / logs.length).toFixed(0) : '0'}</div>
        </div>
      </div>

      {/* Milestone */}
      {currentMilestone && !isComplete && pct < 100 && (
        <div className="goal-milestone-banner">{currentMilestone.msg}</div>
      )}

      {/* Comparison */}
      {comparisonText && <div className="goal-comparison-banner">{comparisonText}</div>}

      {/* Auto-sync from Dashboard */}
      {!isComplete && todayIncome !== null && todayIncome > 0 && (
        <div className="goal-autosync-bar">
          <div className="goal-autosync-info">
            <div className="goal-autosync-label">Today's Dashboard Income</div>
            <div className="goal-autosync-amount">₹{todayIncome.toLocaleString('en-IN')}</div>
          </div>
          <button className="goal-autosync-btn" onClick={handleAutoSync} disabled={syncing}>
            {syncing ? 'Syncing...' : '⚡ Auto-Sync'}
          </button>
        </div>
      )}

      {/* Day-by-Day Breakdown */}
      <div className="goal-days-section">
        <h3 className="goal-days-title">Day-by-Day Breakdown</h3>
        <div className="goal-days-list">
          {dayRows.map(row => (
            <div key={row.dayNum} className={`goal-day-row ${row.isToday ? 'today' : ''} ${row.hasLog ? 'logged' : ''} ${row.isBest ? 'best' : ''} ${row.isWorst ? 'worst' : ''}`}>
              <div className="goal-day-left">
                <div className="goal-day-square">
                  {row.hasLog ? (
                    <div className="goal-day-square-fill" style={{ height: `${Math.min(row.dayPct * 4, 100)}%` }} />
                  ) : (
                    <div className="goal-day-square-empty" />
                  )}
                </div>
                <div className="goal-day-info">
                  <div className="goal-day-label">
                    Day {row.dayNum}
                    {row.isToday && <span className="goal-today-tag">TODAY</span>}
                    {row.isBest && <span className="goal-badge-tag best">🏆 BEST</span>}
                    {row.isWorst && <span className="goal-badge-tag worst">📉</span>}
                  </div>
                  <div className="goal-day-date">{row.dayLabel}</div>
                </div>
              </div>
              <div className="goal-day-line" />
              <div className="goal-day-right">
                {row.hasLog ? (
                  <>
                    <div className="goal-day-amount">₹{row.earned.toLocaleString('en-IN')}</div>
                    <div className="goal-day-cumulative">Total: ₹{row.runningTotal.toLocaleString('en-IN')} ({row.cumulativePct.toFixed(0)}%)</div>
                  </>
                ) : (
                  <div className="goal-day-empty-text">{row.isToday ? 'Waiting for log...' : '—'}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Earning Button */}
      {!isComplete && (
        <button className="goal-add-earning-btn" onClick={() => setShowLogModal(true)} id="log-earning-btn">
          <Plus size={20} /> Log Earning
        </button>
      )}

      {showLogModal && <LogEarningModal goal={goal} onLog={handleManualLog} onClose={() => setShowLogModal(false)} />}
    </div>
  )
}

/* ── Add Goal Modal ── */
function AddGoalModal({ onSubmit, onClose, prefill }) {
  const [name, setName] = useState(prefill?.name || '')
  const [targetAmount, setTargetAmount] = useState(prefill?.targetAmount?.toString() || '')
  const [days, setDays] = useState(prefill?.days?.toString() || '')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [submitting, setSubmitting] = useState(false)

  const dailyTarget = (parseFloat(targetAmount) || 0) / (parseInt(days) || 1)
  const endDate = parseInt(days) ? format(addDays(parseISO(startDate), parseInt(days) - 1), 'MMM d, yyyy') : '—'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !parseFloat(targetAmount) || !parseInt(days)) return
    setSubmitting(true)
    await onSubmit({ name: name.trim(), targetAmount: parseFloat(targetAmount), days: parseInt(days), startDate })
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>🎯 New Mini Goal</h3>
        <div className="form-group">
          <label>Goal Name</label>
          <input type="text" placeholder="Weekend Grind, Rapido Challenge..." value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Target Amount (₹)</label>
            <input type="number" placeholder="5000" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} min="1" />
          </div>
          <div className="form-group">
            <label>Duration (Days)</label>
            <input type="number" placeholder="5" value={days} onChange={e => setDays(e.target.value)} min="1" max="365" />
          </div>
        </div>
        <div className="form-group">
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>

        {parseFloat(targetAmount) > 0 && parseInt(days) > 0 && (
          <div className="emi-preview">
            <div>Daily Target: <strong>₹{dailyTarget.toFixed(0)}/day</strong></div>
            <div>Ends: <strong>{endDate}</strong></div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!name.trim() || !parseFloat(targetAmount) || !parseInt(days) || submitting}>
            {submitting ? 'Creating...' : 'Start Challenge'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Log Earning Modal ── */
function LogEarningModal({ goal, onLog, onClose }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const totalSoFar = (goal.dailyLogs || []).reduce((s, l) => s + l.amount, 0)
  const afterLog = totalSoFar + (parseFloat(amount) || 0)
  const pctAfter = goal.targetAmount > 0 ? Math.min((afterLog / goal.targetAmount) * 100, 100) : 0
  const willComplete = afterLog >= goal.targetAmount

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>💰 Log Earning — {goal.name}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Amount Earned (₹)</label>
            <input type="number" placeholder="800" value={amount} onChange={e => setAmount(e.target.value)} min="1" autoFocus />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {parseFloat(amount) > 0 && (
          <div className="emi-preview">
            <div>After this: ₹{afterLog.toLocaleString('en-IN')} / ₹{goal.targetAmount.toLocaleString('en-IN')} ({pctAfter.toFixed(0)}%)</div>
            {willComplete && <div style={{ color: '#1e8e3e', fontWeight: 700, marginTop: 4 }}>🎉 This will complete the goal!</div>}
          </div>
        )}

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="submit-btn" onClick={() => onLog(parseFloat(amount), date)}
            disabled={!parseFloat(amount)}>
            <TrendingUp size={14} /> Log It
          </button>
        </div>
      </div>
    </div>
  )
}
