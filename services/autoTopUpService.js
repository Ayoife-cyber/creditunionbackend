import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

/**
 * Executes a single top-up credit for a user, records the transaction, and sets the next timer.
 * @param {import('../models/User.js').default} user 
 * @param {boolean} isManual - whether triggered manually via Admin 'Run Now'
 */
export async function applyAutoTopUp(user, isManual = false) {
  if (!user) return null;

  const amount = Number(user.autoTopUpAmount);
  if (isNaN(amount) || amount <= 0) return null;

  const intervalMinutes = Math.max(1, Number(user.autoTopUpIntervalMinutes) || 60);
  const now = new Date();

  // 1. Credit balance
  user.balanceUsd = (Number(user.balanceUsd) || 0) + amount;

  // 2. Schedule next run
  user.lastTopUpAt = now;
  user.nextTopUpAt = new Date(now.getTime() + intervalMinutes * 60 * 1000);

  // 3. Create permanent transaction history record in MongoDB
  const desc = user.autoTopUpDescription?.trim() || 'Auto Balance Top-Up';
  const formattedAmount = `+$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tx = new Transaction({
    user: user._id,
    type: 'deposit',
    label: desc,
    amount: formattedAmount,
    status: 'completed',
    tag: 'deposit',
    color: '#10b981',
    date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  });

  await Promise.all([user.save(), tx.save()]);

  console.log(`[AutoTopUp] Credited ${formattedAmount} to ${user.email} (new balance: $${user.balanceUsd}). Next run: ${user.nextTopUpAt.toISOString()}`);

  return {
    success: true,
    addedAmount: amount,
    newBalance: user.balanceUsd,
    tx: tx.toPublicJSON(),
    lastTopUpAt: user.lastTopUpAt,
    nextTopUpAt: user.nextTopUpAt,
  };
}

/**
 * Checks an individual user and executes top-up if timer is due.
 * Useful for serverless lazy evaluation on /api/auth/me or incoming requests.
 */
export async function checkAndProcessAutoTopUp(user) {
  if (!user || !user.autoTopUpEnabled || !user.nextTopUpAt) return false;

  const now = new Date();
  if (now >= new Date(user.nextTopUpAt)) {
    try {
      await applyAutoTopUp(user, false);
      return true;
    } catch (err) {
      console.error(`[AutoTopUp] Error auto-topping up ${user.email}:`, err);
      return false;
    }
  }
  return false;
}

/**
 * Scans MongoDB for any active auto-top-up users that are due.
 */
export async function processAllDueAutoTopUps() {
  try {
    const dueUsers = await User.find({
      autoTopUpEnabled: true,
      nextTopUpAt: { $lte: new Date() },
    });

    if (dueUsers.length === 0) return;

    console.log(`[AutoTopUp] Found ${dueUsers.length} user(s) due for auto top-up.`);
    for (const user of dueUsers) {
      await applyAutoTopUp(user, false);
    }
  } catch (err) {
    console.error('[AutoTopUp] Background processor error:', err);
  }
}

/**
 * Starts the background timer worker (polls MongoDB every 60 seconds).
 */
let workerStarted = false;
export function startAutoTopUpWorker() {
  if (workerStarted) return;
  workerStarted = true;

  // Run initial check shortly after startup
  setTimeout(() => {
    processAllDueAutoTopUps();
  }, 5000);

  // Poll every 60 seconds
  setInterval(() => {
    processAllDueAutoTopUps();
  }, 60 * 1000);

  console.log('[AutoTopUp] Background worker started (polling every 60s).');
}
