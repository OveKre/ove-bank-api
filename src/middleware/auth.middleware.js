const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const tokenBlacklist = require('../utils/tokenBlacklist');

/**
 * Middleware to authenticate users using JWT
 * Verifies the token from the Authorization header
 * Adds the user object to the request if authentication is successful
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please provide a valid token.',
        },
      });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Check if token is blacklisted (logged out)
    if (tokenBlacklist.has(token)) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token has been invalidated. Please login again.',
        },
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by id
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found or inactive.',
        },
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token.',
        },
      });
    }

    next(error);
  }
};

/**
 * Middleware to check if user has admin role
 * Must be used after authenticate middleware
 */
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required.',
      },
    });
  }
};

module.exports = {
  authenticate,
  isAdmin,
};