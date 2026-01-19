# Cronos ParallelPay

**Agentic, gasless x402 micropayments + streaming payouts with SLA-backed refunds on Cronos.**

Cronos ParallelPay is an AI-native payment infrastructure for the x402 protocol, enabling autonomous agents to buy APIs, data, and services via HTTP 402 with gasless USDC.e payments through the Cronos x402 Facilitator (EIP-3009).

## What Makes This Different

- **x402 Native**: Full HTTP 402 payment flow with Cronos x402 Facilitator integration
- **Gasless Payments**: Buyers pay with USDC.e using EIP-3009 `transferWithAuthorization` - no gas needed
- **SLA-Backed Streams**: Continuous payment flows with automatic refunds when service guarantees are broken
- **Agent-First Design**: Built for AI agents to autonomously pay for and consume services
- **Graduated Refunds**: Tiered refund system based on breach severity (10%/25%/50%)

## Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │                  CRONOS x402 FLOW                    │
                    └─────────────────────────────────────────────────────┘

   ┌─────────────┐         1. GET /api/data          ┌─────────────────────┐
   │             │ ────────────────────────────────▶ │                     │
   │  BUYER      │                                   │   SELLER API        │
   │  AGENT      │ ◀──── 2. HTTP 402 + Requirements  │   (x402 Server)     │
   │             │                                   │                     │
   │  (AI/CLI)   │         3. X-PAYMENT header       │   /api/premium-data │
   │             │ ────────────────────────────────▶ │   /api/ai-inference │
   └─────────────┘                                   └──────────┬──────────┘
         │                                                      │
         │                                                      │
         │ EIP-3009                               4. /verify    │
         │ Authorization                          5. /settle    │
         │                                                      │
         ▼                                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                     CRONOS x402 FACILITATOR                         │
   │                                                                     │
   │  • Verifies EIP-3009 signatures                                     │
   │  • Settles USDC.e payments (gasless for buyer)                      │
   │  • Returns txHash for proof                                         │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Settlement
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                         CRONOS EVM                                  │
   │                                                                     │
   │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
   │  │ SLAStreamFactory │  │  RefundManager   │  │   AgentOracle    │  │
   │  │                  │  │                  │  │                  │  │
   │  │ • Create streams │  │ • Partial refund │  │ • Submit metrics │  │
   │  │ • SLA config     │  │ • Full refund    │  │ • Breach detect  │  │
   │  │ • Auto-stop      │  │ • Graduated tier │  │ • Signed reports │  │
   │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
   │                                                                     │
   │  USDC.e: 0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0 (testnet)      │
   └─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. Get testnet CRO from [Cronos Faucet](https://cronos.org/faucet)
2. Get testnet USDC.e from [USDC.e Faucet](https://faucet.cronos.org)

### Installation

```bash
# Clone the repository
git clone https://github.com/wildhash/parallel-pay.git cronos-parallelpay
cd cronos-parallelpay

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your private key
```

### Deploy Contracts

```bash
# Deploy to Cronos Testnet
npm run deploy:cronos-testnet

# Or deploy to Cronos Mainnet
npm run deploy:cronos
```

### Run the x402 Demo

**Terminal 1 - Start the Seller API:**
```bash
npm run seller-api
# Server running on http://localhost:3001
```

**Terminal 2 - Run the Buyer Agent:**
```bash
npm run buyer-agent
# Agent will: 1) Get 402, 2) Sign payment, 3) Receive data
```

**Terminal 3 - View Dashboard:**
```bash
npm run dashboard
# Open http://localhost:3000
```

## Core Components

### 1. Seller API (`apps/seller-api`)

x402-compliant Express server that:
- Returns HTTP 402 with payment requirements when unauthorized
- Accepts `X-PAYMENT` header with EIP-3009 authorization
- Calls Cronos x402 Facilitator to verify and settle payments
- Serves premium content after successful payment

```typescript
// Example x402 response
HTTP/1.1 402 Payment Required
X-Payment-Required: true
Content-Type: application/json

{
  "paymentRequired": true,
  "amount": "100000",           // 0.10 USDC.e (6 decimals)
  "currency": "USDC.e",
  "recipient": "0x...",
  "chainId": 338,
  "facilitatorUrl": "https://facilitator.cronoslabs.org/v2/x402"
}
```

### 2. Buyer Agent (`apps/buyer-agent`)

Autonomous agent that:
- Detects HTTP 402 responses
- Generates EIP-3009 `transferWithAuthorization` signatures
- Submits payment via `X-PAYMENT` header
- Processes received data

```typescript
// EIP-3009 Authorization (gasless!)
const authorization = await generateEIP3009Authorization({
  token: USDC_ADDRESS,
  from: buyerAddress,
  to: sellerAddress,
  value: amount,
  validAfter: 0,
  validBefore: deadline,
  nonce: randomNonce
});
```

### 3. Smart Contracts

| Contract | Purpose |
|----------|---------|
| **SLAStreamFactory** | Create streams with SLA guarantees and graduated refund tiers |
| **RefundManager** | Execute partial/full refunds based on breach severity |
| **AgentOracle** | Receive and validate SLA metrics from authorized agents |
| **X402Payment** | On-chain payment requests with refund policies |
| **ParallelPay** | Base streaming contract with parallel execution support |

### 4. SLA-Backed Streaming

Create streams with automatic refund guarantees:

```typescript
const slaConfig = {
  maxLatencyMs: 200,           // Max 200ms response time
  minUptimePercent: 9950,      // 99.50% uptime required
  maxErrorRate: 50,            // Max 0.50% error rate
  maxJitterMs: 50,             // Max 50ms jitter
  refundPercentOnBreach: 1000, // 10% refund per breach
  autoStopOnSevereBreach: true // Auto-cancel on 3+ breaches
};

// Graduated refund tiers
// Tier 1: 10% refund (minor breach)
// Tier 2: 25% refund (moderate breach)
// Tier 3: 50% refund (severe breach)
```

## Network Configuration

### Cronos Testnet
- **Chain ID**: 338
- **RPC**: `https://evm-t3.cronos.org`
- **Explorer**: `https://explorer.cronos.org/testnet`
- **USDC.e**: `0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0`
- **Faucet**: https://faucet.cronos.org

### Cronos Mainnet
- **Chain ID**: 25
- **RPC**: `https://evm.cronos.org`
- **Explorer**: `https://explorer.cronos.org`
- **USDC.e**: `0xc21223249CA28397B4B6541dfFaEcC539BfF0c59`

### x402 Facilitator
- **URL**: `https://facilitator.cronoslabs.org/v2/x402`
- **Endpoints**: `/verify`, `/settle`, `/supported`

## API Reference

### Seller API Endpoints

```
GET  /api/premium-data      - Premium data endpoint (requires x402 payment)
GET  /api/ai-inference      - AI inference endpoint (requires x402 payment)
GET  /api/health            - Health check
GET  /api/pricing           - View pricing information
POST /api/streams           - Create SLA-backed stream
GET  /api/streams/:id       - Get stream details
```

### Dashboard Endpoints

```
GET  /api/info              - Deployment information
GET  /api/streams/:count    - List recent streams
GET  /api/stream/:id        - Get specific stream details
GET  /api/payments          - List x402 payments
GET  /api/refunds           - List refund events
```

## Agent SDK

Full-featured SDK for building x402-compatible agents:

```typescript
import { SLAMonitor, RefundExecutor, X402Client } from './agent-sdk';

// Initialize x402 client
const x402 = new X402Client({
  facilitatorUrl: 'https://facilitator.cronoslabs.org/v2/x402',
  signer: wallet
});

// Make x402 payment
const result = await x402.payForResource({
  url: 'https://api.example.com/premium-data',
  amount: '100000', // 0.10 USDC.e
});

// Initialize SLA monitor
const monitor = new SLAMonitor(oracleAddress, streamFactoryAddress, signer);
monitor.addStream(streamId);
monitor.startMonitoring(10000); // Check every 10s

// Listen for breaches and auto-refund
monitor.on('breach', async (event) => {
  const refundExecutor = new RefundExecutor(refundManagerAddress, signer);
  await refundExecutor.executePartialRefund({
    streamId: event.streamId,
    breachType: event.breachType,
    breachValue: event.breachValue
  });
});
```

## Demo Flows

### Flow A: Basic x402 Paywall

```bash
# 1. Buyer requests resource
curl http://localhost:3001/api/premium-data
# Returns: 402 Payment Required

# 2. Buyer pays and retries
curl -H "X-PAYMENT: <eip3009-auth>" http://localhost:3001/api/premium-data
# Returns: { "data": "premium content", "txHash": "0x..." }
```

### Flow B: Streaming with SLA

```bash
# 1. Create stream with SLA config
npm run create-stream -- --recipient 0x... --amount 1000000 --sla strict

# 2. Monitor metrics
npm run monitor-stream -- --streamId 1

# 3. Simulate breach and auto-refund
npm run simulate-degradation
```

### Flow C: Full Agent Workflow

```bash
# Run complete autonomous agent demo
npm run agent-demo

# This will:
# 1. Deploy fresh contracts
# 2. Create SLA-backed stream
# 3. Monitor service metrics
# 4. Detect breach and execute refund
# 5. Log everything to dashboard
```

## Scripts

```bash
npm run compile              # Compile Solidity contracts
npm run deploy:cronos-testnet # Deploy to Cronos testnet
npm run deploy:cronos        # Deploy to Cronos mainnet

npm run seller-api           # Start x402 seller server
npm run buyer-agent          # Run autonomous buyer agent
npm run dashboard            # Start dashboard UI

npm run stress-parallel      # Run parallel execution benchmark
npm run simulate-degradation # Simulate SLA breach and refund

npm run test                 # Run full test suite
npm run test-hardhat         # Run Hardhat tests only
```

## Use Cases

1. **API Monetization**: Pay-per-call APIs with automatic refunds on downtime
2. **AI Agent Services**: Agents buying compute, data, or inference with SLA guarantees
3. **Data Streaming**: Real-time feeds with latency guarantees
4. **CDN Services**: Content delivery with availability SLAs
5. **Cloud Infrastructure**: Pay-per-use compute with uptime guarantees

## Hackathon Submission

**Cronos x402 Paytech Hackathon** - January 2026

### Tracks
- [x] Main Track: x402 Applications
- [x] x402 Agentic Finance Track
- [x] Crypto.com Ecosystem Integration
- [x] Dev Tooling Track

### What We Built
1. **Full x402 Integration**: Seller API + Buyer Agent with Cronos Facilitator
2. **SLA-Backed Streaming**: Automatic refunds on service degradation
3. **Graduated Refund Tiers**: 10%/25%/50% based on breach severity
4. **Real-time Dashboard**: Live payment and SLA monitoring
5. **Agent SDK**: Full toolkit for building x402-compatible agents

## Resources

- [Cronos x402 Facilitator Docs](https://docs.cronos.org/cronos-x402-facilitator/introduction)
- [Quick Start for Sellers](https://docs.cronos.org/cronos-x402-facilitator/quick-start-for-sellers)
- [Quick Start for Buyers](https://docs.cronos.org/cronos-x402-facilitator/quick-start-for-buyers)
- [Cronos EVM Docs](https://docs.cronos.org)
- [Crypto.com AI Agent SDK](https://ai-agent-sdk-docs.crypto.com/)

## Security

- Checks-effects-interactions pattern
- Reentrancy guards on all external calls
- EIP-3009 signature verification
- Access control on sensitive operations
- Custom errors for gas efficiency

## License

ISC

---

**Built for Cronos x402** | Gasless Agentic Payments | SLA-Backed Streams | Automatic Refunds
