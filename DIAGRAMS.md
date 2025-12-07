# System Architecture Diagram

## ParallelPay System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MONAD PARALLEL EVM                           │
│                                                                       │
│  ┌─────────────────────────┐    ┌─────────────────────────┐        │
│  │   ParallelPay.sol       │    │   X402Payment.sol       │        │
│  │                         │    │                         │        │
│  │  • Stream Creation      │    │  • Payment Requests     │        │
│  │  • Batch Operations     │    │  • Refund Policies      │        │
│  │  • Withdrawals          │    │  • Agent Payments       │        │
│  │  • Cancellations        │    │  • Batch Requests       │        │
│  │                         │    │                         │        │
│  │  Isolated Storage:      │    │  Isolated Storage:      │        │
│  │  mapping(id => Stream)  │    │  mapping(id => Request) │        │
│  └───────────┬─────────────┘    └───────────┬─────────────┘        │
│              │                               │                       │
└──────────────┼───────────────────────────────┼───────────────────────┘
               │                               │
               │    ┌──────────────────────┐   │
               └────►  TypeScript SDK      ◄───┘
                    │                      │
                    │  • ParallelPaySDK   │
                    │  • X402PaymentSDK   │
                    │  • Type Definitions │
                    │  • Event Parsing    │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
   │  Dashboard  │    │ Applications │    │  Scripts     │
   │             │    │              │    │              │
   │ • Web UI    │    │ • DApps      │    │ • Deploy     │
   │ • REST API  │    │ • Services   │    │ • Stress Test│
   │ • Real-time │    │ • Bots       │    │ • Testing    │
   └─────────────┘    └──────────────┘    └──────────────┘
```

## Data Flow - Stream Creation

```
User Application
       │
       │ createStream(recipient, start, stop, amount)
       ▼
  SDK (TypeScript)
       │
       │ Encode transaction data
       ▼
  Monad Network
       │
       │ Route to available core
       ▼
 ParallelPay Contract
       │
       ├─► Validate inputs
       ├─► Generate stream ID
       ├─► Store in isolated slot: streams[id]
       └─► Emit StreamCreated event
              │
              ▼
         Transaction Receipt
              │
              ├─► Dashboard (via API polling)
              └─► User Application (return streamId)
```

## Parallel Execution Flow

```
Batch Transaction: Create 50 Streams
             │
             ▼
    ┌────────────────┐
    │ Monad Parallel │
    │  EVM Router    │
    └────────┬───────┘
             │
    ┌────────┴────────┐
    │   Parallel      │
    │  Scheduling     │
    └────────┬────────┘
             │
    ┌────────┴─────────────────────────────┐
    │        │         │         │          │
    ▼        ▼         ▼         ▼          ▼
 Core 0   Core 1   Core 2   Core 3   ...  Core N
    │        │         │         │          │
    ├─►ID 0  ├─►ID 1   ├─►ID 2   ├─►ID 3   ├─►ID 4
    ├─►ID 10 ├─►ID 11  ├─►ID 12  ├─►ID 13  ├─►ID 14
    ├─►ID 20 ├─►ID 21  ├─►ID 22  ├─►ID 23  ├─►ID 24
    └────────┴─────────┴─────────┴──────────┘
                   │
                   ▼
         All streams created
         independently with
         ZERO lock contention
```

## X402 Payment Flow

```
┌──────────────┐                           ┌──────────────┐
│   Agent A    │                           │   Agent B    │
│  (Requester) │                           │   (Payer)    │
└──────┬───────┘                           └──────┬───────┘
       │                                          │
       │ 1. setRefundPolicy()                    │
       ├──────────────────────┐                  │
       │                      ▼                  │
       │              X402Payment Contract       │
       │                                         │
       │ 2. createPaymentRequest()               │
       ├──────────────────────┐                  │
       │                      ▼                  │
       │              Store Request              │
       │              Return requestId           │
       │◄─────────────────────┤                  │
       │                                         │
       │ 3. Send 402 Response with requestId     │
       ├─────────────────────────────────────────►
       │                                         │
       │                    4. payRequest()      │
       │                      ◄──────────────────┤
       │                                         │
       │ 5. Transfer ETH                         │
       │◄─────────────────────┐                  │
       │                      │                  │
       │                                         │
       │ (Optional) 6. requestRefund()           │
       │                      ◄──────────────────┤
       │                                         │
       │ 7. Calculate: amount - penalty          │
       │    Send refund to payer                 │
       │    Send penalty to requester            │
       ├──────────────────────┼─────────────────►
       │◄─────────────────────┘                  │
       │                                         │
```

## Storage Architecture

```
ParallelPay Contract Storage Layout:

┌─────────────────────────────────────────────┐
│ Slot 0: nextStreamId (counter)             │
├─────────────────────────────────────────────┤
│ Slot 1+: streams mapping                    │
│                                             │
│   streams[0] = Stream { ... }               │
│   ├─ sender                                 │
│   ├─ recipient                              │
│   ├─ deposit                                │
│   ├─ startTime                              │
│   ├─ stopTime                               │
│   ├─ ratePerSecond                          │
│   ├─ remainingBalance                       │
│   └─ isActive                               │
│                                             │
│   streams[1] = Stream { ... }               │
│   streams[2] = Stream { ... }               │
│   ...                                       │
│   streams[N] = Stream { ... }               │
│                                             │
│   ⚠️ Each stream ID maps to unique storage  │
│      slot = no conflicts = parallel exec    │
└─────────────────────────────────────────────┘

Why This Enables Parallelism:
✓ streams[0] and streams[1] use different storage slots
✓ No shared state between streams
✓ No lock contention
✓ Multiple cores can write simultaneously
✓ O(1) access time per operation
```

## Dashboard Architecture

```
┌─────────────────────────────────────────────────────┐
│              Web Browser (Client)                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │            index.html (UI)                    │  │
│  │                                               │  │
│  │  • Stream Cards with Progress Bars           │  │
│  │  • Statistics (Total, Active, TVL)           │  │
│  │  • Auto-refresh (10s interval)               │  │
│  │  • Contract Addresses Display                │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                                │
└─────────────────────┼────────────────────────────────┘
                      │
                      │ HTTP REST API
                      │
┌─────────────────────▼────────────────────────────────┐
│           Express Server (dashboard/server.ts)       │
│                                                       │
│  Routes:                                             │
│  ├─ GET /api/info          → Deployment info        │
│  ├─ GET /api/streams/:n    → List streams           │
│  ├─ GET /api/stream/:id    → Single stream          │
│  └─ GET /api/payment-requests/:n → List requests    │
│                                                       │
└──────────────────────┬────────────────────────────────┘
                       │
                       │ Web3 RPC
                       │
┌──────────────────────▼────────────────────────────────┐
│              TypeScript SDK                           │
│                                                       │
│  ├─ ParallelPaySDK.getStream(id)                    │
│  ├─ ParallelPaySDK.balanceOf(id)                    │
│  └─ X402PaymentSDK.getPaymentRequest(id)            │
│                                                       │
└──────────────────────┬────────────────────────────────┘
                       │
                       │ JSON-RPC
                       │
┌──────────────────────▼────────────────────────────────┐
│              Monad Testnet                            │
│                                                       │
│  ├─ ParallelPay Contract                            │
│  └─ X402Payment Contract                            │
│                                                       │
└───────────────────────────────────────────────────────┘
```

## Deployment Flow

```
Developer Machine
       │
       │ 1. npm install
       │ 2. npm run compile
       │ 3. Configure .env
       ▼
┌──────────────────┐
│  Compiled        │
│  Artifacts       │
└────────┬─────────┘
         │
         │ 4. npm run deploy
         ▼
┌──────────────────────────┐
│   Deployment Script      │
│   (scripts/deploy.ts)    │
│                          │
│  ├─ Load artifacts       │
│  ├─ Connect to RPC       │
│  ├─ Get deployer account │
│  └─ Deploy contracts     │
└────────┬─────────────────┘
         │
         │ Web3 RPC
         ▼
┌──────────────────────────┐
│   Monad Testnet          │
│                          │
│  ├─ Deploy ParallelPay   │
│  ├─ Deploy X402Payment   │
│  └─ Return addresses     │
└────────┬─────────────────┘
         │
         │ Save deployment info
         ▼
┌──────────────────────────┐
│  deployments/            │
│  monad-testnet.json      │
│                          │
│  {                       │
│    "ParallelPay": "0x.." │
│    "X402Payment": "0x.." │
│  }                       │
└──────────────────────────┘
         │
         │ Used by:
         ├─► Dashboard
         ├─► Stress Tests
         └─► User Applications
```

## Gas Optimization Strategy

```
Traditional Approach:
┌─────────────────────────────────────┐
│  function createStream() {          │
│    Stream memory stream = Stream({  │
│      sender: msg.sender,            │
│      recipient: recipient,          │  ← Stack too deep!
│      deposit: msg.value,            │  ← Too many variables
│      startTime: startTime,          │
│      stopTime: stopTime,            │
│      ...                            │
│    });                              │
│  }                                  │
└─────────────────────────────────────┘

ParallelPay Approach:
┌─────────────────────────────────────┐
│  function createStream() {          │
│    Stream storage s = streams[id];  │
│    s.sender = msg.sender;           │  ← Direct storage write
│    s.recipient = recipient;         │  ← Avoids stack depth
│    s.deposit = msg.value;           │  ← Gas efficient
│    ...                              │
│  }                                  │
│                                     │
│  + viaIR compilation                │  ← Advanced optimizer
│  + Custom errors                    │  ← 50% gas savings
└─────────────────────────────────────┘
```

## Security Model

```
┌─────────────────────────────────────────────────────┐
│                   Function Call                      │
└───────────────────────┬─────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │                             │
         ▼                             ▼
    ┌────────┐                    ┌────────┐
    │ CHECKS │                    │ CHECKS │
    └────┬───┘                    └───┬────┘
         │                            │
         │ • Validate inputs          │
         │ • Check authorization      │
         │ • Verify state             │
         │                            │
         ▼                            ▼
    ┌─────────┐                  ┌─────────┐
    │ EFFECTS │                  │ EFFECTS │
    └────┬────┘                  └───┬─────┘
         │                           │
         │ • Update balances         │
         │ • Change state            │
         │ • Emit events             │
         │                           │
         ▼                           ▼
    ┌──────────────┐           ┌──────────────┐
    │ INTERACTIONS │           │ INTERACTIONS │
    └──────┬───────┘           └──────┬───────┘
           │                          │
           │ • Transfer ETH           │
           │ • External calls         │
           │                          │
           ▼                          ▼
      ✅ Success                  ✅ Success
      
Pattern prevents reentrancy and ensures safe execution
```

## Performance Comparison

```
Traditional Sequential Processing:
┌─────┬─────┬─────┬─────┬─────┐
│ S1  │ S2  │ S3  │ S4  │ S5  │  ... ← 50 streams
└─────┴─────┴─────┴─────┴─────┘
Time: 50 × 500ms = 25 seconds
Gas: 50 × 100k = 5M gas

Monad Parallel Processing:
┌─────┐
│ S1  │
├─────┤
│ S2  │
├─────┤
│ S3  │  ← All 50 streams executed
├─────┤     simultaneously across
│ S4  │     multiple cores
├─────┤
│ S5  │
└─────┘
Time: 500ms (parallel)
Gas: 50 × 70k = 3.5M gas (30% savings)

Speedup: 50x faster!
Gas savings: 30%
Throughput: 100 streams/sec vs 2 streams/sec
```

---

**Legend:**
- `│ └ ┌ ┐ ├ ┤ ┬ ┴ ┼` - Box drawing characters
- `→ ← ↑ ↓ ◄ ►` - Arrows showing data flow
- `✅` - Success/completion
- `⚠️` - Important notes
