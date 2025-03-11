const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Account = require('../models/account.model');
const Transaction = require('../models/transaction.model');
const { authenticate } = require('../middleware/auth.middleware');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * @swagger
 * /api/v1/accounts:
 *   post:
 *     summary: Create a new account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currency
 *             properties:
 *               accountType:
 *                 type: string
 *                 enum: [checking, savings, business]
 *                 default: checking
 *               currency:
 *                 type: string
 *                 enum: [EUR, USD, GBP]
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  authenticate,
  [
    body('accountType')
      .optional()
      .isIn(['checking', 'savings', 'business'])
      .withMessage('Account type must be one of: checking, savings, business'),
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

      const { accountType = 'checking', currency, description = '' } = req.body;

      // Generate account number
      const bankPrefix = process.env.BANK_PREFIX || 'OVE';
      const uniqueId = Math.floor(10000000 + Math.random() * 90000000).toString();
      const accountNumber = `${bankPrefix}-${uniqueId}`;
      
      // Create new account
      const account = new Account({
        user: req.user._id,
        accountType,
        currency,
        description,
        accountNumber, // Explicitly set the account number
        balance: currency === 'EUR' ? 100 : 0, // Add 100 EUR initial balance for EUR accounts
      });

      await account.save();
      
      // Create a transaction record for the initial deposit if it's an EUR account
      if (currency === 'EUR') {
        const transaction = new Transaction({
          transactionId: uuidv4(), // Need to add this import
          fromAccount: 'SYSTEM',
          toAccount: accountNumber,
          fromBank: process.env.BANK_PREFIX || 'OVE',
          toBank: process.env.BANK_PREFIX || 'OVE',
          amount: 100,
          currency: 'EUR',
          description: 'Welcome bonus - Initial account deposit',
          status: 'COMPLETED',
          isInternal: true,
          initiatedBy: req.user._id
        });
        
        await transaction.save();
      }

      res.status(201).json({
        message: 'Account created successfully',
        account,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/accounts:
 *   get:
 *     summary: Get all accounts for the authenticated user
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of accounts retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const accounts = await Account.find({ user: req.user._id });
    res.status(200).json({
      accounts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/accounts/{accountId}:
 *   get:
 *     summary: Get account details by ID
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not account owner
 *       404:
 *         description: Account not found
 */
router.get('/:accountId', authenticate, async (req, res, next) => {
  try {
    const account = await Account.findById(req.params.accountId);
    if (!account) {
      return res.status(404).json({
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found',
        },
      });
    }

    // Check if user is the account owner
    if (account.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this account',
        },
      });
    }

    res.status(200).json({
      account,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/accounts/{accountId}/transactions:
 *   get:
 *     summary: Get transaction history for an account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not account owner
 *       404:
 *         description: Account not found
 */
router.get('/:accountId/transactions', authenticate, async (req, res, next) => {
  try {
    const account = await Account.findById(req.params.accountId);
    if (!account) {
      return res.status(404).json({
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found',
        },
      });
    }

    // Check if user is the account owner
    if (account.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this account',
        },
      });
    }

    // Get transactions for this account
    const transactions = await Transaction.findByAccount(account.accountNumber);

    res.status(200).json({
      transactions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/accounts/number/{accountNumber}:
 *   get:
 *     summary: Get account details by account number
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not account owner
 *       404:
 *         description: Account not found
 */
router.get('/number/:accountNumber', authenticate, async (req, res, next) => {
  try {
    const account = await Account.findOne({ accountNumber: req.params.accountNumber });
    if (!account) {
      return res.status(404).json({
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found',
        },
      });
    }

    // Check if user is the account owner
    if (account.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this account',
        },
      });
    }

    res.status(200).json({
      account,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/accounts/{accountId}:
 *   put:
 *     summary: Update account details
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Account updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not account owner
 *       404:
 *         description: Account not found
 */
router.put(
  '/:accountId',
  authenticate,
  [
    body('description').optional().trim(),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean value'),
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

      const account = await Account.findById(req.params.accountId);
      if (!account) {
        return res.status(404).json({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account not found',
          },
        });
      }

      // Check if user is the account owner
      if (account.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to modify this account',
          },
        });
      }

      // Update account
      if (req.body.description !== undefined) {
        account.description = req.body.description;
      }
      if (req.body.isActive !== undefined) {
        account.isActive = req.body.isActive;
      }

      await account.save();

      res.status(200).json({
        message: 'Account updated successfully',
        account,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;