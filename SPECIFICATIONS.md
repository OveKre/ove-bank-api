# Banking API Specifications

## Inter-Bank Communication Protocol

This document outlines the specifications for communication between banks and the central bank system.

### Bank Registration

1. Each bank must register with the Central Bank to receive:
   - A unique bank prefix (used for account numbers)
   - API credentials for secure communication
   - Public/private key pair for transaction signing

2. Banks must provide:
   - Bank name
   - JWKS endpoint URL (for publishing public keys)
   - Callback URL (for receiving transactions)

### Account Number Format

Account numbers follow the format: `{BANK_PREFIX}-{UNIQUE_IDENTIFIER}`

Example: `OVE-12345678`

### Transaction Protocol

#### Outgoing Transactions (to other banks)

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

#### Transaction Payload Format

```json
{
  "transactionId": "uuid-v4",
  "fromBank": "BANK_PREFIX",
  "fromAccount": "FULL_ACCOUNT_NUMBER",
  "toBank": "DESTINATION_BANK_PREFIX",
  "toAccount": "DESTINATION_ACCOUNT_NUMBER",
  "amount": 100.00,
  "currency": "EUR",
  "description": "Payment for services",
  "timestamp": "ISO-8601-TIMESTAMP",
  "signature": "JWT_SIGNATURE"
}
```

### Security Requirements

1. All communications must use HTTPS
2. All transactions must be signed using JWT with RS256 algorithm
3. Banks must validate all incoming transaction signatures
4. Banks must publish their public keys via JWKS endpoint
5. Central Bank maintains a registry of all bank public keys

### Error Handling

1. All errors must include:
   - Error code
   - Error message
   - Transaction ID (if applicable)

2. Common error codes:
   - `INVALID_SIGNATURE`: Transaction signature validation failed
   - `INSUFFICIENT_FUNDS`: Sender account has insufficient funds
   - `ACCOUNT_NOT_FOUND`: Destination account does not exist
   - `INVALID_CURRENCY`: Currency not supported
   - `BANK_UNAVAILABLE`: Destination bank is not responding

### Transaction Status Codes

- `PENDING`: Transaction has been initiated but not yet processed
- `IN_PROGRESS`: Transaction is being processed by the central bank
- `COMPLETED`: Transaction has been successfully completed
- `FAILED`: Transaction has failed (with error code)

### Rate Limits

- Maximum 100 transactions per minute per bank
- Maximum transaction amount: 1,000,000 EUR (or equivalent)
- Minimum transaction amount: 0.01 EUR (or equivalent)