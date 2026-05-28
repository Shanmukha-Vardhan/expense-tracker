import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getDailySummariesFromTransactions, getCumulativeSavings, getOrCreateCurrentPeriod,
  getLastClosedPeriod, getMonthlyReportData, getAllTransactionsForHeatmap
} from '../services/firestore'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { format, subDays, startOfMonth, eachDayOfInterval, getDay, addDays } from 'date-fns'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid
} from 'recharts'
import { Target, TrendingUp, TrendingDown, ArrowRight, Download, Share2 } from 'lucide-react'
import { CinematicSplash, DEMO_DATA } from '../components/DemoMode'

const COLORS = ['#000000', '#444444', '#888888', '#CCCCCC']

const TIPS = [
  { icon: '💡', text: 'Your Savings bucket (60%) is your wealth engine. Never touch it for daily expenses. Let it compound.' },
  { icon: '📊', text: 'Track your spending patterns weekly. Small daily leaks can drain significant amounts over a month.' },
  { icon: '🎯', text: 'The Growth bucket (25%) is for investments in yourself — courses, tools, books. Spend it wisely for maximum ROI.' },
  { icon: '⚡', text: 'If Essentials are unused at period end, they roll into Savings automatically. The system rewards your discipline.' },
  { icon: '🛡️', text: 'Keep Enjoyment spending intentional. 5% should feel good, not wasteful. Quality over quantity.' }
]

export default function Insights() {
  const { user } = useAuth()
  const [dailySummaries, setDailySummaries] = useState([])
  const [cumulative, setCumulative] = useState({ totalSavings: 0, totalGrowth: 0 })
  const [currentPeriod, setCurrentPeriod] = useState(null)
  const [savingsGoal, setSavingsGoal] = useState(0)
  const [goalInput, setGoalInput] = useState('')
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastPeriod, setLastPeriod] = useState(null)
  const [reportData, setReportData] = useState(null)
  const [heatmapData, setHeatmapData] = useState([])
  const [showSnapshot, setShowSnapshot] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [animReady, setAnimReady] = useState(false)
  const snapshotRef = useRef(null)

  useEffect(() => {
    if (!user) return
    setLoading(false) // Force skip loading for demo

    // Mock fetches for demo
    getOrCreateCurrentPeriod(user.uid).catch(() => {})
  }, [user])

  const buildHeatmap = (txns) => {
    const dayMap = {}
    txns.forEach(t => {
      if (t.type === 'expense') {
        dayMap[t.date] = (dayMap[t.date] || 0) + t.amount
      }
    })
    setHeatmapData(dayMap)
  }

  const loadSavingsGoal = async (uid) => {
    const ref = doc(db, 'users', uid, 'settings', 'goals')
    const snap = await getDoc(ref)
    return snap.exists() ? (snap.data().savingsGoal || 0) : 0
  }

  const handleSetGoal = async () => {
    const goal = parseFloat(goalInput)
    if (!goal || goal <= 0) return
    const ref = doc(db, 'users', user.uid, 'settings', 'goals')
    await setDoc(ref, { savingsGoal: goal }, { merge: true })
    setSavingsGoal(goal)
    setShowGoalModal(false)
    setGoalInput('')
  }

  const chartData = DEMO_DATA.weekData.map(d => ({
    date: d.date.length <= 3 ? d.date : format(new Date(d.date + 'T00:00:00'), 'MMM d'),
    income: d.income || 0,
    expenses: d.expenses || 0,
    profit: (d.income || 0) - (d.expenses || 0)
  }))

  const displayPeriod = {
    totalIncome: DEMO_DATA.totalIncome,
    totalExpenses: DEMO_DATA.totalExpenses,
    buckets: DEMO_DATA.buckets,
    startedAt: { toDate: () => DEMO_DATA.startedAt }
  }

  const buckets = displayPeriod.buckets || {}
  const bucketTotals = {
    essentials: buckets.essentials?.allocated || 0,
    savings: buckets.savings?.allocated || 0,
    growth: buckets.growth?.allocated || 0,
    enjoyment: buckets.enjoyment?.allocated || 0
  }

  const pieData = [
    { name: 'Essentials', value: bucketTotals.essentials },
    { name: 'Savings', value: bucketTotals.savings },
    { name: 'Growth', value: bucketTotals.growth },
    { name: 'Enjoyment', value: bucketTotals.enjoyment }
  ].filter(d => d.value > 0)

  const totalEssentialsAllocated = buckets.essentials?.allocated || 0
  const totalEssentialsSpent = buckets.essentials?.spent || 0
  const essentialsSaved = totalEssentialsAllocated - totalEssentialsSpent
  const efficiencyPct = totalEssentialsAllocated > 0 ? ((essentialsSaved / totalEssentialsAllocated) * 100).toFixed(0) : 0

  const displaySavings = DEMO_DATA.totalSaved
  const displayGoal = savingsGoal > 0 ? savingsGoal : 500000
  const goalProgress = (displaySavings / displayGoal) * 100

  const dynamicTips = [...TIPS]
  if (efficiencyPct > 50) {
    dynamicTips.unshift({ icon: '🏆', text: `Excellent! You saved ${efficiencyPct}% of your Essentials this period. That's discipline.` })
  }
  const displayDailySummaries = DEMO_DATA.weekData
  if (displayDailySummaries.length > 0) {
    const avgIncome = displayDailySummaries.reduce((s, d) => s + (d.income || 0), 0) / displayDailySummaries.length
    dynamicTips.unshift({ icon: '📈', text: `Your average daily income (last 30 days): ₹${avgIncome.toFixed(0)}. Keep the momentum going.` })
  }

  // Smart Spending Forecast
  const currentIncome = displayPeriod.totalIncome || 0
  const currentExpenses = displayPeriod.totalExpenses || 0
  const periodStart = displayPeriod.startedAt?.toDate?.()
  const daysSinceStart = periodStart ? Math.max(1, Math.ceil((Date.now() - periodStart.getTime()) / (1000 * 60 * 60 * 24))) : 1
  const avgDailySpend = currentExpenses / daysSinceStart
  const daysInMonth = 30
  const projectedExpenses = avgDailySpend * daysInMonth
  const projectedSavings = currentIncome - projectedExpenses
  const daysUntilOverspend = currentIncome > currentExpenses && avgDailySpend > 0
    ? Math.floor((currentIncome - currentExpenses) / avgDailySpend)
    : avgDailySpend === 0 ? 999 : 0

  // Spending Heatmap
  const today = new Date()
  const heatmapStart = subDays(today, 83) // ~12 weeks
  const heatmapDays = eachDayOfInterval({ start: heatmapStart, end: today })
  
  const displayHeatmapData = DEMO_DATA.transactions.reduce((acc, t) => {
    if (t.type === 'expense') acc[t.date] = (acc[t.date] || 0) + t.amount
    return acc
  }, {})
  const maxSpend = Math.max(1, ...Object.values(displayHeatmapData))

  const getHeatColor = (amount) => {
    if (!amount || amount === 0) return 'var(--gray-100)'
    const intensity = Math.min(amount / maxSpend, 1)
    if (intensity < 0.25) return '#d0d0d0'
    if (intensity < 0.5) return '#999999'
    if (intensity < 0.75) return '#555555'
    return '#000000'
  }

  // Period Comparison
  const displayLastPeriod = { totalIncome: 165000, totalExpenses: 52000 }
  const lastIncome = displayLastPeriod.totalIncome || 0
  const lastExpenses = displayLastPeriod.totalExpenses || 0
  const lastProfit = lastIncome - lastExpenses
  const currentProfit = currentIncome - currentExpenses
  const incomeDelta = lastIncome > 0 ? (((currentIncome - lastIncome) / lastIncome) * 100).toFixed(1) : 0
  const expenseDelta = lastExpenses > 0 ? (((currentExpenses - lastExpenses) / lastExpenses) * 100).toFixed(1) : 0

  if (loading) return null

  const finalReportData = {
    grades: { overall: 'A', savings: 'A+', discipline: 'B+', consistency: 'A' },
    savingsRate: 75,
    essEfficiency: 47,
    streak: DEMO_DATA.streak,
    totalIncome: DEMO_DATA.totalIncome,
    totalExpenses: DEMO_DATA.totalExpenses,
    profit: DEMO_DATA.profit
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#000', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.75rem', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
        {payload.map(p => <div key={p.name}>{p.name}: ₹{p.value.toLocaleString('en-IN')}</div>)}
      </div>
    )
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
        <h2>Insights</h2>
        <div className="subtitle">Analytics · Forecast · Report Card</div>
      </div>

      {/* ═══ SPENDING HEATMAP ═══ */}
      <div className="insight-card" style={{ marginBottom: 24 }}>
        <h4>🗓️ Spending Heatmap (Last 12 Weeks)</h4>
        <div className="heatmap-container">
          <div className="heatmap-labels">
            {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
              <div key={i} className="heatmap-day-label">{d}</div>
            ))}
          </div>
          <div className="heatmap-grid">
            {heatmapDays.map(day => {
              const key = format(day, 'yyyy-MM-dd')
              const amount = displayHeatmapData[key] || 0
              return (
                <div key={key} className="heatmap-cell" title={`${format(day, 'MMM d')}: ₹${amount.toLocaleString('en-IN')}`}
                  style={{ background: getHeatColor(amount) }} />
              )
            })}
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            <div className="heatmap-cell" style={{ background: 'var(--gray-100)' }} />
            <div className="heatmap-cell" style={{ background: '#d0d0d0' }} />
            <div className="heatmap-cell" style={{ background: '#999' }} />
            <div className="heatmap-cell" style={{ background: '#555' }} />
            <div className="heatmap-cell" style={{ background: '#000' }} />
            <span>More</span>
          </div>
        </div>
      </div>

      {/* ═══ SPENDING vs LAST PERIOD ═══ */}
      {displayLastPeriod && (
        <div className="insight-card" style={{ marginBottom: 24 }}>
          <h4>📊 Current vs Last Period</h4>
          <div className="comparison-grid">
            <ComparisonCard label="Income" current={currentIncome} previous={lastIncome} delta={incomeDelta} />
            <ComparisonCard label="Expenses" current={currentExpenses} previous={lastExpenses} delta={expenseDelta} inverted />
            <ComparisonCard label="Profit" current={currentProfit} previous={lastProfit}
              delta={lastProfit !== 0 ? (((currentProfit - lastProfit) / Math.abs(lastProfit)) * 100).toFixed(1) : 0} />
          </div>
        </div>
      )}

      {/* ═══ SMART SPENDING FORECAST ═══ */}
      <div className="insight-card" style={{ marginBottom: 24 }}>
        <h4>🔮 Smart Spending Forecast</h4>
        <div className="forecast-grid">
          <div className="forecast-item">
            <div className="forecast-label">Avg Daily Spend</div>
            <div className="forecast-value">₹{avgDailySpend.toFixed(0)}</div>
          </div>
          <div className="forecast-item">
            <div className="forecast-label">Projected 30-Day Expenses</div>
            <div className="forecast-value">₹{projectedExpenses.toFixed(0)}</div>
          </div>
          <div className="forecast-item">
            <div className="forecast-label">Projected Savings</div>
            <div className="forecast-value" style={{ color: projectedSavings >= 0 ? 'var(--gray-900)' : '#c00' }}>
              ₹{projectedSavings.toFixed(0)}
            </div>
          </div>
          <div className="forecast-item">
            <div className="forecast-label">Days Until Budget Depleted</div>
            <div className="forecast-value">
              {daysUntilOverspend >= 999 ? '∞ Safe' : daysUntilOverspend <= 0 ? '⚠️ Overspent' : `${daysUntilOverspend} days`}
            </div>
          </div>
        </div>
        {avgDailySpend > 0 && (
          <div className="forecast-insight">
            {projectedSavings >= 0
              ? `At your current rate of ₹${avgDailySpend.toFixed(0)}/day, you'll save ₹${projectedSavings.toFixed(0)} this month. Keep going! 🚀`
              : `⚠️ At ₹${avgDailySpend.toFixed(0)}/day, you'll overspend by ₹${Math.abs(projectedSavings).toFixed(0)} this month. Cut back now!`
            }
          </div>
        )}
      </div>

      {/* ═══ REPORT CARD ═══ */}
      {finalReportData && (
        <div className="insight-card report-card-section" style={{ marginBottom: 24 }} ref={snapshotRef}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4>📋 Monthly Report Card</h4>
            <button className="action-btn" style={{ padding: '6px 14px', fontSize: 'var(--fs-xs)' }}
              onClick={() => setShowSnapshot(true)} id="share-report-btn">
              <Share2 size={14} /> Share
            </button>
          </div>
          <div className="report-overall">
            <div className="report-overall-grade">{finalReportData.grades.overall}</div>
            <div className="report-overall-label">Overall Grade</div>
          </div>
          <div className="report-grades-grid">
            <ReportGradeCard label="Savings Rate" grade={finalReportData.grades.savings} detail={`${finalReportData.savingsRate}% saved`} />
            <ReportGradeCard label="Bucket Discipline" grade={finalReportData.grades.discipline} detail={`${finalReportData.essEfficiency}% essentials saved`} />
            <ReportGradeCard label="Consistency" grade={finalReportData.grades.consistency} detail={`${finalReportData.streak} day streak`} />
          </div>
          <div className="report-summary-row">
            <div><strong>Income:</strong> ₹{finalReportData.totalIncome.toLocaleString('en-IN')}</div>
            <div><strong>Expenses:</strong> ₹{finalReportData.totalExpenses.toLocaleString('en-IN')}</div>
            <div><strong>Net:</strong> ₹{finalReportData.profit.toLocaleString('en-IN')}</div>
          </div>
        </div>
      )}

      {/* ═══ SAVINGS GOAL ═══ */}
      <div className="savings-goal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Savings Goal</h4>
          <button className="action-btn" style={{ padding: '6px 16px', fontSize: 'var(--fs-xs)' }}
            onClick={() => setShowGoalModal(true)} id="set-goal-btn">
            <Target size={14} /> {displayGoal > 0 ? 'Update Goal' : 'Set Goal'}
          </button>
        </div>
        {displayGoal > 0 ? (
          <>
            <div className="goal-bar-track">
              <div className="goal-bar-fill anim-bar" style={{ '--target-width': `${Math.min(goalProgress, 100)}%` }} />
            </div>
            <div className="goal-stats">
              <span className="current">₹{displaySavings.toLocaleString('en-IN')}</span>
              <span>{goalProgress.toFixed(1)}%</span>
              <span>₹{displayGoal.toLocaleString('en-IN')}</span>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-sm)', marginTop: 8 }}>
            Set a savings goal to track your progress toward financial freedom.
          </p>
        )}
      </div>

      {/* ═══ CHARTS ═══ */}
      <div className="insights-grid">
        <div className="insight-card">
          <h4>Income vs Expenses</h4>
          <div className="chart-wrap">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#999" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="income" fill="#000" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#ccc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty-state" style={{ padding: 40 }}><p>No data yet.</p></div>}
          </div>
        </div>

        <div className="insight-card">
          <h4>Daily Profit Trend</h4>
          <div className="chart-wrap">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#999" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="profit" stroke="#000" strokeWidth={2} dot={{ r: 3, fill: '#000' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="empty-state" style={{ padding: 40 }}><p>No data yet.</p></div>}
          </div>
        </div>

        <div className="insight-card">
          <h4>Essentials Efficiency</h4>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 250, textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--fs-hero)', fontWeight: 900, letterSpacing: -3, lineHeight: 1 }}>{efficiencyPct}%</div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--gray-500)', marginTop: 8 }}>of Essentials budget saved</div>
            <div style={{ fontSize: 'var(--fs-sm)', marginTop: 16 }}>
              <span style={{ fontWeight: 700 }}>₹{essentialsSaved.toLocaleString('en-IN')}</span> rolled to Savings
            </div>
          </div>
        </div>

        <div className="insight-card">
          <h4>Bucket Distribution (Current)</h4>
          <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                    paddingAngle={2} strokeWidth={0}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="empty-state" style={{ padding: 40 }}><p>No data this month.</p></div>}
          </div>
        </div>
      </div>

      {/* ═══ TIPS ═══ */}
      <div className="transactions-section">
        <h3>Financial Insights</h3>
        <div className="tips-list">
          {dynamicTips.slice(0, 6).map((tip, i) => (
            <div className="tip-item" key={i}><span className="tip-icon">{tip.icon}</span><span>{tip.text}</span></div>
          ))}
        </div>
      </div>

      {/* ═══ SNAPSHOT MODAL ═══ */}
      {showSnapshot && finalReportData && (
        <div className="modal-overlay" onClick={() => setShowSnapshot(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>📸 Snapshot Card</h3>
            <div className="snapshot-card" id="snapshot-card">
              <div className="snapshot-brand">dwm.</div>
              <div className="snapshot-grade">{finalReportData.grades.overall}</div>
              <div className="snapshot-grade-label">Overall Grade</div>
              <div className="snapshot-stats">
                <div><span>Income</span><strong>₹{finalReportData.totalIncome.toLocaleString('en-IN')}</strong></div>
                <div><span>Expenses</span><strong>₹{finalReportData.totalExpenses.toLocaleString('en-IN')}</strong></div>
                <div><span>Saved</span><strong>₹{finalReportData.profit.toLocaleString('en-IN')}</strong></div>
              </div>
              <div className="snapshot-badges">
                <span>💰 {finalReportData.savingsRate}% saved</span>
                <span>🔥 {finalReportData.streak} day streak</span>
                <span>🛡️ {finalReportData.essEfficiency}% discipline</span>
              </div>
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--gray-500)', marginTop: 12, textAlign: 'center' }}>
              Screenshot this card to share your financial stats!
            </p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowSnapshot(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ GOAL MODAL ═══ */}
      {showGoalModal && (
        <div className="modal-overlay" onClick={() => setShowGoalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Set Savings Goal</h3>
            <div className="form-group">
              <label>Target Amount (₹)</label>
              <input type="number" placeholder="e.g., 100000" value={goalInput}
                onChange={e => setGoalInput(e.target.value)} autoFocus id="goal-amount" />
            </div>
            {goalInput && parseFloat(goalInput) > 0 && (
              <div style={{ padding: 'var(--space-md)', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-sm)', color: 'var(--gray-600)', marginBottom: 'var(--space-md)' }}>
                Current savings: ₹{displaySavings.toLocaleString('en-IN')} ·
                Remaining: ₹{Math.max(0, parseFloat(goalInput) - displaySavings).toLocaleString('en-IN')}
              </div>
            )}
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowGoalModal(false)}>Cancel</button>
              <button className="submit-btn" onClick={handleSetGoal}
                disabled={!goalInput || parseFloat(goalInput) <= 0} id="goal-submit">Set Goal</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}

/* ── Comparison Card ── */
function ComparisonCard({ label, current, previous, delta, inverted = false }) {
  const isPositive = inverted ? delta < 0 : delta > 0
  return (
    <div className="comparison-card">
      <div className="comparison-label">{label}</div>
      <div className="comparison-current">₹{current.toLocaleString('en-IN')}</div>
      <div className="comparison-prev">vs ₹{previous.toLocaleString('en-IN')}</div>
      <div className={`comparison-delta ${isPositive ? 'positive' : delta == 0 ? '' : 'negative'}`}>
        {delta > 0 ? <TrendingUp size={14} /> : delta < 0 ? <TrendingDown size={14} /> : null}
        {delta > 0 ? '+' : ''}{delta}%
      </div>
    </div>
  )
}

/* ── Report Grade Card ── */
function ReportGradeCard({ label, grade, detail }) {
  return (
    <div className="report-grade-card">
      <div className="report-grade-letter">{grade}</div>
      <div className="report-grade-label">{label}</div>
      <div className="report-grade-detail">{detail}</div>
    </div>
  )
}
