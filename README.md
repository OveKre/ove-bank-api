# OVE Bank API

A secure banking API implementation for inter-bank communication following the central bank system protocol.

## Overview

OVE Bank API is a Node.js-based banking system that implements the Inter-Bank Communication Protocol for secure transaction processing between different banks. This API allows for account management, secure transactions, and integration with the central banking system.

## Features

- User authentication and authorization
- Account management
- Secure inter-bank transactions
- Transaction history and status tracking
- JWT-based security with RS256 algorithm
- JWKS endpoint for public key distribution

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- OpenSSL (for generating keys)

## Installation

```bash
# Clone the repository
git clone [repository-url]
cd ove-bank-api

# Install dependencies
npm install

# Generate RSA key pair for transaction signing
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the server
npm start
```

## Configuration

Configure the application by editing the `.env` file:

```
# Bank Configuration
BANK_PREFIX=OVE
BANK_NAME=OVE Bank

# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ove-bank

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=1d

# Central Bank Configuration
CENTRAL_BANK_URL=http://localhost:5000
JWKS_ENDPOINT=/api/v1/keys/jwks
CALLBACK_URL=/api/v1/transactions/incoming

# Keys (in production these would be stored securely)
PRIVATE_KEY_PATH=./keys/private.pem
PUBLIC_KEY_PATH=./keys/public.pem
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login and receive JWT token

### Users
- `GET /api/v1/users/me` - Get current user information
- `PUT /api/v1/users/me` - Update user information

### Accounts
- `GET /api/v1/accounts` - List user accounts
- `POST /api/v1/accounts` - Create a new account
- `GET /api/v1/accounts/:id` - Get account details
- `GET /api/v1/accounts/:id/transactions` - Get account transactions

### Transactions
- `POST /api/v1/transactions` - Create a new transaction
- `GET /api/v1/transactions/:id` - Get transaction status

### Keys
- `GET /api/v1/keys/jwks` - Get JWKS (JSON Web Key Set)

## Inter-Bank Communication Protocol

### Account Number Format

Account numbers follow the format: `{BANK_PREFIX}-{UNIQUE_IDENTIFIER}`

Example: `OVE-12345678`

### Transaction Flow

1. Bank validates the transaction internally
2. Bank signs the transaction with its private key
3. Bank sends the transaction to the Central Bank
4. Central Bank validates the signature using the sender bank's public key
5. Central Bank forwards the transaction to the destination bank
6. Destination bank validates the transaction signature
7. Destination bank processes the transaction and updates account balance
8. Destination bank sends confirmation back through Central Bank
9. Central Bank forwards confirmation to the originating bank
10. Originating bank updates transaction status

### Transaction Status Codes

- `PENDING`: Transaction has been initiated but not yet processed
- `IN_PROGRESS`: Transaction is being processed by the central bank
- `COMPLETED`: Transaction has been successfully completed
- `FAILED`: Transaction has failed (with error code)

### Security Requirements

1. All communications must use HTTPS
2. All transactions must be signed using JWT with RS256 algorithm
3. Banks must validate all incoming transaction signatures
4. Banks must publish their public keys via JWKS endpoint
5. Central Bank maintains a registry of all bank public keys

## Error Handling

All errors include:
- Error code
- Error message
- Transaction ID (if applicable)

Common error codes:
- `INVALID_SIGNATURE`: Transaction signature validation failed
- `INSUFFICIENT_FUNDS`: Sender account has insufficient funds
- `ACCOUNT_NOT_FOUND`: Destination account does not exist
- `INVALID_CURRENCY`: Currency not supported
- `BANK_UNAVAILABLE`: Destination bank is not responding

## Rate Limits

- Maximum 100 transactions per minute per bank
- Maximum transaction amount: 1,000,000 EUR (or equivalent)
- Minimum transaction amount: 0.01 EUR (or equivalent)

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test
```

## License

[MIT](LICENSE)