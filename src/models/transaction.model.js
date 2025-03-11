const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
      immutable: true,
    },
    fromAccount: {
      type: String,
      required: true,
    },
    toAccount: {
      type: String,
      required: true,
    },
    fromBank: {
      type: String,
      required: true,
      default: process.env.BANK_PREFIX || 'OVE',
    },
    toBank: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be at least 0.01'],
      max: [1000000, 'Amount cannot exceed 1,000,000'],
    },
    currency: {
      type: String,
      required: true,
      enum: ['EUR', 'USD', 'GBP'],
      default: 'EUR',
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    errorCode: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    isInternal: {
      type: Boolean,
      default: false,
    },
    signature: {
      type: String,
      default: null,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Method to update transaction status
transactionSchema.methods.updateStatus = async function (status, errorCode = null, errorMessage = null) {
  this.status = status;
  this.errorCode = errorCode;
  this.errorMessage = errorMessage;
  return this.save();
};

// Method to mark transaction as completed
transactionSchema.methods.markCompleted = async function () {
  return this.updateStatus('COMPLETED');
};

// Method to mark transaction as failed
transactionSchema.methods.markFailed = async function (errorCode, errorMessage) {
  return this.updateStatus('FAILED', errorCode, errorMessage);
};

// Method to mark transaction as in progress
transactionSchema.methods.markInProgress = async function () {
  return this.updateStatus('IN_PROGRESS');
};

// Static method to find transactions by account
transactionSchema.statics.findByAccount = function (accountNumber) {
  return this.find({
    $or: [
      { fromAccount: accountNumber },
      { toAccount: accountNumber },
    ],
  }).sort({ createdAt: -1 });
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;