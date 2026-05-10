import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { addMiniGoal, getMiniGoals, logMiniGoalEarning, deleteMiniGoal } from '../services/firestore'
import { format, addDays, parseISO, differenceInDays } from 'date-fns'
import { Plus, Trash2, TrendingUp, Trophy, Repeat, Target } from 'lucide-react'
import confetti from 'canvas-confetti'

const MILESTONES = [
  { pct: 25, msg: 'Quarter way there! 💪', emoji: '💪' },
  { pct: 50, msg: 'Halfway! Keep pushing 🔥', emoji: '🔥' },
  { pct: 75, msg: 'Almost there! Don\'t stop 🚀', emoji: '🚀' },
  { pct: 100, msg: 'GOAL CRUSHED! 🎉', emoji: '🎉' }
]

export default function MiniGoals() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLogModal, setShowLogModal] = useState(null)
  const [justCompleted, setJustCompleted] = useState(null)

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
    await addMiniGoal(user.uid, data)
    setShowAddModal(false)
    load()
  }

  const handleLog = async (goalId, amount, date) => {
    const result = await logMiniGoalEarning(user.uid, goalId, amount, date)
    setShowLogModal(null)
    if (result?.isComplete) {
      setJustCompleted(goalId)
      try { confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } }) } catch(e) {}
      setTimeout(() => setJustCompleted(null), 6000)
    }
    load()
  }

  const handleDelete = async (id) => {
    if (confirm('Delete this goal?')) {
      await deleteMiniGoal(user.uid, id)
      load()
    }
  }

  const handleRepeat = (goal) => {
    setShowAddModal({ prefill: { name: goal.name, targetAmount: goal.targetAmount, days: goal.days } })
  }

  const activeGoals = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')

  // Find previous completed goal with same name for comparison
  const findPrevGoal = (goal) => {
    return completedGoals.find(g => g.name === goal.name && g.id !== goal.id)
  }

  if (loading) return <div className="loading-screen" style={{ minHeight: 400 }}><div className="loader" /></div>

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Mini Goals</h2>
          <div className="subtitle">Set earning challenges, track daily progress</div>
        </div>
        <button className="action-btn primary" onClick={() => setShowAddModal(true)} id="add-goal-btn">
          <Plus size={16} /> New Goal
        </button>
      </div>

      {activeGoals.length === 0 && completedGoals.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <p>No goals yet. Create a mini earning challenge to get started!</p>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--gray-400)' }}>Example: "₹5,000 in 5 days"</p>
        </div>
      ) : (
        <>
          {/* Active Goals */}
          {activeGoals.length > 0 && (
            <>
              <h3 className="buckets-heading">Active Challenges</h3>
              <div className="goals-grid">
                {activeGoals.map(goal => (
                  <GoalCard key={goal.id} goal={goal} prevGoal={findPrevGoal(goal)}
                    justCompleted={justCompleted === goal.id}
                    onLog={() => setShowLogModal(goal)}
                    onDelete={() => handleDelete(goal.id)} />
                ))}
              </div>
            </>
          )}

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <>
              <h3 className="buckets-heading" style={{ marginTop: 48 }}>🏆 Completed Challenges</h3>
              <div className="goals-grid">
                {completedGoals.map(goal => (
                  <GoalCard key={goal.id} goal={goal} completed
                    onDelete={() => handleDelete(goal.id)}
                    onRepeat={() => handleRepeat(goal)} />
                ))}
              </div>
            </>
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
      {showLogModal && <LogEarningModal goal={showLogModal} onLog={handleLog} onClose={() => setShowLogModal(null)} />}
    </>
  )
}

/* ── Goal Card ── */
function GoalCard({ goal, completed, justCompleted, prevGoal, onLog, onDelete, onRepeat }) {
  const logs = goal.dailyLogs || []
  const totalEarned = logs.reduce((s, l) => s + l.amount, 0)
  const pct = goal.targetAmount > 0 ? Math.min((totalEarned / goal.targetAmount) * 100, 100) : 0
  const overflow = totalEarned > goal.targetAmount ? totalEarned - goal.targetAmount : 0

  const daysElapsed = Math.max(1, differenceInDays(new Date(), parseISO(goal.startDate)) + 1)
  const daysLeft = Math.max(0, goal.days - daysElapsed)
  const remaining = Math.max(0, goal.targetAmount - totalEarned)
  const dailyTarget = daysLeft > 0 ? (remaining / daysLeft) : remaining
  const originalDaily = goal.targetAmount / goal.days

  // Best/Worst day
  const bestDay = logs.length > 0 ? logs.reduce((a, b) => a.amount > b.amount ? a : b) : null
  const worstDay = logs.length > 0 ? logs.reduce((a, b) => a.amount < b.amount ? a : b) : null

  // Milestone
  const milestone = [...MILESTONES].reverse().find(m => pct >= m.pct)

  // Goal comparison
  let comparisonText = null
  if (prevGoal) {
    const prevTotal = (prevGoal.dailyLogs || []).reduce((s, l) => s + l.amount, 0)
    const diff = totalEarned - prevTotal
    if (diff > 0) comparisonText = `+₹${diff.toLocaleString('en-IN')} more than last time! 📈`
    else if (diff < 0) comparisonText = `₹${Math.abs(diff).toLocaleString('en-IN')} less than last time`
  }

  return (
    <div className={`goal-card ${completed ? 'completed' : ''} ${justCompleted ? 'celebrating' : ''}`}>
      {justCompleted && (
        <div className="goal-celebration">🎉 GOAL CRUSHED!</div>
      )}

      <div className="goal-card-header">
        <div className="goal-name">{goal.name}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {onRepeat && <button className="wishlist-remove" onClick={onRepeat} title="Repeat"><Repeat size={14} /></button>}
          <button className="wishlist-remove" onClick={onDelete} title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="goal-target-row">
        <div>
          <div className="goal-amount">₹{totalEarned.toLocaleString('en-IN')}</div>
          <div className="goal-sub">of ₹{goal.targetAmount.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="goal-pct">{pct.toFixed(0)}%</div>
          <div className="goal-sub">{completed ? 'Complete!' : `${daysLeft} days left`}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="goal-progress-track">
        <div className="goal-progress-fill" style={{ width: `${pct}%` }}>
          {milestone && pct >= 25 && <span className="goal-milestone-icon">{milestone.emoji}</span>}
        </div>
      </div>

      {/* Overflow bonus */}
      {overflow > 0 && (
        <div className="goal-overflow">
          🌟 ₹{overflow.toLocaleString('en-IN')} BONUS beyond target!
        </div>
      )}

      {/* Dynamic daily target */}
      {!completed && daysLeft > 0 && (
        <div className="goal-daily-target">
          <Target size={14} />
          Daily target: <strong>₹{dailyTarget.toFixed(0)}</strong>
          {dailyTarget > originalDaily && <span className="goal-warning"> (↑ adjusted)</span>}
          {dailyTarget < originalDaily && <span className="goal-ahead"> (↓ ahead of pace!)</span>}
        </div>
      )}

      {/* Day-by-day log */}
      {logs.length > 0 && (
        <div className="goal-log-grid">
          {logs.sort((a, b) => a.date.localeCompare(b.date)).map((log, i) => (
            <div key={i} className={`goal-log-item ${log === bestDay ? 'best' : ''} ${log === worstDay && logs.length > 1 ? 'worst' : ''}`}>
              <span className="goal-log-day">Day {i + 1}</span>
              <span className="goal-log-amount">₹{log.amount.toLocaleString('en-IN')}</span>
              {log === bestDay && logs.length > 1 && <span className="goal-log-badge">🏆</span>}
              {log === worstDay && logs.length > 1 && <span className="goal-log-badge">📉</span>}
            </div>
          ))}
        </div>
      )}

      {/* Comparison */}
      {comparisonText && (
        <div className="goal-comparison">{comparisonText}</div>
      )}

      {/* Milestone message */}
      {milestone && !completed && pct < 100 && (
        <div className="goal-milestone-msg">{milestone.msg}</div>
      )}

      {!completed && onLog && (
        <button className="emi-pay-btn" onClick={onLog} id={`log-${goal.id}`}>
          <Plus size={14} /> Log Earning
        </button>
      )}
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
        <h3>Log Earning — {goal.name}</h3>
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
          <button className="submit-btn" onClick={() => onLog(goal.id, parseFloat(amount), date)}
            disabled={!parseFloat(amount)}>
            <TrendingUp size={14} /> Log It
          </button>
        </div>
      </div>
    </div>
  )
}
