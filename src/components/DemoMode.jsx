import { useEffect, useState } from 'react'

/* ── Cinematic Splash ── */
export function CinematicSplash({ onDone }) {
  useEffect(() => {
    // Remove from DOM after animation completes (1.8s delay + 0.7s exit = 2.5s)
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="cinematic-splash">
      <div className="splash-logo">dwm.</div>
      <div className="splash-line" />
      <div className="splash-sub">Your money. Your rules.</div>
    </div>
  )
}

/* ── Fake demo data for Instagram recording ── */
export const DEMO_DATA = {
  totalIncome: 187500,
  totalExpenses: 42380,
  profit: 145120,
  totalSaved: 412800,
  streak: 23,
  emiBurden: 18000,

  weekData: [
    { date: 'Mon', income: 12000, expenses: 3200 },
    { date: 'Tue', income: 8500,  expenses: 5100 },
    { date: 'Wed', income: 22000, expenses: 4800 },
    { date: 'Thu', income: 6000,  expenses: 2900 },
    { date: 'Fri', income: 18000, expenses: 6700 },
    { date: 'Sat', income: 9500,  expenses: 8200 },
    { date: 'Sun', income: 15000, expenses: 3100 },
  ],

  pieData: [
    { name: 'Essentials',  value: 18750 },
    { name: 'Savings',     value: 112500 },
    { name: 'Growth',      value: 46875 },
    { name: 'Enjoyment',   value: 9375 },
  ],

  transactions: [
    { id: 't1',  type: 'income',  description: 'Client Project — Avolve Studio',  amount: 95000,  date: '2026-05-10', timestamp: null },
    { id: 't2',  type: 'income',  description: 'Freelance — UI/UX Sprint',         amount: 42500,  date: '2026-05-08', timestamp: null },
    { id: 't3',  type: 'expense', description: 'AWS Cloud Services',               amount: 4200,   date: '2026-05-09', timestamp: null },
    { id: 't4',  type: 'income',  description: 'SaaS Subscription Revenue',        amount: 28000,  date: '2026-05-07', timestamp: null },
    { id: 't5',  type: 'expense', description: 'Figma + Linear + Notion',          amount: 3180,   date: '2026-05-07', timestamp: null },
    { id: 't6',  type: 'income',  description: 'Consulting — Startup Audit',       amount: 22000,  date: '2026-05-05', timestamp: null },
    { id: 't7',  type: 'expense', description: 'Team Lunch — Project Closeout',    amount: 2800,   date: '2026-05-06', timestamp: null },
    { id: 't8',  type: 'expense', description: 'Books + Online Courses',           amount: 4500,   date: '2026-05-04', timestamp: null },
    { id: 't9',  type: 'income',  description: 'Affiliate Commission',             amount: 8700,   date: '2026-05-03', timestamp: null },
    { id: 't10', type: 'expense', description: 'Adobe CC Annual',                  amount: 5800,   date: '2026-05-02', timestamp: null },
    { id: 't11', type: 'income',  description: 'YouTube AdSense — April',          amount: 3200,   date: '2026-05-01', timestamp: null },
    { id: 't12', type: 'expense', description: 'Gym Membership',                   amount: 2100,   date: '2026-05-01', timestamp: null },
    { id: 't13', type: 'expense', description: 'Groceries + Essentials',           amount: 4800,   date: '2026-04-30', timestamp: null },
    { id: 't14', type: 'income',  description: 'Product Hunt Launch Bonus',        amount: 12000,  date: '2026-04-29', timestamp: null },
    { id: 't15', type: 'expense', description: 'Domain + Hosting Renewal',         amount: 3200,   date: '2026-04-28', timestamp: null },
  ],

  buckets: {
    essentials: { allocated: 18750, spent: 9800 },
    savings:    { allocated: 112500 },
    growth:     { allocated: 46875 },
    enjoyment:  { allocated: 9375, spent: 5200 },
  },

  startedAt: new Date('2026-05-01'),
}
