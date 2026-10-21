import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { requireAuth, adminAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/transactions
// Get the logged-in user's transactions
router.get('/', requireAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.json(transactions.map(tx => tx.toPublicJSON()));
  } catch (err) {
    console.error('Fetch transactions error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// GET /api/transactions/user/:email
// Admin route to fetch a specific user's transactions
router.get('/user/:email', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 });
    return res.json(transactions.map(tx => tx.toPublicJSON()));
  } catch (err) {
    console.error('Fetch user transactions error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// POST /api/transactions/user/:email
// Admin route to add a new transaction for a user
router.post('/user/:email', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { type, label, amount, status, date, tag, color } = req.body;
    const newTx = new Transaction({
      user: user._id,
      type, label, amount, status, date, tag, color
    });
    
    await newTx.save();
    return res.status(201).json(newTx.toPublicJSON());
  } catch (err) {
    console.error('Create transaction error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// PUT /api/transactions/:id
// Admin route to update an existing transaction
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    const { type, label, amount, status, date, tag, color } = req.body;
    if (type !== undefined) tx.type = type;
    if (label !== undefined) tx.label = label;
    if (amount !== undefined) tx.amount = amount;
    if (status !== undefined) tx.status = status;
    if (date !== undefined) tx.date = date;
    if (tag !== undefined) tx.tag = tag;
    if (color !== undefined) tx.color = color;

    await tx.save();
    return res.json(tx.toPublicJSON());
  } catch (err) {
    console.error('Update transaction error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// DELETE /api/transactions/:id
// Admin route to delete a transaction
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const tx = await Transaction.findByIdAndDelete(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    return res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error('Delete transaction error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;
