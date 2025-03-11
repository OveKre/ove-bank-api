const express = require('express');
const { body, param, validationResult } = require('express-validator');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

const Account = require('../models/account.model');
const Transaction = require('../models/transaction.model');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Helper function to sign transaction payload
const signTransaction = async (payload) => {
  try {
    const privateKeyPath = process.env.PRIVATE_KEY_PATH;
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error('Private key not found');
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  } catch (error) {
    console.error('Error signing transaction:', error);
    throw error;
  }
};

// Helper function to verify transaction signature
const verifySignature = async (payload, signature, fromBank) => {
  try {
    // For internal transactions, use our own public key
    if (fromBank === process.env.BANK_PREFIX) {
      const publicKeyPath = process.env.PUBLIC_KEY_PATH;
      if (!fs.existsSync(publicKeyPath)) {
        throw new Error('Public key not found');
      }

      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      jwt.verify(signature, publicKey, { algorithms: ['RS256'] });
      return true;
    }

    // For external transactions, fetch the public key from central bank
    const centralBankUrl = process.env.CENTRAL_BANK_URL.replace(/\/$/, ''); // Remove trailing slash if present
    const response = await fetch(`${centralBankUrl}/api/v1/banks/${fromBank}/publicKey`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch public key for bank ${fromBank}`);
    }
    
    const { publicKey } = await response.json();
    jwt.verify(signature, publicKey, { algorithms: ['RS256'] });
    return true;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
};

/**
 * @swagger
 * /api/v1/transactions/internal:
 *   post:
 *     summary: Create an internal transaction between accounts in this bank
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromAccount
 *               - toAccount
 *               - amount
 *             properties:
 *               fromAccount:
 *                 type: string
 *                 description: Sender account number
 *               toAccount:
 *                 type: string
 *                 description: Recipient account number
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 1000000
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *       400:
 *         description: Validation error or insufficient funds
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 */
router.post(
  '/internal',
  authenticate,
  [
    body('fromAccount').notEmpty().withMessage('Sender account number is required'),
    body('toAccount').notEmpty().withMessage('Recipient account number is required'),
    body('amount')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Amount must be between 0.01 and 1,000,000'),
    body('description').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors.array(),
          },
        });
      }

      const { fromAccount, toAccount, amount, description = '' } = req.body;

      // Check if accounts exist and user owns the sender account
      const senderAccount = await Account.findOne({ accountNumber: fromAccount });
      if (!senderAccount) {
        return res.status(404).json({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Sender account not found',
          },
        });
      }

      // Verify account ownership
      if (senderAccount.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to use this account',
          },
        });
      }

      // Check if recipient account exists
      const recipientAccount = await Account.findOne({ accountNumber: toAccount });
      if (!recipientAccount) {
        return res.status(404).json({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Recipient account not found',
          },
        });
      }

      // Check if currencies match
      if (senderAccount.currency !== recipientAccount.currency) {
        return res.status(400).json({
          error: {
            code: 'CURRENCY_MISMATCH',
            message: 'Sender and recipient accounts must use the same currency',
          },
        });
      }

      // Check if sender has sufficient funds
      if (!senderAccount.hasSufficientFunds(amount)) {
        return res.status(400).json({
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: 'Insufficient funds in sender account',
          },
        });
      }

      // Create transaction record
      const transaction = new Transaction({
        fromAccount: senderAccount.accountNumber,
        toAccount: recipientAccount.accountNumber,
        fromBank: process.env.BANK_PREFIX,
        toBank: process.env.BANK_PREFIX,
        amount,
        currency: senderAccount.currency,
        description,
        isInternal: true,
        initiatedBy: req.user._id,
      });

      // Process the transaction
      await senderAccount.debit(amount);
      await recipientAccount.credit(amount);
      await transaction.markCompleted();

      res.status(201).json({
        message: 'Transaction completed successfully',
        transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/transactions/external:
 *   post:
 *     summary: Create an external transaction to another bank
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromAccount
 *               - toAccount
 *               - toBank
 *               - amount
 *               - currency
 *             properties:
 *               fromAccount:
 *                 type: string
 *                 description: Sender account number
 *               toAccount:
 *                 type: string
 *                 description: Recipient account number
 *               toBank:
 *                 type: string
 *                 description: Recipient bank prefix
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 1000000
 *               currency:
 *                 type: string
 *                 enum: [EUR, USD, GBP]
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transaction initiated successfully
 *       400:
 *         description: Validation error or insufficient funds
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 */
router.post(
  '/external',
  authenticate,
  [
    body('fromAccount').notEmpty().withMessage('Sender account number is required'),
    body('toAccount').notEmpty().withMessage('Recipient account number is required'),
    body('toBank').notEmpty().withMessage('Recipient bank is required'),
    body('amount')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Amount must be between 0.01 and 1,000,000'),
    body('currency')
      .isIn(['EUR', 'USD', 'GBP'])
      .withMessage('Currency must be one of: EUR, USD, GBP'),
    body('description').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors.array(),
          },
        });
      }

      const { fromAccount, toAccount, toBank, amount, currency, description = '' } = req.body;

      // Check if sending to our own bank (should use internal transfer)
      if (toBank === process.env.BANK_PREFIX) {
        return res.status(400).json({
          error: {
            code: 'INVALID_DESTINATION',
            message: 'For transfers within this bank, use the internal transfer endpoint',
          },
        });
      }

      // Check if sender account exists and user owns it
      const senderAccount = await Account.findOne({ accountNumber: fromAccount });
      if (!senderAccount) {
        return res.status(404).json({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Sender account not found',
          },
        });
      }

      // Verify account ownership
      if (senderAccount.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to use this account',
          },
        });
      }

      // Check if currency matches account currency
      if (senderAccount.currency !== currency) {
        return res.status(400).json({
          error: {
            code: 'CURRENCY_MISMATCH',
            message: 'Transaction currency must match account currency',
          },
        });
      }

      // Check if sender has sufficient funds
      if (!senderAccount.hasSufficientFunds(amount)) {
        return res.status(400).json({
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: 'Insufficient funds in sender account',
          },
        });
      }

      // Create transaction record
      const transaction = new Transaction({
        fromAccount: senderAccount.accountNumber,
        toAccount,
        fromBank: process.env.BANK_PREFIX,
        toBank,
        amount,
        currency,
        description,
        isInternal: false,
        initiatedBy: req.user._id,
      });

      await transaction.save();

      // Prepare transaction payload for central bank
      const transactionPayload = {
        transactionId: transaction.transactionId,
        fromBank: process.env.BANK_PREFIX,
        fromAccount: senderAccount.accountNumber,
        toBank,
        toAccount,
        amount,
        currency,
        description,
        timestamp: new Date().toISOString(),
      };

      // Sign the transaction
      const signature = await signTransaction(transactionPayload);
      transactionPayload.signature = signature;

      // Update transaction with signature
      transaction.signature = signature;
      await transaction.markInProgress();

      // Debit the sender's account
      await senderAccount.debit(amount);

      // Send transaction to central bank
      try {
        const centralBankUrl = process.env.CENTRAL_BANK_URL.replace(/\/$/, ''); // Remove trailing slash if present
        const response = await fetch(`${centralBankUrl}/api/v1/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(transactionPayload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          // Revert the transaction if central bank rejects it
          await senderAccount.credit(amount);
          await transaction.markFailed(errorData.error.code, errorData.error.message);

          return res.status(response.status).json({
            error: {
              code: errorData.error.code,
              message: errorData.error.message,
              transactionId: transaction.transactionId,
            },
          });
        }

        const responseData = await response.json();

        res.status(201).json({
          message: 'Transaction initiated successfully',
          transaction,
          centralBankResponse: responseData,
        });
      } catch (error) {
        // Revert the transaction if there's an error communicating with central bank
        await senderAccount.credit(amount);
        await transaction.markFailed('CENTRAL_BANK_ERROR', 'Failed to communicate with central bank');

        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/transactions/incoming:
 *   post:
 *     summary: Endpoint for receiving incoming transactions from other banks via central bank
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *               - fromBank
 *               - fromAccount
 *               - toBank
 *               - toAccount
 *               - amount
 *               - currency
 *               - timestamp
 *               - signature
 *     responses:
 *       200:
 *         description: Transaction processed successfully
 *       400:
 *         description: Validation error or invalid signature
 *       404:
 *         description: Recipient account not found
 *       500:
 *         description: Server error
 */
router.post('/incoming', async (req, res, next) => {
  try {
    const {
      transactionId,
      fromBank,
      fromAccount,
      toBank,
      toAccount,
      amount,
      currency,
      description = '',
      timestamp,
      signature,
    } = req.body;

    // Verify this transaction is intended for our bank
    if (toBank !== process.env.BANK_PREFIX) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DESTINATION',
          message: 'This transaction is not intended for this bank',
          transactionId,
        },
      });
    }

    // Check if transaction already exists (prevent duplicates)
    const existingTransaction = await Transaction.findOne({ transactionId });
    if (existingTransaction) {
      return res.status(200).json({
        message: 'Transaction already processed',
        transactionId,
        status: existingTransaction.status,
      });
    }

    // Verify transaction signature
    const payloadToVerify = {
      transactionId,
      fromBank,
      fromAccount,
      toBank,
      toAccount,
      amount,
      currency,
      description,
      timestamp,
    };

    const isSignatureValid = await verifySignature(payloadToVerify, signature, fromBank);
    if (!isSignatureValid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Transaction signature validation failed',
          transactionId,
        },
      });
    }

    // Find recipient account
    const recipientAccount = await Account.findOne({ accountNumber: toAccount });
    if (!recipientAccount) {
      return res.status(404).json({
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Recipient account not found',
          transactionId,
        },
      });
    }

    // Verify currency matches
    if (recipientAccount.currency !== currency) {
      return res.status(400).json({
        error: {
          code: 'CURRENCY_MISMATCH',
          message: 'Transaction currency does not match account currency',
          transactionId,
        },
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      transactionId,
      fromAccount,
      toAccount,
      fromBank,
      toBank,
      amount,
      currency,
      description,
      isInternal: false,
      signature,
      initiatedBy: recipientAccount.user, // Set recipient's user as initiator for incoming transactions
    });

    // Process the transaction
    await recipientAccount.credit(amount);
    await transaction.markCompleted();

    res.status(200).json({
      message: 'Transaction processed successfully',
      transactionId,
      status: 'COMPLETED',
    });
  } catch (error) {
    console.error('Error processing incoming transaction:', error);
    res.status(500).json({
      error: {
        code: 'TRANSACTION_PROCESSING_ERROR',
        message: 'Failed to process transaction',
        transactionId: req.body?.transactionId,
      },
    });
  }
});

/**
 * @swagger
 * /api/v1/transactions/{transactionId}:
 *   get:
 *     summary: Get transaction details by ID
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not transaction owner
 *       404:
 *         description: Transaction not found
 */
router.get('/:transactionId', authenticate, async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({ transactionId: req.params.transactionId });
    if (!transaction) {
      return res.status(404).json({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        },
      });
    }

    // Check if user is involved in the transaction
    const userAccounts = await Account.find({ user: req.user._id }).select('accountNumber');
    const userAccountNumbers = userAccounts.map(account => account.accountNumber);
    
    const isUserInvolved = 
      userAccountNumbers.includes(transaction.fromAccount) || 
      userAccountNumbers.includes(transaction.toAccount) ||
      transaction.initiatedBy.toString() === req.user._id.toString();

    if (!isUserInvolved && req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this transaction',
        },
      });
    }

    res.status(200).json({
      transaction,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: Get all transactions for the authenticated user
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of transactions retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    // Get all user accounts
    const userAccounts = await Account.find({ user: req.user._id }).select('accountNumber');
    const userAccountNumbers = userAccounts.map(account => account.accountNumber);
    
    // Find all transactions involving user accounts
    const transactions = await Transaction.find({
      $or: [
        { fromAccount: { $in: userAccountNumbers } },
        { toAccount: { $in: userAccountNumbers } },
      ],
    }).sort({ createdAt: -1 });

    res.status(200).json({
      transactions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;