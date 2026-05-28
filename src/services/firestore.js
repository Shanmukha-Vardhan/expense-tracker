import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy,
  getDocs, onSnapshot, Timestamp
} from 'firebase/firestore'
import { db } from './firebase'
import { format } from 'date-fns'

const ALLOCATION = {
  essentials: 0.10,
  savings: 0.60,
  growth: 0.25,
  enjoyment: 0.05
}

/* ── helpers ── */
export const todayKey = () => format(new Date(), 'yyyy-MM-dd')

const currentPeriodRef = (uid) => doc(db, 'users', uid, 'periods', 'current')

const txnCol = (uid) => collection(db, 'users', uid, 'transactions')

/* ── user profile ── */
export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: Timestamp.now()
    })
  }
}

/* ── get or create current period doc ── */
export async function getOrCreateCurrentPeriod(uid) {
  const ref = currentPeriodRef(uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return { id: 'current', ...snap.data() }

  const fresh = {
    totalIncome: 0,
    totalExpenses: 0,
    buckets: {
      essentials: { allocated: 0, spent: 0 },
      savings: { allocated: 0, spent: 0 },
      growth: { allocated: 0, spent: 0 },
      enjoyment: { allocated: 0, spent: 0 }
    },
    startedAt: Timestamp.now()
  }
  await setDoc(ref, fresh)
  return { id: 'current', ...fresh }
}

/* ── add income ── */
export async function addIncome(uid, amount, description = '') {
  const period = await getOrCreateCurrentPeriod(uid)
  const ref = currentPeriodRef(uid)
  const key = todayKey()

  const essentialsAdd = Math.round(amount * ALLOCATION.essentials * 100) / 100
  const savingsAdd = Math.round(amount * ALLOCATION.savings * 100) / 100
  const growthAdd = Math.round(amount * ALLOCATION.growth * 100) / 100
  const enjoymentAdd = Math.round((amount - essentialsAdd - savingsAdd - growthAdd) * 100) / 100

  await updateDoc(ref, {
    totalIncome: period.totalIncome + amount,
    'buckets.essentials.allocated': period.buckets.essentials.allocated + essentialsAdd,
    'buckets.savings.allocated': period.buckets.savings.allocated + savingsAdd,
    'buckets.growth.allocated': period.buckets.growth.allocated + growthAdd,
    'buckets.enjoyment.allocated': period.buckets.enjoyment.allocated + enjoymentAdd
  })

  const txnRef = await addDoc(txnCol(uid), {
    type: 'income',
    amount,
    description: description || 'Income',
    date: key,
    timestamp: Timestamp.now(),
    allocation: { essentials: essentialsAdd, savings: savingsAdd, growth: growthAdd, enjoyment: enjoymentAdd }
  })

  return { txnId: txnRef.id }
}

/* ── add expense ── */
export async function addExpense(uid, amount, description = '') {
  const period = await getOrCreateCurrentPeriod(uid)
  const ref = currentPeriodRef(uid)
  const key = todayKey()

  const essR = Math.max(0, (period.buckets.essentials.allocated || 0) - (period.buckets.essentials.spent || 0))
  const enjR = Math.max(0, (period.buckets.enjoyment.allocated || 0) - (period.buckets.enjoyment.spent || 0))
  const groR = Math.max(0, (period.buckets.growth.allocated || 0) - (period.buckets.growth.spent || 0))
  const savR = Math.max(0, (period.buckets.savings.allocated || 0) - (period.buckets.savings.spent || 0))

  let remaining = amount
  let fromEssentials = 0, fromEnjoyment = 0, fromGrowth = 0, fromSavings = 0
  let warning = null

  // Step 1: Essentials
  fromEssentials = Math.min(remaining, essR)
  remaining -= fromEssentials

  // Step 2: Enjoyment
  if (remaining > 0) {
    fromEnjoyment = Math.min(remaining, enjR)
    remaining -= fromEnjoyment
  }

  // Step 3: If still remaining → warning + eat into Growth
  if (remaining > 0) {
    warning = `⚠️ You are overspending by ₹${remaining.toFixed(2)}! Essentials & Enjoyment are empty. This is eating into your Growth & Savings. STOP SPENDING!`
    fromGrowth = Math.min(remaining, groR)
    remaining -= fromGrowth
  }

  // Step 4: Eat into Savings (last resort)
  if (remaining > 0) {
    fromSavings = Math.min(remaining, savR)
    remaining -= fromSavings
  }

  // If STILL remaining, it's truly overspent beyond all buckets
  if (remaining > 0) {
    warning = `🚨 CRITICAL: You spent ₹${remaining.toFixed(2)} MORE than your entire income! All buckets are empty. You are in the negative.`
  }

  const updates = {
    totalExpenses: period.totalExpenses + amount,
    'buckets.essentials.spent': (period.buckets.essentials.spent || 0) + fromEssentials,
    'buckets.enjoyment.spent': (period.buckets.enjoyment.spent || 0) + fromEnjoyment,
    'buckets.growth.spent': (period.buckets.growth.spent || 0) + fromGrowth,
    'buckets.savings.spent': (period.buckets.savings.spent || 0) + fromSavings
  }

  await updateDoc(ref, updates)

  const txnRef = await addDoc(txnCol(uid), {
    type: 'expense',
    amount,
    description: description || 'Expense',
    date: key,
    timestamp: Timestamp.now(),
    fromEssentials,
    fromEnjoyment,
    fromGrowth,
    fromSavings,
    overspent: remaining
  })

  return { warning, fromEssentials, fromEnjoyment, fromGrowth, fromSavings, overspent: remaining, txnId: txnRef.id }
}

/* ── delete a transaction and recalculate ── */
export async function deleteTransaction(uid, txnId) {
  const txnRef = doc(db, 'users', uid, 'transactions', txnId)
  await deleteDoc(txnRef)
  // Recalculate period to keep data consistent
  await recalculateCurrentPeriod(uid)
}

/* ── update a transaction (edit amount/description) and recalculate ── */
export async function updateTransaction(uid, txnId, updates) {
  const txnRef = doc(db, 'users', uid, 'transactions', txnId)
  const snap = await getDoc(txnRef)
  if (!snap.exists()) throw new Error('Transaction not found')

  const oldTxn = snap.data()

  // If amount changed on an income txn, recalculate allocation
  if (updates.amount !== undefined && oldTxn.type === 'income') {
    const amount = updates.amount
    const essentialsAdd = Math.round(amount * ALLOCATION.essentials * 100) / 100
    const savingsAdd = Math.round(amount * ALLOCATION.savings * 100) / 100
    const growthAdd = Math.round(amount * ALLOCATION.growth * 100) / 100
    const enjoymentAdd = Math.round((amount - essentialsAdd - savingsAdd - growthAdd) * 100) / 100
    updates.allocation = { essentials: essentialsAdd, savings: savingsAdd, growth: growthAdd, enjoyment: enjoymentAdd }
  }

  await updateDoc(txnRef, updates)
  // Recalculate the entire period so bucket numbers stay correct
  await recalculateCurrentPeriod(uid)
}

/* ── close current period (month) ── */
export async function closeCurrentPeriod(uid) {
  const ref = currentPeriodRef(uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data()
  // Save to history with current timestamp
  const archiveKey = format(new Date(), 'yyyy-MM-dd_HH-mm-ss')
  const archiveRef = doc(db, 'users', uid, 'periods', archiveKey)
  
  // Also pass unused essentials to savings
  const unusedEssentials = (data.buckets?.essentials?.allocated || 0) - (data.buckets?.essentials?.spent || 0)
  
  if (unusedEssentials > 0) {
    data.buckets.savings.allocated = (data.buckets.savings.allocated || 0) + unusedEssentials
    data.rolledToSavings = unusedEssentials
  }

  await setDoc(archiveRef, {
    ...data,
    closedAt: Timestamp.now(),
    archiveKey
  })

  // Reset current period
  const fresh = {
    totalIncome: 0,
    totalExpenses: 0,
    buckets: {
      essentials: { allocated: 0, spent: 0 },
      savings: { allocated: 0, spent: 0 },
      growth: { allocated: 0, spent: 0 },
      enjoyment: { allocated: 0, spent: 0 }
    },
    startedAt: Timestamp.now()
  }
  await setDoc(ref, fresh)
}

/* ── listen to current period in real-time ── */
export function subscribeToCurrentPeriod(uid, callback) {
  const ref = currentPeriodRef(uid)
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() })
    else callback(null)
  })
}

/* ── recalculate current period from transactions ── */
export async function recalculateCurrentPeriod(uid) {
  const ref = currentPeriodRef(uid)
  const snap = await getDoc(ref)
  const startedAt = snap.exists() ? snap.data().startedAt : Timestamp.now()
  const startDate = snap.exists() && startedAt?.toDate
    ? format(startedAt.toDate(), 'yyyy-MM-dd')
    : '2020-01-01'
  const endDate = format(new Date(), 'yyyy-MM-dd')

  const q = query(txnCol(uid), where('date', '>=', startDate), where('date', '<=', endDate))
  const txnSnap = await getDocs(q)
  const txns = txnSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  let totalIncome = 0
  let totalExpenses = 0
  const buckets = {
    essentials: { allocated: 0, spent: 0 },
    savings:    { allocated: 0, spent: 0 },
    growth:     { allocated: 0, spent: 0 },
    enjoyment:  { allocated: 0, spent: 0 }
  }

  txns.forEach(t => {
    if (t.type === 'income') {
      totalIncome += t.amount || 0
      if (t.allocation) {
        buckets.essentials.allocated += t.allocation.essentials || 0
        buckets.savings.allocated    += t.allocation.savings || 0
        buckets.growth.allocated     += t.allocation.growth || 0
        buckets.enjoyment.allocated  += t.allocation.enjoyment || 0
      }
    } else if (t.type === 'expense') {
      totalExpenses += t.amount || 0
      buckets.essentials.spent += t.fromEssentials || 0
      buckets.enjoyment.spent  += t.fromEnjoyment || 0
      buckets.growth.spent     += t.fromGrowth || 0
      buckets.savings.spent    += t.fromSavings || 0
    }
  })

  await setDoc(ref, { totalIncome, totalExpenses, buckets, startedAt }, { merge: false })
  return { totalIncome, totalExpenses, buckets }
}

/* ── fetch transactions for a date range ── */
export async function getTransactions(uid, startDate, endDate) {
  try {
    const q = query(
      txnCol(uid),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    )
    const snap = await getDocs(q)
    const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    txns.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      const aTime = a.timestamp?.toMillis?.() || 0
      const bTime = b.timestamp?.toMillis?.() || 0
      return bTime - aTime
    })
    return txns
  } catch (err) {
    console.error('getTransactions error:', err)
    return []
  }
}

/* ── get daily summaries from transactions (for charts) ── */
export async function getDailySummariesFromTransactions(uid, startDate, endDate) {
  const txns = await getTransactions(uid, startDate, endDate)
  const dayMap = {}
  txns.forEach(t => {
    if (!dayMap[t.date]) dayMap[t.date] = { date: t.date, totalIncome: 0, totalExpenses: 0 }
    if (t.type === 'income') dayMap[t.date].totalIncome += t.amount
    else dayMap[t.date].totalExpenses += t.amount
  })
  return Object.values(dayMap)
}

/* ── get cumulative savings ── */
export async function getCumulativeSavings(uid) {
  try {
    const col = collection(db, 'users', uid, 'periods')
    const snap = await getDocs(col)
    let totalIncome = 0
    let totalExpenses = 0
    let totalGrowthAllocated = 0
    let totalGrowthSpent = 0
    let totalSavingsAllocated = 0
    let totalSavingsSpent = 0
    snap.docs.forEach(d => {
      const data = d.data()
      totalIncome += (data.totalIncome || 0)
      totalExpenses += (data.totalExpenses || 0)
      totalGrowthAllocated += (data.buckets?.growth?.allocated || 0)
      totalGrowthSpent += (data.buckets?.growth?.spent || 0)
      totalSavingsAllocated += (data.buckets?.savings?.allocated || 0)
      totalSavingsSpent += (data.buckets?.savings?.spent || 0)
    })
    return {
      totalSaved: totalIncome - totalExpenses,
      totalSavings: totalSavingsAllocated - totalSavingsSpent,
      totalGrowth: totalGrowthAllocated - totalGrowthSpent,
      totalIncome,
      totalExpenses
    }
  } catch (err) {
    console.error('getCumulativeSavings error:', err)
    return { totalSaved: 0, totalSavings: 0, totalGrowth: 0, totalIncome: 0, totalExpenses: 0 }
  }
}

/* ── calculate streaks ── */
export async function getWorkStreak(uid) {
  try {
    // Get last 60 days of transactions as a reasonable window
    const startDate = format(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    const endDate = todayKey()
    const txns = await getTransactions(uid, startDate, endDate)
    
    const incomeDates = new Set()
    txns.forEach(t => {
      if (t.type === 'income') incomeDates.add(t.date)
    })

    let streak = 0
    const today = new Date()

    for (let i = 0; i < 60; i++) {
      const expected = new Date(today)
      expected.setDate(expected.getDate() - i)
      const expectedKey = format(expected, 'yyyy-MM-dd')

      if (incomeDates.has(expectedKey)) {
        streak++
      } else if (i > 0) { // allow 0 streak today if not worked yet
        break
      }
    }
    return streak
  } catch (err) {
    console.error('getWorkStreak error:', err)
    return 0
  }
}

/* ── get archived periods (months) ── */
export async function getArchivedPeriods(uid) {
  try {
    const col = collection(db, 'users', uid, 'periods')
    const snap = await getDocs(col)
    const periods = snap.docs
      .filter(d => d.id !== 'current')
      .map(d => ({ id: d.id, ...d.data() }))
    periods.sort((a, b) => (b.archiveKey || '').localeCompare(a.archiveKey || ''))
    return periods
  } catch (err) {
    console.error('getArchivedPeriods error:', err)
    return []
  }
}

/* ── get last closed period (for comparison) ── */
export async function getLastClosedPeriod(uid) {
  const periods = await getArchivedPeriods(uid)
  return periods.length > 0 ? periods[0] : null
}

/* ── get all transactions for current period (for heatmap) ── */
export async function getAllTransactionsForHeatmap(uid, days = 90) {
  const now = new Date()
  const startDate = format(new Date(now.getTime() - days * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  const endDate = format(now, 'yyyy-MM-dd')
  return getTransactions(uid, startDate, endDate)
}

/* ══════════════════════════════════════════
   WISHLIST CRUD
   ══════════════════════════════════════════ */

const wishlistCol = (uid) => collection(db, 'users', uid, 'wishlist')

export async function getWishlist(uid) {
  try {
    const snap = await getDocs(wishlistCol(uid))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('getWishlist error:', err)
    return []
  }
}

export async function addWishlistItem(uid, name, price, priority = 'medium') {
  return addDoc(wishlistCol(uid), {
    name,
    price,
    priority,
    createdAt: Timestamp.now()
  })
}

export async function removeWishlistItem(uid, itemId) {
  return deleteDoc(doc(db, 'users', uid, 'wishlist', itemId))
}

/* ══════════════════════════════════════════
   MONTHLY REPORT CARD
   ══════════════════════════════════════════ */

export async function getMonthlyReportData(uid) {
  // Get current period data
  const period = await getOrCreateCurrentPeriod(uid)
  const lastPeriod = await getLastClosedPeriod(uid)
  
  const totalIncome = period.totalIncome || 0
  const totalExpenses = period.totalExpenses || 0
  const profit = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? ((profit / totalIncome) * 100) : 0
  
  // Get bucket discipline
  const buckets = period.buckets || {}
  const essSpent = buckets.essentials?.spent || 0
  const essAllocated = buckets.essentials?.allocated || 0
  const essEfficiency = essAllocated > 0 ? ((1 - essSpent / essAllocated) * 100) : 0
  
  // Get streak
  const streak = await getWorkStreak(uid)
  
  // Calculate grades
  const savingsGrade = savingsRate >= 50 ? 'A+' : savingsRate >= 40 ? 'A' : savingsRate >= 30 ? 'B+' : savingsRate >= 20 ? 'B' : savingsRate >= 10 ? 'C' : savingsRate >= 0 ? 'D' : 'F'
  const disciplineGrade = essEfficiency >= 70 ? 'A+' : essEfficiency >= 50 ? 'A' : essEfficiency >= 30 ? 'B' : essEfficiency >= 10 ? 'C' : 'D'
  const consistencyGrade = streak >= 14 ? 'A+' : streak >= 7 ? 'A' : streak >= 3 ? 'B' : streak >= 1 ? 'C' : 'D'
  
  // Overall grade
  const gradeMap = { 'A+': 5, 'A': 4, 'B+': 3.5, 'B': 3, 'C': 2, 'D': 1, 'F': 0 }
  const avgScore = (gradeMap[savingsGrade] + gradeMap[disciplineGrade] + gradeMap[consistencyGrade]) / 3
  const overallGrade = avgScore >= 4.5 ? 'A+' : avgScore >= 3.5 ? 'A' : avgScore >= 2.5 ? 'B' : avgScore >= 1.5 ? 'C' : 'D'
  
  return {
    totalIncome,
    totalExpenses,
    profit,
    savingsRate: savingsRate.toFixed(1),
    essEfficiency: essEfficiency.toFixed(0),
    streak,
    grades: {
      savings: savingsGrade,
      discipline: disciplineGrade,
      consistency: consistencyGrade,
      overall: overallGrade
    },
    lastPeriod: lastPeriod ? {
      totalIncome: lastPeriod.totalIncome || 0,
      totalExpenses: lastPeriod.totalExpenses || 0,
      profit: (lastPeriod.totalIncome || 0) - (lastPeriod.totalExpenses || 0)
    } : null,
    buckets
  }
}

/* ══════════════════════════════════════════
   EMI TRACKER
   ══════════════════════════════════════════ */

const emiCol = (uid) => collection(db, 'users', uid, 'emis')

export async function addEMI(uid, data) {
  const totalCost = data.emiAmount * data.months
  return addDoc(emiCol(uid), {
    name: data.name,
    totalPrice: data.totalPrice,
    emiAmount: data.emiAmount,
    months: data.months,
    startDate: data.startDate,
    priority: data.priority || 'need',
    totalCost,
    interestPaid: totalCost - data.totalPrice,
    paidMonths: [],
    status: 'active',
    createdAt: Timestamp.now()
  })
}

export async function getEMIs(uid) {
  try {
    const snap = await getDocs(emiCol(uid))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('getEMIs error:', err)
    return []
  }
}

export async function markEMIPaid(uid, emiId, amount, date) {
  const ref = doc(db, 'users', uid, 'emis', emiId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const paidMonths = [...(data.paidMonths || []), { date, amount }]
  const totalPaidSoFar = paidMonths.reduce((s, p) => s + p.amount, 0)
  const isComplete = totalPaidSoFar >= data.totalCost || paidMonths.length >= data.months
  await updateDoc(ref, { paidMonths, status: isComplete ? 'completed' : 'active' })
  return { isComplete, totalPaidSoFar, paidMonths }
}

export async function updateEMI(uid, emiId, updates) {
  await updateDoc(doc(db, 'users', uid, 'emis', emiId), updates)
}

export async function deleteEMI(uid, emiId) {
  return deleteDoc(doc(db, 'users', uid, 'emis', emiId))
}

export async function getActiveEMIBurden(uid) {
  const emis = await getEMIs(uid)
  return emis.filter(e => e.status === 'active').reduce((sum, e) => sum + (e.emiAmount || 0), 0)
}

/* ══════════════════════════════════════════
   MINI GOALS
   ══════════════════════════════════════════ */

const goalsCol = (uid) => collection(db, 'users', uid, 'minigoals')

export async function addMiniGoal(uid, data) {
  return addDoc(goalsCol(uid), {
    name: data.name,
    targetAmount: data.targetAmount,
    days: data.days,
    startDate: data.startDate,
    dailyLogs: [],
    status: 'active',
    createdAt: Timestamp.now()
  })
}

export async function getMiniGoals(uid) {
  try {
    const snap = await getDocs(goalsCol(uid))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('getMiniGoals error:', err)
    return []
  }
}

export async function logMiniGoalEarning(uid, goalId, amount, date) {
  const ref = doc(db, 'users', uid, 'minigoals', goalId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const dailyLogs = [...(data.dailyLogs || [])]
  const idx = dailyLogs.findIndex(l => l.date === date)
  if (idx >= 0) dailyLogs[idx].amount += amount
  else dailyLogs.push({ date, amount })
  const totalEarned = dailyLogs.reduce((s, l) => s + l.amount, 0)
  const isComplete = totalEarned >= data.targetAmount
  await updateDoc(ref, { dailyLogs, status: isComplete ? 'completed' : 'active' })
  return { isComplete, totalEarned, dailyLogs }
}

export async function deleteMiniGoal(uid, goalId) {
  return deleteDoc(doc(db, 'users', uid, 'minigoals', goalId))
}

/* ══════════════════════════════════════════
   TRIP TRACKER
   ══════════════════════════════════════════ */

const tripsCol = (uid) => collection(db, 'users', uid, 'trips')

export async function addTrip(uid, data) {
  return addDoc(tripsCol(uid), {
    name: data.name,
    originalBudget: Number(data.originalBudget),
    totalBudget: Number(data.originalBudget),
    topUps: [],
    startDate: data.startDate,
    endDate: data.endDate,
    status: 'active', // 'active' | 'completed' (upcoming calculated dynamically based on date)
    expenses: [],
    income: [],
    createdAt: Timestamp.now(),
    completedAt: null
  })
}

export async function getTrips(uid) {
  try {
    const snap = await getDocs(tripsCol(uid))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('getTrips error:', err)
    return []
  }
}

export async function getTrip(uid, tripId) {
  const ref = doc(db, 'users', uid, 'trips', tripId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() }
  }
  return null
}

export async function addTripExpense(uid, tripId, expense) {
  const ref = doc(db, 'users', uid, 'trips', tripId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const expenses = [...(data.expenses || [])]
  expenses.push({
    id: Math.random().toString(36).substring(2, 9),
    amount: Number(expense.amount),
    description: expense.description,
    category: expense.category,
    date: expense.date,
    timestamp: Timestamp.now()
  })
  await updateDoc(ref, { expenses })
  return expenses
}

export async function addTripIncome(uid, tripId, incomeVal) {
  const ref = doc(db, 'users', uid, 'trips', tripId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const income = [...(data.income || [])]
  income.push({
    id: Math.random().toString(36).substring(2, 9),
    amount: Number(incomeVal.amount),
    description: incomeVal.description,
    date: incomeVal.date,
    timestamp: Timestamp.now()
  })
  await updateDoc(ref, { income })
  return income
}

export async function deleteTripEntry(uid, tripId, entryId, type) {
  const ref = doc(db, 'users', uid, 'trips', tripId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  if (type === 'expense') {
    const expenses = (data.expenses || []).filter(e => e.id !== entryId)
    await updateDoc(ref, { expenses })
  } else if (type === 'income') {
    const income = (data.income || []).filter(i => i.id !== entryId)
    await updateDoc(ref, { income })
  }
}

export async function topUpTrip(uid, tripId, amount, note, date) {
  const ref = doc(db, 'users', uid, 'trips', tripId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const topUps = [...(data.topUps || [])]
  const val = Number(amount)
  topUps.push({
    amount: val,
    note: note || 'Top Up',
    date: date || new Date().toISOString().split('T')[0]
  })
  const totalBudget = (Number(data.originalBudget) || 0) + topUps.reduce((sum, t) => sum + (t.amount || 0), 0)
  await updateDoc(ref, { topUps, totalBudget })
}

export async function completeTrip(uid, tripId) {
  const ref = doc(db, 'users', uid, 'trips', tripId)
  await updateDoc(ref, {
    status: 'completed',
    completedAt: Timestamp.now()
  })
}

export async function deleteTrip(uid, tripId) {
  return deleteDoc(doc(db, 'users', uid, 'trips', tripId))
}

