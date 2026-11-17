import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'crypto', 'swap'],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['completed', 'completed_settling', 'pending', 'processing', 'failed'],
      default: 'completed',
    },
    settlementTimeframe: {
      type: String,
      default: '10-12 hours',
    },
    settlementMessage: {
      type: String,
      default: '',
      trim: true,
    },
    date: {
      type: String,
      default: () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    },
    tag: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '#10b981',
    },
  },
  { timestamps: true }
);

transactionSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    user: this.user,
    type: this.type,
    label: this.label,
    amount: this.amount,
    status: this.status,
    settlementTimeframe: this.settlementTimeframe || (this.status === 'completed_settling' ? '10-12 hours' : ''),
    settlementMessage: this.settlementMessage || '',
    date: this.date,
    tag: this.tag,
    color: this.color,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('Transaction', transactionSchema);
