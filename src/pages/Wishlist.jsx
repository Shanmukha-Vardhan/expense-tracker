import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getWishlist, addWishlistItem, removeWishlistItem, getCumulativeSavings, getOrCreateCurrentPeriod } from '../services/firestore'
import { Plus, Trash2, Gift, Clock, Star } from 'lucide-react'

const PRIORITY_MAP = {
  low: { label: 'Low', color: '#888' },
  medium: { label: 'Medium', color: '#555' },
  high: { label: 'High', color: '#000' }
}

export default function WishlistPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [avgDailyIncome, setAvgDailyIncome] = useState(0)
  const [totalSaved, setTotalSaved] = useState(0)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const [list, cum, period] = await Promise.all([
      getWishlist(user.uid),
      getCumulativeSavings(user.uid),
      getOrCreateCurrentPeriod(user.uid)
    ])
    setItems(list.sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 }
      return (prio[a.priority] || 1) - (prio[b.priority] || 1)
    }))
    setTotalSaved(cum.totalSaved || 0)
    // Estimate avg daily income from current period
    if (period.startedAt?.toDate) {
      const days = Math.max(1, Math.ceil((Date.now() - period.startedAt.toDate().getTime()) / (1000 * 60 * 60 * 24)))
      const dailySavingsRate = ((period.totalIncome || 0) - (period.totalExpenses || 0)) / days
      setAvgDailyIncome(Math.max(0, dailySavingsRate))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleAdd = async (name, price, priority) => {
    await addWishlistItem(user.uid, name, price, priority)
    setShowModal(false)
    load()
  }

  const handleRemove = async (id) => {
    if (confirm('Remove this item from your wishlist?')) {
      await removeWishlistItem(user.uid, id)
      load()
    }
  }

  const daysToAfford = (price) => {
    if (avgDailyIncome <= 0) return '∞'
    return Math.ceil(price / avgDailyIncome)
  }

  if (loading) return <div className="loading-screen" style={{ minHeight: 400 }}><div className="loader" /></div>

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Wishlist</h2>
          <div className="subtitle">Save up for what you want</div>
        </div>
        <button className="action-btn primary" onClick={() => setShowModal(true)} id="add-wish-btn">
          <Plus size={16} /> Add Item
        </button>
      </div>

      {/* Savings Info */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Your Net Savings</div>
          <div className="stat-value"><span className="currency">₹</span>{totalSaved.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Daily Savings Rate</div>
          <div className="stat-value"><span className="currency">₹</span>{avgDailyIncome.toFixed(0)}</div>
          <div className="stat-sub">Based on current period</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎁</div>
          <p>Your wishlist is empty. Add items you're saving up for!</p>
        </div>
      ) : (
        <div className="wishlist-grid">
          {items.map(item => {
            const days = daysToAfford(item.price)
            const canAfford = totalSaved >= item.price
            const p = PRIORITY_MAP[item.priority] || PRIORITY_MAP.medium

            return (
              <div className={`wishlist-card ${canAfford ? 'affordable' : ''}`} key={item.id}>
                <div className="wishlist-card-header">
                  <div className="wishlist-priority" style={{ background: p.color }}>{p.label}</div>
                  <button className="wishlist-remove" onClick={() => handleRemove(item.id)} id={`remove-${item.id}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="wishlist-name">{item.name}</div>
                <div className="wishlist-price">₹{item.price.toLocaleString('en-IN')}</div>
                <div className="wishlist-timer">
                  {canAfford ? (
                    <span className="wishlist-affordable"><Star size={14} /> You can afford this!</span>
                  ) : (
                    <span className="wishlist-days"><Clock size={14} /> {days} days of saving</span>
                  )}
                </div>
                {!canAfford && (
                  <div className="wishlist-progress-track">
                    <div className="wishlist-progress-fill" style={{ width: `${Math.min(100, (totalSaved / item.price) * 100)}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && <WishlistModal onSubmit={handleAdd} onClose={() => setShowModal(false)} />}
    </>
  )
}

function WishlistModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [priority, setPriority] = useState('medium')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const p = parseFloat(price)
    if (!name.trim() || !p || p <= 0) return
    setSubmitting(true)
    await onSubmit(name.trim(), p, priority)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Add to Wishlist</h3>
        <div className="form-group">
          <label>Item Name</label>
          <input type="text" placeholder="iPhone, Laptop, Course..." value={name} onChange={e => setName(e.target.value)} autoFocus id="wish-name" />
        </div>
        <div className="form-group">
          <label>Price (₹)</label>
          <input type="number" placeholder="25000" value={price} onChange={e => setPrice(e.target.value)} min="1" step="any" id="wish-price" />
        </div>
        <div className="form-group">
          <label>Priority</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['low', 'medium', 'high'].map(p => (
              <button key={p} type="button" className={`filter-btn ${priority === p ? 'active' : ''}`}
                onClick={() => setPriority(p)} style={{ flex: 1, textTransform: 'capitalize' }}>{p}</button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="submit-btn" disabled={!name.trim() || !parseFloat(price) || submitting} id="wish-submit">
            {submitting ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </form>
    </div>
  )
}
