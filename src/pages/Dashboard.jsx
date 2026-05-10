import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getOrCreateCurrentPeriod, subscribeToCurrentPeriod, addIncome, addExpense,
  getTransactions, getWorkStreak, getCumulativeSavings, getDailySummariesFromTransactions,
  closeCurrentPeriod, recalculateCurrentPeriod, deleteTransaction, getActiveEMIBurden
} from '../services/firestore'
import { format, subDays, isSameDay } from 'date-fns'
import { Plus, Minus, X, Flame, Archive, RefreshCw, Undo2 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell
} from 'recharts'

const PIE_COLORS = ['#000000', '#444444', '#888888', '#CCCCCC']
const UNDO_DURATION = 60

export default function Dashboard() {
  const { user } = useAuth()
  const [periodData, setPeriodData] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [streak, setStreak] = useState(0)
  const [cumulative, setCumulative] = useState({ totalSavings: 0, totalGrowth: 0 })
  const [weekData, setWeekData] = useState([])
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [warning, setWarning] = useState(null)
  const [loading, setLoading] = useState(true)
  const [undoTxn, setUndoTxn] = useState(null)
  const [undoSeconds, setUndoSeconds] = useState(0)
  const [emiBurden, setEmiBurden] = useState(0)
  const undoTimerRef = useRef(null)
  const undoCountdownRef = useRef(null)

  const buckets = periodData?.buckets || {
    essentials: { allocated: 0, spent: 0 },
    savings: { allocated: 0 },
    growth: { allocated: 0 },
    enjoyment: { allocated: 0, spent: 0 }
  }

  // Subscribe to period doc
  useEffect(() => {
    if (!user) return
    setLoading(true)
    getOrCreateCurrentPeriod(user.uid).then(() => setLoading(false))
    const unsub = subscribeToCurrentPeriod(user.uid, (data) => setPeriodData(data))
    return unsub
  }, [user])

  // Load transactions
  const loadTransactions = useCallback(async () => {
    if (!user || !periodData?.startedAt) return
    const startDate = format(periodData.startedAt.toDate(), 'yyyy-MM-dd')
    const endDate = format(new Date(), 'yyyy-MM-dd')
    const txns = await getTransactions(user.uid, startDate, endDate)
    setTransactions(txns)
  }, [user, periodData?.startedAt])

  useEffect(() => { loadTransactions() }, [loadTransactions])

  // Load streak, cumulative, and week chart data
  useEffect(() => {
    if (!user) return
    getWorkStreak(user.uid).then(setStreak)
    getCumulativeSavings(user.uid).then(setCumulative)
    getActiveEMIBurden(user.uid).then(setEmiBurden)

    const now = new Date()
    const start = format(subDays(now, 6), 'yyyy-MM-dd')
    const end = format(now, 'yyyy-MM-dd')
    getDailySummariesFromTransactions(user.uid, start, end).then((summaries) => {
      const data = []
      for (let i = 6; i >= 0; i--) {
        const d = subDays(now, i)
        const key = format(d, 'yyyy-MM-dd')
        const doc = summaries.find(x => x.date === key)
        data.push({
          date: format(d, 'EEE'),
          income: doc?.totalIncome || 0,
          expenses: doc?.totalExpenses || 0
        })
      }
      setWeekData(data)
    })
  }, [user, periodData])

  const startUndoTimer = (txnId, label) => {
    clearTimeout(undoTimerRef.current)
    clearInterval(undoCountdownRef.current)
    setUndoTxn({ txnId, label })
    setUndoSeconds(UNDO_DURATION)
    undoCountdownRef.current = setInterval(() => {
      setUndoSeconds(prev => {
        if (prev <= 1) { clearInterval(undoCountdownRef.current); setUndoTxn(null); return 0 }
        return prev - 1
      })
    }, 1000)
    undoTimerRef.current = setTimeout(() => {
      setUndoTxn(null)
      clearInterval(undoCountdownRef.current)
    }, UNDO_DURATION * 1000)
  }

  const handleUndo = async () => {
    if (!undoTxn) return
    clearTimeout(undoTimerRef.current)
    clearInterval(undoCountdownRef.current)
    const { txnId, label } = undoTxn
    setUndoTxn(null)
    setWarning('↩️ Undoing transaction...')
    try {
      await deleteTransaction(user.uid, txnId)
      await loadTransactions()
      setWarning(`✅ Undone: ${label}`)
      setTimeout(() => setWarning(null), 3000)
    } catch (err) {
      console.error('Undo failed:', err)
      setWarning('⚠️ Undo failed.')
      setTimeout(() => setWarning(null), 4000)
    }
  }

  const handleAddIncome = async (amount, description) => {
    try {
      const result = await addIncome(user.uid, amount, description)
      await loadTransactions()
      startUndoTimer(result.txnId, `+₹${amount} ${description || 'Income'}`)
    } catch (err) {
      console.error('Add income failed:', err)
      setWarning('⚠️ Failed to add income.')
      setTimeout(() => setWarning(null), 5000)
    } finally {
      setShowIncomeModal(false)
    }
  }

  const handleAddExpense = async (amount, description) => {
    try {
      const result = await addExpense(user.uid, amount, description)
      if (result.warning) {
        setWarning(result.warning)
        setTimeout(() => setWarning(null), 8000)
      }
      await loadTransactions()
      startUndoTimer(result.txnId, `-₹${amount} ${description || 'Expense'}`)
    } catch (err) {
      console.error('Add expense failed:', err)
      setWarning('⚠️ Failed to add expense.')
      setTimeout(() => setWarning(null), 5000)
    } finally {
      setShowExpenseModal(false)
    }
  }

  const handleCloseMonth = async () => {
    if (confirm('Are you sure you want to close this month? This will archive your current period data to history and start a fresh period.')) {
      await closeCurrentPeriod(user.uid)
      setWarning('Period closed successfully! Started a new period.')
      setTimeout(() => setWarning(null), 5000)
    }
  }

  const handleSync = async () => {
    try {
      setWarning('🔄 Syncing — recalculating from transactions...')
      await recalculateCurrentPeriod(user.uid)
      await loadTransactions()
      setWarning('✅ Synced! Dashboard now matches your actual transactions.')
      setTimeout(() => setWarning(null), 4000)
    } catch (err) {
      console.error('Sync failed:', err)
      setWarning('⚠️ Sync failed. Please try again.')
      setTimeout(() => setWarning(null), 5000)
    }
  }

  const totalIncome = periodData?.totalIncome || 0
  const totalExpenses = periodData?.totalExpenses || 0
  const profit = totalIncome - totalExpenses

  const pieData = [
    { name: 'Essentials', value: buckets.essentials?.allocated || 0 },
    { name: 'Savings', value: buckets.savings?.allocated || 0 },
    { name: 'Growth', value: buckets.growth?.allocated || 0 },
    { name: 'Enjoyment', value: buckets.enjoyment?.allocated || 0 }
  ].filter(d => d.value > 0)

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: '#000', color: '#fff', padding: '8px 12px',
        borderRadius: 8, fontSize: '0.75rem', lineHeight: 1.6
      }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
        {payload.map(p => (
          <div key={p.name}>{p.name}: ₹{p.value.toLocaleString('en-IN')}</div>
        ))}
      </div>
    )
  }

  if (loading) {
    return <div className="loading-screen"><div className="loader" /></div>
  }

  const startedAtDate = periodData?.startedAt?.toDate()

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Dashboard</h2>
          <div className="subtitle">Your financial command center</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSync} className="action-btn" style={{ background: '#f5f5f5', color: '#333' }} id="sync-btn">
            <RefreshCw size={16} /> Sync
          </button>
          <button onClick={handleCloseMonth} className="action-btn" style={{ background: '#f5f5f5', color: '#333' }} id="close-month-btn">
            <Archive size={16} /> Close Month
          </button>
        </div>
      </div>

      {/* Date Nav + Streak */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="date-nav" style={{ marginBottom: 0, padding: '12px 16px' }}>
          <div>
            <div className="date-text">Current Period</div>
            <div className="date-sub">Started on {startedAtDate ? format(startedAtDate, 'MMM d, yyyy') : 'Loading...'}</div>
          </div>
        </div>
        {streak > 0 && (
          <div className="streak-badge">
            <Flame size={14} />
            {streak} day streak
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Period Income</div>
          <div className="stat-value"><span className="currency">₹</span>{totalIncome.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Expenses</div>
          <div className="stat-value"><span className="currency">₹</span>{totalExpenses.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Profit</div>
          <div className="stat-value"><span className="currency">₹</span>{profit.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Savings</div>
          <div className="stat-value"><span className="currency">₹</span>{(cumulative.totalSaved || 0).toLocaleString('en-IN')}</div>
          <div className="stat-sub">Income − Expenses (all time)</div>
        </div>
      </div>

      {/* EMI Burden Bar */}
      {emiBurden > 0 && totalIncome > 0 && (
        <div className="emi-burden-bar-wrap">
          <div className="emi-burden-header">
            <span>💳 Monthly EMI Burden</span>
            <span>₹{emiBurden.toLocaleString('en-IN')} locked / ₹{totalIncome.toLocaleString('en-IN')} income</span>
          </div>
          <div className="emi-burden-track">
            <div className="emi-burden-locked" style={{ width: `${Math.min((emiBurden / totalIncome) * 100, 100)}%` }}>
              EMI ₹{emiBurden.toLocaleString('en-IN')}
            </div>
            <div className="emi-burden-free" style={{ width: `${Math.max(100 - (emiBurden / totalIncome) * 100, 0)}%` }}>
              Free ₹{Math.max(totalIncome - emiBurden, 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="actions-row">
        <button className="action-btn primary" onClick={() => setShowIncomeModal(true)} id="add-income-btn">
          <Plus size={16} /> Add Income
        </button>
        <button className="action-btn" onClick={() => setShowExpenseModal(true)} id="add-expense-btn">
          <Minus size={16} /> Add Expense
        </button>
      </div>

      {/* Charts Row */}
      <div className="dashboard-charts">
        <div className="insight-card">
          <h4>Last 7 Days</h4>
          <div className="chart-wrap">
            {weekData.some(d => d.income > 0 || d.expenses > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#999" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="income" fill="#000" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="#ccc" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                <p>Start logging income to see your weekly chart.</p>
              </div>
            )}
          </div>
        </div>

        <div className="insight-card">
          <h4>Period Allocation</h4>
          <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                <p>Add income to see allocation breakdown.</p>
              </div>
            )}
          </div>
          {pieData.length > 0 && (
            <div className="pie-legend">
              {pieData.map((d, i) => (
                <div key={d.name} className="pie-legend-item">
                  <span className="pie-legend-dot" style={{ background: PIE_COLORS[i] }} />
                  <span>{d.name}</span>
                  <span className="pie-legend-value">₹{d.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Period Transactions */}
      <div className="transactions-section">
        <h3>Recent Transactions in this Period</h3>
        {transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No transactions yet in this period. Start by adding your income!</p>
          </div>
        ) : (
          <div className="txn-list">
            {transactions.slice(0, 15).map((txn) => ( // Show only the latest 15 to avoid long lists
              <div className="txn-item" key={txn.id}>
                <div className={`txn-icon ${txn.type}`}>
                  {txn.type === 'income' ? <Plus size={16} /> : <Minus size={16} />}
                </div>
                <div className="txn-details">
                  <div className="txn-desc">{txn.description}</div>
                  <div className="txn-meta">
                    {format(new Date(txn.date), 'MMM d')} · {txn.timestamp?.toDate ? format(txn.timestamp.toDate(), 'h:mm a') : ''}
                    {txn.type === 'expense' && txn.fromEssentials > 0 && ` · ₹${txn.fromEssentials} from Essentials`}
                    {txn.type === 'expense' && txn.fromEnjoyment > 0 && ` · ₹${txn.fromEnjoyment} from Enjoyment`}
                    {txn.type === 'expense' && txn.overspent > 0 && ` · ⚠️ ₹${txn.overspent} overspent`}
                  </div>
                </div>
                <div className={`txn-amount ${txn.type}`}>
                  ₹{txn.amount.toLocaleString('en-IN')}
                </div>
              </div>
            ))}
            {transactions.length > 15 && (
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--gray-500)' }}>
                View all in History tab
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showIncomeModal && <IncomeModal onSubmit={handleAddIncome} onClose={() => setShowIncomeModal(false)} />}
      {showExpenseModal && (
        <ExpenseModal
          onSubmit={handleAddExpense}
          onClose={() => setShowExpenseModal(false)}
          bucketRemaining={{
            essentials: Math.max(0, (buckets.essentials?.allocated || 0) - (buckets.essentials?.spent || 0)),
            enjoyment: Math.max(0, (buckets.enjoyment?.allocated || 0) - (buckets.enjoyment?.spent || 0)),
            growth: Math.max(0, (buckets.growth?.allocated || 0) - (buckets.growth?.spent || 0)),
            savings: Math.max(0, (buckets.savings?.allocated || 0) - (buckets.savings?.spent || 0))
          }}
        />
      )}

      {/* Warning Toast */}
      {warning && (
        <div className="warning-toast">
          <span>{warning}</span>
          <button className="toast-close" onClick={() => setWarning(null)}><X size={14} /></button>
        </div>
      )}

      {/* Undo Toast */}
      {undoTxn && (
        <div className="undo-toast" id="undo-toast">
          <div className="undo-toast-content">
            <span className="undo-label">{undoTxn.label}</span>
            <span className="undo-timer">{undoSeconds}s</span>
          </div>
          <button className="undo-btn" onClick={handleUndo} id="undo-btn">
            <Undo2 size={14} /> Undo
          </button>
          <div className="undo-progress" style={{ width: `${(undoSeconds / UNDO_DURATION) * 100}%` }} />
        </div>
      )}
    </>
  )
}

/* ── Income Modal ── */
function IncomeModal({ onSubmit, onClose }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const parsedAmount = parseFloat(amount) || 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (parsedAmount <= 0) return
    setSubmitting(true)
    await onSubmit(parsedAmount, description)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Add Income</h3>
        <div className="form-group">
          <label>Amount (₹)</label>
          <input type="number" placeholder="2000" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus min="1" step="any" id="income-amount" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <input type="text" placeholder="Salary, freelance work, etc." value={description} onChange={(e) => setDescription(e.target.value)} id="income-description" />
        </div>
        {parsedAmount > 0 && (
          <div className="form-allocation">
            <div className="form-allocation-item"><span>🟢 Essentials (10%)</span><span>₹{(parsedAmount * 0.10).toFixed(2)}</span></div>
            <div className="form-allocation-item"><span>🔵 Savings (60%)</span><span>₹{(parsedAmount * 0.60).toFixed(2)}</span></div>
            <div className="form-allocation-item"><span>🟡 Growth (25%)</span><span>₹{(parsedAmount * 0.25).toFixed(2)}</span></div>
            <div className="form-allocation-item"><span>🎉 Enjoyment (5%)</span><span>₹{(parsedAmount * 0.05).toFixed(2)}</span></div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={parsedAmount <= 0 || submitting} id="income-submit">
            {submitting ? 'Adding...' : 'Add Income'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Expense Modal ── */
function ExpenseModal({ onSubmit, onClose, bucketRemaining }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const parsedAmount = parseFloat(amount) || 0

  const { essentials, enjoyment, growth, savings } = bucketRemaining
  const totalAvailable = essentials + enjoyment + growth + savings
  const softLimit = essentials + enjoyment
  const isEatingProtected = parsedAmount > softLimit && parsedAmount > 0
  const isTotalOverspend = parsedAmount > totalAvailable && parsedAmount > 0

  // Waterfall preview
  let rem = parsedAmount
  const fromEss = Math.min(rem, essentials); rem -= fromEss
  const fromEnj = Math.min(rem, enjoyment); rem -= fromEnj
  const fromGro = Math.min(rem, growth); rem -= fromGro
  const fromSav = Math.min(rem, savings); rem -= fromSav
  const overflowAmt = rem

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (parsedAmount <= 0) return
    setSubmitting(true)
    await onSubmit(parsedAmount, description)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Add Expense</h3>
        <div className="form-group">
          <label>Amount (₹)</label>
          <input type="number" placeholder="150" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus min="1" step="any" id="expense-amount" />
        </div>
        <div className="form-group">
          <label>What did you spend on?</label>
          <input type="text" placeholder="Lunch, transport, supplies..." value={description} onChange={(e) => setDescription(e.target.value)} id="expense-description" />
        </div>
        {parsedAmount > 0 && (
          <div className="form-allocation" style={{ gridTemplateColumns: '1fr' }}>
            <div className="form-allocation-item"><span>🟢 Essentials available</span><span>₹{essentials.toFixed(2)}</span></div>
            <div className="form-allocation-item"><span>🎉 Enjoyment available</span><span>₹{enjoyment.toFixed(2)}</span></div>
            <div className="form-allocation-item"><span>🟡 Growth available</span><span>₹{growth.toFixed(2)}</span></div>
            <div className="form-allocation-item"><span>🔵 Savings available</span><span>₹{savings.toFixed(2)}</span></div>
            <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 8, marginTop: 4 }}>
              {fromEss > 0 && <div className="form-allocation-item"><span>From Essentials</span><span>-₹{fromEss.toFixed(2)}</span></div>}
              {fromEnj > 0 && <div className="form-allocation-item"><span>From Enjoyment</span><span>-₹{fromEnj.toFixed(2)}</span></div>}
              {fromGro > 0 && <div className="form-allocation-item" style={{ color: 'var(--black)', fontWeight: 700 }}><span>⚠️ From Growth</span><span>-₹{fromGro.toFixed(2)}</span></div>}
              {fromSav > 0 && <div className="form-allocation-item" style={{ color: 'var(--black)', fontWeight: 700 }}><span>🚨 From Savings</span><span>-₹{fromSav.toFixed(2)}</span></div>}
            </div>
          </div>
        )}
        {isEatingProtected && !isTotalOverspend && (
          <div style={{ background: 'var(--black)', color: 'var(--white)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-md)', lineHeight: 1.6 }}>
            ⚠️ Essentials & Enjoyment are empty. This expense eats into your Growth{fromSav > 0 ? ' & Savings' : ''} — you need to stop spending!
          </div>
        )}
        {isTotalOverspend && (
          <div style={{ background: 'var(--black)', color: 'var(--white)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-md)', lineHeight: 1.6 }}>
            🚨 CRITICAL: You are spending ₹{overflowAmt.toFixed(2)} MORE than your entire income! ALL buckets are empty. You are going negative.
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={parsedAmount <= 0 || submitting} id="expense-submit">
            {submitting ? 'Adding...' : isTotalOverspend ? 'Add Anyway' : isEatingProtected ? 'Add Anyway' : 'Add Expense'}
          </button>
        </div>
      </form>
    </div>
  )
}
