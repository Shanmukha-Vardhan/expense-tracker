import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTransactions, getArchivedPeriods } from '../services/firestore'
import { format, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth, parse } from 'date-fns'
import { Plus, Minus, ArrowUpRight, ArrowDownRight, List, CalendarDays, Search } from 'lucide-react'
import { CinematicSplash, DEMO_DATA } from '../components/DemoMode'

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' }
]

export default function History() {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState('transactions') // 'transactions' or 'months'
  const [filter, setFilter] = useState('today')
  const [typeFilter, setTypeFilter] = useState('all')
  const [transactions, setTransactions] = useState([])
  const [archivedPeriods, setArchivedPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [showSplash, setShowSplash] = useState(true)
  const [animReady, setAnimReady] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(false) // Force skip loading for demo
  }, [user, filter, viewMode])

  // Apply all filters: type, search, amount range
  const displayTransactions = DEMO_DATA.transactions
  let filtered = typeFilter === 'all'
    ? displayTransactions
    : displayTransactions.filter(t => t.type === typeFilter)

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(t => (t.description || '').toLowerCase().includes(q))
  }
  if (minAmount) filtered = filtered.filter(t => t.amount >= parseFloat(minAmount))
  if (maxAmount) filtered = filtered.filter(t => t.amount <= parseFloat(maxAmount))

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  // Group by date
  const grouped = {}
  filtered.forEach(txn => {
    if (!grouped[txn.date]) grouped[txn.date] = []
    grouped[txn.date].push(txn)
  })

  const displayArchived = [
    {
      id: 'mock-1',
      closedAt: { toDate: () => new Date('2026-04-30T23:59:59') },
      totalIncome: 165000,
      totalExpenses: 52000,
      buckets: {
        essentials: { allocated: 16500, spent: 14200 },
        savings: { allocated: 99000 },
        growth: { allocated: 41250 },
        enjoyment: { allocated: 8250, spent: 8250 }
      },
      rolledToSavings: 2300
    },
    {
      id: 'mock-2',
      closedAt: { toDate: () => new Date('2026-03-31T23:59:59') },
      totalIncome: 155000,
      totalExpenses: 48000,
      buckets: {
        essentials: { allocated: 15500, spent: 15000 },
        savings: { allocated: 93000 },
        growth: { allocated: 38750 },
        enjoyment: { allocated: 7750, spent: 7000 }
      },
      rolledToSavings: 500
    }
  ]

  return (
    <>
      {showSplash && (
        <CinematicSplash onDone={() => {
          setShowSplash(false)
          setTimeout(() => setAnimReady(true), 100)
        }} />
      )}
      <div className={`dashboard-wrapper ${!showSplash ? 'ready' : ''}`}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>History</h2>
          <div className="subtitle">All your data in one place</div>
        </div>
        
        <div className="view-toggle" style={{ display: 'flex', gap: 8, background: 'var(--gray-50)', padding: 4, borderRadius: 12 }}>
          <button 
            onClick={() => setViewMode('transactions')}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 'var(--fs-sm)', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: viewMode === 'transactions' ? '#fff' : 'transparent',
              color: viewMode === 'transactions' ? 'var(--gray-900)' : 'var(--gray-500)',
              boxShadow: viewMode === 'transactions' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <List size={16} />
            Transactions
          </button>
          <button 
            onClick={() => setViewMode('months')}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 'var(--fs-sm)', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: viewMode === 'months' ? '#fff' : 'transparent',
              color: viewMode === 'months' ? 'var(--gray-900)' : 'var(--gray-500)',
              boxShadow: viewMode === 'months' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <CalendarDays size={16} />
            Past Months
          </button>
        </div>
      </div>

      {viewMode === 'transactions' ? (
        <>
          {/* Summary */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card">
              <div className="stat-label">Total Income</div>
              <div className="stat-value">
                <span className="currency">₹</span>{totalIncome.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Expenses</div>
              <div className="stat-value">
                <span className="currency">₹</span>{totalExpenses.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Net Profit</div>
              <div className="stat-value">
                <span className="currency">₹</span>{(totalIncome - totalExpenses).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="filter-bar">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
                id={`filter-${f.key}`}
              >
                {f.label}
              </button>
            ))}

            <div style={{ width: 1, background: 'var(--gray-200)', margin: '0 4px' }} />

            <button
              className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTypeFilter('all')}
            >All</button>
            <button
              className={`filter-btn ${typeFilter === 'income' ? 'active' : ''}`}
              onClick={() => setTypeFilter('income')}
            >Income</button>
            <button
              className={`filter-btn ${typeFilter === 'expense' ? 'active' : ''}`}
              onClick={() => setTypeFilter('expense')}
            >Expenses</button>
          </div>

          {/* Search & Range Filters */}
          <div className="search-bar" style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="search-input-wrap" style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--gray-400)' }} />
              <input 
                type="text" 
                placeholder="Search transactions..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 'var(--fs-sm)' }}
                id="search-input"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input 
                type="number" 
                placeholder="Min ₹" 
                value={minAmount}
                onChange={e => setMinAmount(e.target.value)}
                style={{ width: 80, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 'var(--fs-sm)' }}
                id="min-amount"
              />
              <span style={{ color: 'var(--gray-400)' }}>-</span>
              <input 
                type="number" 
                placeholder="Max ₹" 
                value={maxAmount}
                onChange={e => setMaxAmount(e.target.value)}
                style={{ width: 80, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 'var(--fs-sm)' }}
                id="max-amount"
              />
            </div>
          </div>

          {/* Transaction List */}
          {loading ? (
            null
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>No transactions found for this period.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, txns]) => (
              <div key={date} className="transactions-section" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 'var(--fs-sm)', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
                  {format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="txn-list">
                  {txns.map(txn => (
                    <div className="txn-item" key={txn.id}>
                      <div className={`txn-icon ${txn.type}`}>
                        {txn.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <div className="txn-details">
                        <div className="txn-desc">{txn.description}</div>
                        <div className="txn-meta">
                          {txn.timestamp?.toDate ? format(txn.timestamp.toDate(), 'h:mm a') : ''}
                          {txn.type === 'expense' && txn.fromEssentials > 0 && ` · Essentials -₹${txn.fromEssentials}`}
                          {txn.type === 'expense' && txn.fromEnjoyment > 0 && ` · Enjoyment -₹${txn.fromEnjoyment}`}
                          {txn.type === 'expense' && txn.overspent > 0 && ` · ⚠️ Overspent ₹${txn.overspent}`}
                        </div>
                      </div>
                      <div className={`txn-amount ${txn.type}`}>
                        ₹{txn.amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      ) : (
        <>
          {loading ? (
            null
          ) : displayArchived.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <p>No past months found. Close your current month on the Dashboard to see it here.</p>
            </div>
          ) : (
            <div className="months-grid" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {displayArchived.map((period) => {
                let monthLabel = 'Past Month'
                if (period.closedAt?.toDate) {
                  monthLabel = format(period.closedAt.toDate(), 'MMMM yyyy')
                } else if (period.archiveKey) {
                  try {
                    const parsed = parse(period.archiveKey.substring(0, 10), 'yyyy-MM-dd', new Date())
                    monthLabel = format(parsed, 'MMMM yyyy')
                  } catch (e) {}
                }
                
                const inc = period.totalIncome || 0
                const exp = period.totalExpenses || 0
                const profit = inc - exp

                return (
                  <div key={period.id} className="month-card" style={{ background: '#fff', borderRadius: 24, padding: 24, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--gray-100)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--gray-900)', margin: 0 }}>{monthLabel}</h3>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Net Profit</div>
                          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            ₹{profit.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
                      <div className="stat-card" style={{ background: 'var(--gray-50)' }}>
                        <div className="stat-label">Income</div>
                        <div className="stat-value" style={{ color: 'var(--gray-900)' }}>₹{inc.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="stat-card" style={{ background: 'var(--gray-50)' }}>
                        <div className="stat-label">Expenses</div>
                        <div className="stat-value" style={{ color: 'var(--gray-900)' }}>₹{exp.toLocaleString('en-IN')}</div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--gray-50)', borderRadius: 16, padding: 16 }}>
                      <h4 style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--gray-600)', marginBottom: 12, margin: 0 }}>Bucket Summaries</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                        {['essentials', 'savings', 'growth', 'enjoyment'].map(b => {
                          const bucket = period.buckets?.[b] || { allocated: 0, spent: 0 }
                          const remaining = Math.max(0, bucket.allocated - bucket.spent)
                          return (
                            <div key={b} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 8 }}>
                              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--gray-600)', textTransform: 'capitalize' }}>{b}</span>
                              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--gray-900)' }}>
                                {b === 'savings' || b === 'growth' ? `₹${remaining.toLocaleString('en-IN')} Saved` : `₹${bucket.spent.toLocaleString('en-IN')} Spent`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {period.rolledToSavings > 0 && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(52, 199, 89, 0.1)', color: 'var(--success)', borderRadius: 8, fontSize: 'var(--fs-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ArrowUpRight size={16} />
                          ₹{period.rolledToSavings.toLocaleString('en-IN')} unused Essentials rolled to Savings!
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
      </div>
    </>
  )
}
