const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountType: {
      type: String,
      enum: ['checking', 'savings', 'business'],
      default: 'checking',
    },
    currency: {
      type: String,
      required: true,
      enum: ['EUR', 'USD', 'GBP'],
      default: 'EUR',
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Balance cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Generate account number before validation
accountSchema.pre('validate', function (next) {
  try {
    if (!this.accountNumber) {
      // Get bank prefix from environment variables
      const bankPrefix = process.env.BANK_PREFIX || 'OVE';
      // Generate a unique identifier (8 digits)
      const uniqueId = Math.floor(10000000 + Math.random() * 90000000).toString();
      // Format: BANK_PREFIX-UNIQUE_ID
      this.accountNumber = `${bankPrefix}-${uniqueId}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check if account has sufficient funds
accountSchema.methods.hasSufficientFunds = function (amount) {
  return this.balance >= amount;
};

// Method to credit account (add funds)
accountSchema.methods.credit = async function (amount) {
  if (amount <= 0) {
    throw new Error('Credit amount must be positive');
  }
  
  this.balance += amount;
  await this.save();
  return this;
};

// Method to debit account (remove funds)
accountSchema.methods.debit = async function (amount) {
  if (amount <= 0) {
    throw new Error('Debit amount must be positive');
  }
  
  if (!this.hasSufficientFunds(amount)) {
    throw new Error('Insufficient funds');
  }
  
  this.balance -= amount;
  await this.save();
  return this;
};

const Account = mongoose.model('Account', accountSchema);

module.exports = Account;