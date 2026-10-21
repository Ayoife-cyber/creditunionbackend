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
      enum: ['completed', 'pending', 'failed'],
      default: 'completed',
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
    date: this.date,
    tag: this.tag,
    color: this.color,
  };
};

export default mongoose.model('Transaction', transactionSchema);
