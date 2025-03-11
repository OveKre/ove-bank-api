/**
 * Token blacklist utility
 * Stores invalidated tokens (logged out users)
 * In a production environment, this would be implemented using Redis or a similar solution
 */

// Create a Set to store blacklisted tokens
const tokenBlacklist = new Set();

module.exports = tokenBlacklist;