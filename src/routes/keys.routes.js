const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// Helper function to generate RSA key pair if not exists
const ensureKeysExist = () => {
  const privateKeyPath = process.env.PRIVATE_KEY_PATH;
  const publicKeyPath = process.env.PUBLIC_KEY_PATH;

  // Check if keys already exist
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    return;
  }

  // Generate new RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Ensure directory exists
  const keysDir = path.dirname(privateKeyPath);
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  // Write keys to files
  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  console.log('RSA key pair generated successfully');
};

// Ensure keys exist when the server starts
ensureKeysExist();

/**
 * @swagger
 * /api/v1/keys/jwks:
 *   get:
 *     summary: Get JWKS (JSON Web Key Set) for this bank
 *     tags: [Keys]
 *     description: Returns the public key in JWKS format for verifying transaction signatures
 *     responses:
 *       200:
 *         description: JWKS retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/jwks', async (req, res, next) => {
  try {
    const publicKeyPath = process.env.PUBLIC_KEY_PATH;
    
    // Ensure keys exist
    ensureKeysExist();
    
    // Read public key
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    
    // Convert PEM to JWK
    const publicKeyObject = crypto.createPublicKey(publicKey);
    const keyData = publicKeyObject.export({ format: 'jwk' });
    
    // Add key ID and use properties required for JWKS
    keyData.kid = process.env.BANK_PREFIX || 'OVE';
    keyData.use = 'sig';
    keyData.alg = 'RS256';
    
    // Format as JWKS
    const jwks = {
      keys: [keyData],
    };
    
    res.status(200).json(jwks);
  } catch (error) {
    console.error('Error generating JWKS:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/keys/public:
 *   get:
 *     summary: Get public key in PEM format
 *     tags: [Keys]
 *     description: Returns the public key in PEM format
 *     responses:
 *       200:
 *         description: Public key retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/public', async (req, res, next) => {
  try {
    const publicKeyPath = process.env.PUBLIC_KEY_PATH;
    
    // Ensure keys exist
    ensureKeysExist();
    
    // Read public key
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    
    res.status(200).json({
      bankPrefix: process.env.BANK_PREFIX,
      publicKey,
    });
  } catch (error) {
    console.error('Error retrieving public key:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/keys/regenerate:
 *   post:
 *     summary: Regenerate RSA key pair (admin only)
 *     tags: [Keys]
 *     security:
 *       - bearerAuth: []
 *     description: Regenerates the RSA key pair used for signing transactions
 *     responses:
 *       200:
 *         description: Keys regenerated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */
router.post('/regenerate', authenticate, isAdmin, async (req, res, next) => {
  try {
    const privateKeyPath = process.env.PRIVATE_KEY_PATH;
    const publicKeyPath = process.env.PUBLIC_KEY_PATH;
    
    // Generate new RSA key pair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    
    // Ensure directory exists
    const keysDir = path.dirname(privateKeyPath);
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    
    // Write keys to files
    fs.writeFileSync(privateKeyPath, privateKey);
    fs.writeFileSync(publicKeyPath, publicKey);
    
    res.status(200).json({
      message: 'RSA key pair regenerated successfully',
    });
  } catch (error) {
    console.error('Error regenerating keys:', error);
    next(error);
  }
});

module.exports = router;