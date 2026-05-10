import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { addEMI, getEMIs, markEMIPaid, deleteEMI } from '../services/firestore'
import { format, addMonths, parseISO, differenceInDays, differenceInMonths } from 'date-fns'
import { Plus, Trash2, Check, Calendar, CreditCard, X, PartyPopper, ArrowDown } from 'lucide-react'
import confetti from 'canvas-confetti'

export default function EMITracker() {
  const { user } = useAuth()
  const [emis, setEmis] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(null)
  const [showCalendar, setShowCalendar] = useState(null)
  const [justCompleted, setJustCompleted] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const list = await getEMIs(user.uid)
    setEmis(list.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (a.status !== 'active' && b.status === 'active') return 1
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleAdd = async (data) => {
    await addEMI(user.uid, data)
    setShowAddModal(false)
    load()
  }

  const handlePay = async (emiId, amount, date) => {
    const result = await markEMIPaid(user.uid, emiId, amount, date)
    setShowPayModal(null)
    if (result?.isComplete) {
      setJustCompleted(emiId)
      try { confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }) } catch(e) {}
      setTimeout(() => setJustCompleted(null), 5000)
    }
    load()
  }

  const handleDelete = async (id) => {
    if (confirm('Delete this EMI? This cannot be undone.')) {
      await deleteEMI(user.uid, id)
      load()
    }
  }

  const activeEMIs = emis.filter(e => e.status === 'active')
  const completedEMIs = emis.filter(e => e.status === 'completed')
  const totalBurden = activeEMIs.reduce((s, e) => s + (e.emiAmount || 0), 0)
  const totalNeed = activeEMIs.filter(e => e.priority === 'need').reduce((s, e) => s + e.emiAmount, 0)
  const totalWant = activeEMIs.filter(e => e.priority === 'want').reduce((s, e) => s + e.emiAmount, 0)

  // Freedom date: the latest end date among all active EMIs
  let freedomDate = null
  activeEMIs.forEach(emi => {
    const remaining = emi.months - (emi.paidMonths?.length || 0)
    const endDate = addMonths(new Date(), remaining)
    if (!freedomDate || endDate > freedomDate) freedomDate = endDate
  })

  // Snowball suggestion: find smallest remaining balance
  let snowballTip = null
  if (activeEMIs.length > 1) {
    const sorted = [...activeEMIs].sort((a, b) => {
      const aRemaining = a.totalCost - (a.paidMonths || []).reduce((s, p) => s + p.amount, 0)
      const bRemaining = b.totalCost - (b.paidMonths || []).reduce((s, p) => s + p.amount, 0)
      return aRemaining - bRemaining
    })
    const smallest = sorted[0]
    const remaining = smallest.totalCost - (smallest.paidMonths || []).reduce((s, p) => s + p.amount, 0)
    const monthsLeft = Math.ceil(remaining / smallest.emiAmount)
    snowballTip = `Focus extra payments on "${smallest.name}" — only ₹${remaining.toLocaleString('en-IN')} left (${monthsLeft} months). Once done, redirect ₹${smallest.emiAmount.toLocaleString('en-IN')}/mo to your next EMI.`
  }

  // EMI Streak: consecutive months where all EMIs were paid
  let emiStreak = 0
  if (activeEMIs.length > 0) {
    const now = new Date()
    for (let i = 0; i < 24; i++) {
      const checkMonth = format(addMonths(now, -i), 'yyyy-MM')
      const allPaid = activeEMIs.every(emi => 
        (emi.paidMonths || []).some(p => p.date?.startsWith(checkMonth))
      )
      if (allPaid) emiStreak++
      else if (i > 0) break
    }
  }

  if (loading) return <div className="loading-screen" style={{ minHeight: 400 }}><div className="loader" /></div>

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>EMI Tracker</h2>
          <div className="subtitle">Track your installment payments</div>
        </div>
        <button className="action-btn primary" onClick={() => setShowAddModal(true)} id="add-emi-btn">
          <Plus size={16} /> Add EMI
        </button>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Monthly Burden</div>
          <div className="stat-value"><span className="currency">₹</span>{totalBurden.toLocaleString('en-IN')}</div>
          <div className="stat-sub">{activeEMIs.length} active EMI{activeEMIs.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs vs Wants</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-md)' }}>
            ₹{totalNeed.toLocaleString('en-IN')} / ₹{totalWant.toLocaleString('en-IN')}
          </div>
          <div className="stat-sub">Need / Want split</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Freedom Date</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-md)' }}>
            {freedomDate ? format(freedomDate, 'MMM yyyy') : '—'}
          </div>
          <div className="stat-sub">
            {freedomDate ? `${differenceInDays(freedomDate, new Date())} days left` : 'No active EMIs'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">EMI Streak</div>
          <div className="stat-value">{emiStreak}</div>
          <div className="stat-sub">months on-time 🔥</div>
        </div>
      </div>

      {/* Snowball Tip */}
      {snowballTip && (
        <div className="emi-snowball-tip">
          <strong>❄️ Snowball Strategy:</strong> {snowballTip}
        </div>
      )}

      {/* Active EMIs */}
      {activeEMIs.length === 0 && completedEMIs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💳</div>
          <p>No EMIs yet. Add one to start tracking your installment payments!</p>
        </div>
      ) : (
        <>
          {activeEMIs.length > 0 && (
            <>
              <h3 className="buckets-heading">Active EMIs</h3>
              <div className="emi-grid">
                {activeEMIs.map(emi => (
                  <EMICard key={emi.id} emi={emi} justCompleted={justCompleted === emi.id}
                    onPay={() => setShowPayModal(emi)} onDelete={() => handleDelete(emi.id)}
                    onCalendar={() => setShowCalendar(emi)} />
                ))}
              </div>
            </>
          )}

          {completedEMIs.length > 0 && (
            <>
              <h3 className="buckets-heading" style={{ marginTop: 48 }}>✅ Completed</h3>
              <div className="emi-grid">
                {completedEMIs.map(emi => (
                  <EMICard key={emi.id} emi={emi} completed onDelete={() => handleDelete(emi.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showAddModal && <AddEMIModal onSubmit={handleAdd} onClose={() => setShowAddModal(false)} />}
      {showPayModal && <PayModal emi={showPayModal} onPay={handlePay} onClose={() => setShowPayModal(null)} />}
      {showCalendar && <CalendarModal emi={showCalendar} onClose={() => setShowCalendar(null)} />}
    </>
  )
}

/* ── EMI Card ── */
function EMICard({ emi, completed, justCompleted, onPay, onDelete, onCalendar }) {
  const paid = emi.paidMonths?.length || 0
  const totalPaidAmount = (emi.paidMonths || []).reduce((s, p) => s + p.amount, 0)
  const remaining = emi.totalCost - totalPaidAmount
  const pct = emi.totalCost > 0 ? (totalPaidAmount / emi.totalCost * 100) : 0
  const monthsLeft = emi.months - paid
  const endDate = addMonths(parseISO(emi.startDate), emi.months)

  // Pre-pay advantage: if user pays extra, how many months saved
  const avgPaid = paid > 0 ? totalPaidAmount / paid : emi.emiAmount
  const projectedMonths = avgPaid > 0 ? Math.ceil(emi.totalCost / avgPaid) : emi.months
  const monthsSaved = emi.months - projectedMonths
  const amountSaved = monthsSaved * emi.emiAmount

  return (
    <div className={`emi-card ${completed ? 'completed' : ''} ${justCompleted ? 'celebrating' : ''}`}>
      {justCompleted && (
        <div className="emi-celebration">
          <PartyPopper size={32} /> FULLY PAID! 🎉
        </div>
      )}
      <div className="emi-card-header">
        <div>
          <span className={`emi-priority-tag ${emi.priority}`}>{emi.priority === 'need' ? '🔒 Need' : '✨ Want'}</span>
          {completed && <span className="emi-completed-badge">✅ Done</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {onCalendar && <button className="wishlist-remove" onClick={onCalendar} title="Calendar"><Calendar size={14} /></button>}
          <button className="wishlist-remove" onClick={onDelete} title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="emi-name">{emi.name}</div>
      <div className="emi-price-row">
        <div>
          <div className="emi-price">₹{emi.emiAmount.toLocaleString('en-IN')}<span>/mo</span></div>
          <div className="emi-sub">Item: ₹{emi.totalPrice.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="emi-months">{paid}/{emi.months}</div>
          <div className="emi-sub">months paid</div>
        </div>
      </div>

      <div className="emi-progress-track">
        <div className="emi-progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="emi-progress-labels">
        <span>₹{totalPaidAmount.toLocaleString('en-IN')} paid</span>
        <span>₹{remaining.toLocaleString('en-IN')} left</span>
      </div>

      {/* Interest / Cost */}
      {emi.interestPaid > 0 && (
        <div className="emi-interest">
          Extra cost (interest): <strong>₹{emi.interestPaid.toLocaleString('en-IN')}</strong>
          <span className="emi-interest-pct">({((emi.interestPaid / emi.totalPrice) * 100).toFixed(1)}%)</span>
        </div>
      )}

      {/* Pre-pay Advantage */}
      {!completed && monthsSaved > 0 && (
        <div className="emi-prepay-tip">
          ⚡ At your current pace, you'll finish <strong>{monthsSaved} month{monthsSaved > 1 ? 's' : ''} early</strong>, saving ₹{amountSaved.toLocaleString('en-IN')}!
        </div>
      )}

      {/* End date */}
      <div className="emi-end-date">
        {completed ? `Completed` : `Ends ${format(endDate, 'MMM yyyy')} · ${monthsLeft} months left`}
      </div>

      {!completed && onPay && (
        <button className="emi-pay-btn" onClick={onPay} id={`pay-${emi.id}`}>
          <Check size={14} /> Mark Paid
        </button>
      )}
    </div>
  )
}

/* ── Add EMI Modal ── */
function AddEMIModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [totalPrice, setTotalPrice] = useState('')
  const [emiAmount, setEmiAmount] = useState('')
  const [months, setMonths] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [priority, setPriority] = useState('need')
  const [submitting, setSubmitting] = useState(false)

  const totalCost = (parseFloat(emiAmount) || 0) * (parseInt(months) || 0)
  const interest = totalCost - (parseFloat(totalPrice) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !parseFloat(totalPrice) || !parseFloat(emiAmount) || !parseInt(months)) return
    setSubmitting(true)
    await onSubmit({
      name: name.trim(),
      totalPrice: parseFloat(totalPrice),
      emiAmount: parseFloat(emiAmount),
      months: parseInt(months),
      startDate,
      priority
    })
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Add New EMI</h3>
        <div className="form-group">
          <label>Item Name</label>
          <input type="text" placeholder="Apple Watch SE, Laptop..." value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Item Price (₹)</label>
            <input type="number" placeholder="25000" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} min="1" />
          </div>
          <div className="form-group">
            <label>Monthly EMI (₹)</label>
            <input type="number" placeholder="2090" value={emiAmount} onChange={e => setEmiAmount(e.target.value)} min="1" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Tenure (Months)</label>
            <input type="number" placeholder="12" value={months} onChange={e => setMonths(e.target.value)} min="1" />
          </div>
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={`filter-btn ${priority === 'need' ? 'active' : ''}`}
              onClick={() => setPriority('need')} style={{ flex: 1 }}>🔒 Need</button>
            <button type="button" className={`filter-btn ${priority === 'want' ? 'active' : ''}`}
              onClick={() => setPriority('want')} style={{ flex: 1 }}>✨ Want</button>
          </div>
        </div>

        {totalCost > 0 && (
          <div className="emi-preview">
            <div>Total Cost: <strong>₹{totalCost.toLocaleString('en-IN')}</strong></div>
            {interest > 0 && <div style={{ color: '#c00' }}>Interest/Extra: ₹{interest.toLocaleString('en-IN')} ({((interest / (parseFloat(totalPrice) || 1)) * 100).toFixed(1)}%)</div>}
            {interest <= 0 && <div style={{ color: '#1e8e3e' }}>No-cost EMI ✅</div>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!name.trim() || !parseFloat(emiAmount) || submitting}>
            {submitting ? 'Adding...' : 'Add EMI'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Pay Modal ── */
function PayModal({ emi, onPay, onClose }) {
  const [amount, setAmount] = useState(emi.emiAmount.toString())
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const extraPay = parseFloat(amount) - emi.emiAmount
  const totalPaidSoFar = (emi.paidMonths || []).reduce((s, p) => s + p.amount, 0) + parseFloat(amount || 0)
  const remainingAfter = emi.totalCost - totalPaidSoFar
  const monthsRemaining = Math.max(0, Math.ceil(remainingAfter / emi.emiAmount))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Pay EMI — {emi.name}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" autoFocus />
          </div>
          <div className="form-group">
            <label>Payment Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {extraPay > 0 && (
          <div className="emi-prepay-tip" style={{ marginBottom: 16 }}>
            ⚡ Pre-paying ₹{extraPay.toLocaleString('en-IN')} extra!
            {remainingAfter > 0
              ? ` After this, only ₹${remainingAfter.toLocaleString('en-IN')} left (~${monthsRemaining} months).`
              : ` This will complete the EMI! 🎉`}
          </div>
        )}

        <div className="emi-payment-history">
          <strong>Payment Log ({emi.paidMonths?.length || 0} payments)</strong>
          {(emi.paidMonths || []).length > 0 ? (
            <div className="emi-log-list">
              {(emi.paidMonths || []).map((p, i) => (
                <div key={i} className="emi-log-item">
                  <span>{p.date}</span>
                  <span>₹{p.amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          ) : <div className="emi-sub" style={{ marginTop: 8 }}>No payments yet</div>}
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="submit-btn" onClick={() => onPay(emi.id, parseFloat(amount), date)}
            disabled={!parseFloat(amount)}>
            <Check size={14} /> Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Calendar Modal ── */
function CalendarModal({ emi, onClose }) {
  const months = []
  const start = parseISO(emi.startDate)
  for (let i = 0; i < emi.months; i++) {
    const monthDate = addMonths(start, i)
    const monthKey = format(monthDate, 'yyyy-MM')
    const paid = (emi.paidMonths || []).find(p => p.date?.startsWith(monthKey))
    months.push({
      label: format(monthDate, 'MMM yyyy'),
      isPaid: !!paid,
      amount: paid?.amount || 0,
      isCurrent: format(new Date(), 'yyyy-MM') === monthKey
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3>📅 EMI Calendar — {emi.name}</h3>
        <div className="emi-calendar-grid">
          {months.map((m, i) => (
            <div key={i} className={`emi-cal-cell ${m.isPaid ? 'paid' : ''} ${m.isCurrent ? 'current' : ''}`}>
              <div className="emi-cal-month">{m.label}</div>
              <div className="emi-cal-status">
                {m.isPaid ? `✅ ₹${m.amount.toLocaleString('en-IN')}` : m.isCurrent ? '⏳ Due' : '—'}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
