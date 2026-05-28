import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getOrCreateCurrentPeriod, subscribeToCurrentPeriod, getArchivedPeriods } from '../services/firestore'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { format, subDays } from 'date-fns'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'
import { Settings, Check } from 'lucide-react'
import { CinematicSplash, DEMO_DATA } from '../components/DemoMode'

const BUCKET_META = [
  { key: 'essentials', label: 'Essentials', emoji: '🟢', desc: 'Daily needs — food, transport, supplies. First line of spending.' },
  { key: 'savings', label: 'Savings', emoji: '🔵', desc: 'Your wealth engine. Compounding power. Protected but not untouchable.' },
  { key: 'growth', label: 'Growth', emoji: '🟡', desc: 'Invest in yourself — courses, tools, books, skills.' },
  { key: 'enjoyment', label: 'Enjoyment', emoji: '🎉', desc: 'Fun money. Quality over quantity.' }
]

const PIE_COLORS = ['#1a1a1a', '#000000', '#555555', '#999999']
const BAR_COLORS = { allocated: '#000000', spent: '#cccccc' }

export default function Buckets() {
  const { user } = useAuth()
  const [dayData, setDayData] = useState(null)
  const [allTimeTotals, setAllTimeTotals] = useState(null)
  const [weekData, setWeekData] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSplash, setShowSplash] = useState(true)
  const [animReady, setAnimReady] = useState(false)

  // Rule editing
  const [editingRules, setEditingRules] = useState(false)
  const [rules, setRules] = useState({ essentials: 10, savings: 60, growth: 25, enjoyment: 5 })
  const [savedRules, setSavedRules] = useState(null)

  const dateKey = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (!user) return
    setLoading(true)

    getOrCreateCurrentPeriod(user.uid).then(() => setLoading(false))

    const unsub = subscribeToCurrentPeriod(user.uid, (data) => {
      setDayData(data)
    })

    // Load all-time bucket totals from closed periods
    getArchivedPeriods(user.uid).then((docs) => {
      const totals = {
        essentials: { allocated: 0, spent: 0 },
        savings: { allocated: 0, spent: 0 },
        growth: { allocated: 0, spent: 0 },
        enjoyment: { allocated: 0, spent: 0 },
        totalRolled: 0,
        totalIncome: 0,
        totalExpenses: 0
      }
      docs.forEach(d => {
        totals.essentials.allocated += d.buckets?.essentials?.allocated || 0
        totals.essentials.spent += d.buckets?.essentials?.spent || 0
        totals.savings.allocated += d.buckets?.savings?.allocated || 0
        totals.savings.spent += d.buckets?.savings?.spent || 0
        totals.growth.allocated += d.buckets?.growth?.allocated || 0
        totals.growth.spent += d.buckets?.growth?.spent || 0
        totals.enjoyment.allocated += d.buckets?.enjoyment?.allocated || 0
        totals.enjoyment.spent += d.buckets?.enjoyment?.spent || 0
        totals.totalRolled += d.rolledToSavings || 0
        totals.totalIncome += d.totalIncome || 0
        totals.totalExpenses += d.totalExpenses || 0
      })
      setAllTimeTotals(totals)

      // Past Periods Data for Chart
      const data = docs.slice(0, 7).reverse().map(doc => {
        let label = 'Past'
        if (doc.closedAt?.toDate) {
          label = format(doc.closedAt.toDate(), 'MMM d')
        }
        return {
          date: label,
          Essentials: doc.buckets?.essentials?.allocated || 0,
          Savings: doc.buckets?.savings?.allocated || 0,
          Growth: doc.buckets?.growth?.allocated || 0,
          Enjoyment: doc.buckets?.enjoyment?.allocated || 0
        }
      })
      setWeekData(data)
    })

    // Load saved rules
    loadRules(user.uid)

    return unsub
  }, [user, dateKey])

  const loadRules = async (uid) => {
    try {
      const ref = doc(db, 'users', uid, 'settings', 'rules')
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setRules(data)
        setSavedRules(data)
      }
    } catch (e) {
      console.error('Failed to load rules:', e)
    }
  }

  const saveRules = async () => {
    const total = rules.essentials + rules.savings + rules.growth + rules.enjoyment
    if (total !== 100) {
      alert(`Percentages must add up to 100%. Currently: ${total}%`)
      return
    }
    try {
      const ref = doc(db, 'users', user.uid, 'settings', 'rules')
      await setDoc(ref, rules)
      setSavedRules(rules)
      setEditingRules(false)
    } catch (e) {
      console.error('Failed to save rules:', e)
    }
  }

  const handleRuleChange = (key, value) => {
    const num = parseInt(value) || 0
    setRules(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, num)) }))
  }

  const ruleTotal = rules.essentials + rules.savings + rules.growth + rules.enjoyment

  const displayDayData = dayData && dayData.buckets ? dayData : {
    buckets: DEMO_DATA.buckets,
    rolledToSavings: 1200
  }

  const buckets = displayDayData.buckets || {
    essentials: { allocated: 0, spent: 0 },
    savings: { allocated: 0, spent: 0 },
    growth: { allocated: 0, spent: 0 },
    enjoyment: { allocated: 0, spent: 0 }
  }

  const displayAllTimeTotals = allTimeTotals && allTimeTotals.totalIncome > 0 ? allTimeTotals : {
    essentials: { allocated: 150000, spent: 142000 },
    savings: { allocated: 900000, spent: 0 },
    growth: { allocated: 375000, spent: 300000 },
    enjoyment: { allocated: 75000, spent: 70000 },
    totalRolled: 25000,
    totalIncome: 1500000,
    totalExpenses: 512000
  }

  const displayWeekData = weekData.length > 0 ? weekData : [
    { date: 'Jan 31', Essentials: 18000, Savings: 108000, Growth: 45000, Enjoyment: 9000 },
    { date: 'Feb 28', Essentials: 18500, Savings: 111000, Growth: 46250, Enjoyment: 9250 },
    { date: 'Mar 31', Essentials: 19000, Savings: 114000, Growth: 47500, Enjoyment: 9500 },
    { date: 'Apr 30', Essentials: 18750, Savings: 112500, Growth: 46875, Enjoyment: 9375 },
  ]

  // Pie chart data for today
  const todayPieData = BUCKET_META.map(({ key, label }) => {
    const remaining = Math.max(0, (buckets[key]?.allocated || 0) - (buckets[key]?.spent || 0))
    return { name: label, value: remaining }
  }).filter(d => d.value > 0)

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#000', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.75rem' }}>
        <div><strong>{payload[0].name}</strong></div>
        <div>₹{payload[0].value.toLocaleString('en-IN')}</div>
      </div>
    )
  }

  if (loading) {
    return <div className="loading-screen" style={{ minHeight: 400 }}><div className="loader" /></div>
  }

  return (
    <>
      {showSplash && (
        <CinematicSplash onDone={() => {
          setShowSplash(false)
          setTimeout(() => setAnimReady(true), 100)
        }} />
      )}
      <div className={`dashboard-wrapper ${!showSplash ? 'ready' : ''}`}>
      <div className="page-header">
        <h2>Buckets</h2>
        <div className="subtitle">Your money allocation system</div>
      </div>

      {/* Today's Buckets — the hero section */}
      <h3 className="buckets-heading">Current Period — Active</h3>
      <div className="bucket-detail-grid">
        {BUCKET_META.map(({ key, label, emoji, desc }) => {
          const bucket = buckets[key]
          const allocated = bucket?.allocated || 0
          const spent = bucket?.spent || 0
          const remaining = Math.max(0, allocated - spent)
          const spentPct = allocated > 0 ? (spent / allocated) * 100 : 0
          const isEmpty = remaining <= 0 && allocated > 0

          return (
            <div className={`bucket-detail-card ${isEmpty ? 'depleted' : ''}`} key={key}>
              <div className="bucket-detail-top">
                <div className="bucket-detail-emoji">{emoji}</div>
                <div className="bucket-detail-info">
                  <div className="bucket-detail-name">{label}</div>
                  <div className="bucket-detail-pct">{rules[key]}% of income</div>
                </div>
              </div>

              <div className="bucket-detail-amount">
                <span className="currency">₹</span>
                {remaining.toLocaleString('en-IN')}
                <span className="bucket-detail-amount-label">
                  {isEmpty ? 'empty' : 'remaining'}
                </span>
              </div>

              <div className="bucket-detail-progress">
                <div className="bucket-detail-bar-track">
                  <div
                    className={`bucket-detail-bar-fill ${spentPct > 90 ? 'critical' : ''}`}
                    style={{ width: `${Math.min(spentPct, 100)}%` }}
                  />
                </div>
                <div className="bucket-detail-stats">
                  <span>₹{spent.toLocaleString('en-IN')} spent</span>
                  <span>₹{allocated.toLocaleString('en-IN')} total</span>
                </div>
              </div>

              <div className="bucket-detail-desc">{desc}</div>

              {displayDayData?.rolledToSavings > 0 && key === 'savings' && (
                <div className="bucket-rolled-notice">
                  +₹{displayDayData.rolledToSavings.toLocaleString('en-IN')} rolled from Essentials
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Charts Section */}
      <div className="bucket-charts-grid">
        {/* Today's Remaining Pie */}
        <div className="insight-card">
          <h4>Current Remaining Balance</h4>
          <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {todayPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={todayPieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {todayPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                <p>All buckets are empty or no income logged.</p>
              </div>
            )}
          </div>
          {todayPieData.length > 0 && (
            <div className="pie-legend">
              {todayPieData.map((d, i) => (
                <div key={d.name} className="pie-legend-item">
                  <span className="pie-legend-dot" style={{ background: PIE_COLORS[i] }} />
                  <span>{d.name}</span>
                  <span className="pie-legend-value">₹{d.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly Allocation Breakdown */}
        <div className="insight-card">
          <h4>Past Periods Allocation</h4>
          <div className="chart-wrap">
            {displayWeekData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayWeekData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#999" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip
                    contentStyle={{ background: '#000', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.75rem' }}
                    formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                  />
                  <Bar dataKey="Savings" stackId="a" fill="#000" />
                  <Bar dataKey="Growth" stackId="a" fill="#555" />
                  <Bar dataKey="Essentials" stackId="a" fill="#999" />
                  <Bar dataKey="Enjoyment" stackId="a" fill="#ccc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                <p>No past periods found.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* All-Time Totals */}
      {displayAllTimeTotals && (
        <>
          <h3 className="buckets-heading" style={{ marginTop: 48 }}>All-Time Totals (Closed Periods)</h3>
          <div className="alltime-grid">
            <div className="alltime-card">
              <div className="alltime-label">🔵 Net Savings</div>
              <div className="alltime-value">
                <span className="currency">₹</span>{(displayAllTimeTotals.savings.allocated - displayAllTimeTotals.savings.spent).toLocaleString('en-IN')}
              </div>
              <div className="alltime-sub">Allocated: ₹{displayAllTimeTotals.savings.allocated.toLocaleString('en-IN')}</div>
            </div>
            <div className="alltime-card">
              <div className="alltime-label">🟡 Net Growth</div>
              <div className="alltime-value">
                <span className="currency">₹</span>{(displayAllTimeTotals.growth.allocated - displayAllTimeTotals.growth.spent).toLocaleString('en-IN')}
              </div>
              <div className="alltime-sub">Allocated: ₹{displayAllTimeTotals.growth.allocated.toLocaleString('en-IN')}</div>
            </div>
            <div className="alltime-card">
              <div className="alltime-label">💰 Total Saved</div>
              <div className="alltime-value">
                <span className="currency">₹</span>{(displayAllTimeTotals.totalIncome - displayAllTimeTotals.totalExpenses).toLocaleString('en-IN')}
              </div>
              <div className="alltime-sub">Income − Expenses</div>
            </div>
            <div className="alltime-card">
              <div className="alltime-label">↩️ Rolled to Savings</div>
              <div className="alltime-value">
                <span className="currency">₹</span>{displayAllTimeTotals.totalRolled.toLocaleString('en-IN')}
              </div>
              <div className="alltime-sub">From unused Essentials</div>
            </div>
          </div>
        </>
      )}

      {/* Spending Flow */}
      <div className="spending-flow-card">
        <h4>How Spending Works</h4>
        <div className="flow-steps">
          <div className="flow-step">
            <div className="flow-step-num">1</div>
            <div>
              <strong>Essentials first</strong>
              <p>Every expense pulls from your Essentials bucket first.</p>
            </div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">2</div>
            <div>
              <strong>Enjoyment backup</strong>
              <p>If Essentials is empty, spending falls to Enjoyment.</p>
            </div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">3</div>
            <div>
              <strong>Warning + Growth</strong>
              <p>If both are empty, you get a warning. Spending eats into Growth.</p>
            </div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">4</div>
            <div>
              <strong>Last resort: Savings</strong>
              <p>If Growth is also gone, spending hits your Savings. This is critical — stop immediately.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Editable Rule Table — at the bottom */}
      <div className="rule-table-card">
        <div className="rule-table-header">
          <h4>Allocation Rule</h4>
          {!editingRules ? (
            <button className="rule-edit-btn" onClick={() => setEditingRules(true)} id="edit-rules-btn">
              <Settings size={14} />
              Adjust
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`rule-total ${ruleTotal === 100 ? 'valid' : 'invalid'}`}>
                {ruleTotal}%
              </span>
              <button
                className="rule-save-btn"
                onClick={saveRules}
                disabled={ruleTotal !== 100}
                id="save-rules-btn"
              >
                <Check size={14} />
                Save
              </button>
              <button className="rule-cancel-btn" onClick={() => { setRules(savedRules || { essentials: 10, savings: 60, growth: 25, enjoyment: 5 }); setEditingRules(false) }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="rule-table-body">
          {BUCKET_META.map(({ key, label, emoji }) => (
            <div className="rule-table-row" key={key}>
              <div className="rule-table-label">
                <span>{emoji}</span>
                <span>{label}</span>
              </div>
              <div className="rule-table-bar-wrap">
                <div className="rule-bar-track">
                  <div
                    className="rule-bar-fill"
                    style={{
                      width: `${rules[key]}%`,
                      background: key === 'savings' ? '#000' : key === 'growth' ? '#444' : key === 'essentials' ? '#888' : '#bbb'
                    }}
                  />
                </div>
              </div>
              <div className="rule-table-value">
                {editingRules ? (
                  <input
                    type="number"
                    className="rule-input"
                    value={rules[key]}
                    onChange={(e) => handleRuleChange(key, e.target.value)}
                    min="0"
                    max="100"
                  />
                ) : (
                  <span className="rule-pct">{rules[key]}%</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rule-table-footnote">
          Unused Essentials automatically move to Savings at midnight. Total must equal 100%.
        </div>
      </div>
      </div>
    </>
  )
}
