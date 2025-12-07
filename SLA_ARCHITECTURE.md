# ParallelStream System Architecture

## Overview

ParallelStream is a comprehensive SLA-aware payment streaming system built for Monad's parallel EVM. The system consists of three main layers that work together to provide trustless, automated service-level agreements with financial guarantees.

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    User Applications                         │
│              (Dashboards, CLIs, Services)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│               AI Agent SDK Layer (Off-Chain)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ SLAMonitor   │  │RefundExecutor│  │ParallelRunner│     │
│  │              │  │              │  │              │     │
│  │ - Metrics    │  │ - Refund     │  │ - Stress     │     │
│  │ - Evaluation │  │   Execution  │  │   Testing    │     │
│  │ - Submission │  │ - Event      │  │ - Benchmark  │     │
│  │              │  │   Listening  │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│           Smart Contract Layer (On-Chain - Monad)            │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ SLAStreamFactory │  │ AgentOracle  │  │RefundManager │ │
│  │                  │  │              │  │              │ │
│  │ - Stream         │  │ - Metric     │  │ - Partial    │ │
│  │   Creation       │  │   Reports    │  │   Refunds    │ │
│  │ - SLA Config     │  │ - Signature  │  │ - Full       │ │
│  │ - Breach         │  │   Verify     │  │   Refunds    │ │
│  │   Handling       │  │ - Breach     │  │ - Cancel     │ │
│  │ - Withdrawals    │  │   Events     │  │   Streams    │ │
│  └──────────────────┘  └──────────────┘  └──────────────┘ │
│                                                              │
│  ┌──────────────────┐  ┌──────────────┐                    │
│  │   ParallelPay    │  │ X402Payment  │                    │
│  │                  │  │              │                    │
│  │ - Basic Streams  │  │ - Payment    │                    │
│  │ - Withdrawals    │  │   Requests   │                    │
│  │ - Cancellation   │  │ - Refunds    │                    │
│  └──────────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Smart Contract Layer

#### SLAStreamFactory.sol
**Purpose**: Core SLA-enforced streaming contract  
**Key Features**:
- Creates payment streams with SLA configuration
- Stores streams in isolated storage slots for parallel execution
- Handles SLA breach reporting and automatic refunds
- Supports batch operations for 50-200 streams

**Storage Design**:
```solidity
struct SLAStream {
    address sender;           // Payer
    address recipient;        // Payee
    address token;           // Token address (ETH = address(0))
    uint256 deposit;         // Initial deposit
    uint256 startTime;       // Stream start timestamp
    uint256 stopTime;        // Stream end timestamp
    uint256 ratePerSecond;   // Streaming rate
    uint256 remainingBalance;// Current balance
    bool isActive;           // Stream status
    SLA slaConfig;          // SLA thresholds
    uint256 breachCount;     // Number of breaches
    uint256 totalRefunded;   // Total refunded amount
}

mapping(uint256 => SLAStream) public streams; // Isolated slots
```

**Parallel Optimization**:
- Each stream uses independent storage slot
- No shared state between streams
- Zero lock contention during batch operations
- O(1) access time per stream

#### AgentOracle.sol
**Purpose**: Metric collection and breach detection  
**Key Features**:
- Accepts metric reports from authorized AI agents
- Validates signatures for secure reporting
- Emits breach events for off-chain processing
- Supports batch metric submission

**Metric Structure**:
```solidity
struct MetricReport {
    uint256 streamId;
    uint256 latencyMs;
    uint256 uptimePercent;    // 0-10000 (0.00%-100.00%)
    uint256 errorRate;        // 0-10000 (0.00%-100.00%)
    uint256 jitterMs;
    uint256 timestamp;
    address reporter;
}
```

#### RefundManager.sol
**Purpose**: Executes refunds based on SLA breaches  
**Key Features**:
- Partial refunds for minor breaches
- Full refunds for severe breaches
- Stream cancellation for critical violations
- Batch refund execution

**Authorization**:
- Owner can authorize/revoke agents
- Only authorized agents can execute refunds
- Integration with AgentOracle for breach detection

#### ParallelPay.sol
**Purpose**: Basic payment streaming (legacy)  
**Note**: Baseline implementation without SLA features

#### X402Payment.sol
**Purpose**: Agent-to-agent payment protocol  
**Features**: Payment requests, refund policies, penalties

### 2. AI Agent SDK Layer

#### SLAMonitor
**Purpose**: Continuous SLA monitoring  
**Responsibilities**:
1. Collect metrics (simulated or real)
2. Evaluate metrics against SLA thresholds
3. Submit metrics to AgentOracle
4. Detect and report breaches

**Monitoring Loop**:
```
┌─────────────────────────────────────────────┐
│  1. Collect Metrics (every N seconds)       │
│     - Query service endpoints               │
│     - Measure latency, uptime, errors       │
│     - Calculate jitter                      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  2. Evaluate Against SLA                    │
│     - Compare latency vs maxLatencyMs       │
│     - Check uptime vs minUptimePercent      │
│     - Verify error rate vs maxErrorRate     │
│     - Measure jitter vs maxJitterMs         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  3. Submit to Oracle (batch)                │
│     - Sign metrics (optional)               │
│     - Batch submit for all streams          │
│     - Emit events on breach                 │
└──────────────────┬──────────────────────────┘
                   │
                   └──────────────┐
                                  │
                          ┌───────▼──────┐
                          │  Repeat Loop │
                          └──────────────┘
```

#### RefundExecutor
**Purpose**: Automatic refund execution  
**Responsibilities**:
1. Listen for SLA breach events
2. Track breach count per stream
3. Execute appropriate refund action
4. Handle escalation to full refund/cancellation

**Refund Logic**:
```
Breach Count = 1
    └──> Execute Partial Refund (% configured in SLA)

Breach Count = 2
    └──> Execute Partial Refund

Breach Count >= 3 (Severity Threshold)
    └──> Execute Full Refund + Stream Cancellation
```

#### ParallelRunner
**Purpose**: Stress testing and benchmarking  
**Capabilities**:
1. Create 50-200 streams in parallel
2. Generate metric spikes for testing
3. Execute parallel refunds
4. Benchmark parallel vs sequential performance

### 3. User Application Layer

**Dashboard**:
- Real-time stream visualization
- SLA metrics display
- Breach notifications
- Refund transaction history

**CLI Tools**:
- `stress-parallel`: Parallel execution testing
- `simulate-degradation`: SLA breach simulation
- `deploy`: Contract deployment

## Data Flow

### Stream Creation with SLA

```
User
  │
  ├──> createStream(recipient, token, startTime, stopTime, slaConfig)
  │
  └──> SLAStreamFactory
         │
         ├──> Validate inputs
         ├──> Calculate ratePerSecond
         ├──> Store in isolated slot: streams[streamId]
         ├──> Emit StreamCreated
         └──> Emit SLAConfigured
```

### Metric Reporting and Breach Detection

```
SLAMonitor (Off-Chain)
  │
  ├──> Collect metrics from service
  ├──> Evaluate against SLA config
  │
  └──> submitMetricReport(streamId, latency, uptime, errorRate, jitter)
         │
         └──> AgentOracle
                │
                ├──> Verify agent authorization
                ├──> Store MetricReport
                ├──> Emit MetricReported
                │
                ├──> Check breach conditions
                │
                └──> If breach detected:
                       ├──> Emit SLABreached
                       └──> Trigger RefundExecutor (off-chain listener)
```

### Refund Execution

```
RefundExecutor (Off-Chain Listener)
  │
  └──> Listen for SLABreached event
         │
         ├──> Track breach count
         │
         └──> If threshold met:
                │
                └──> executePartialRefund(streamId, breachType, breachValue)
                       │
                       └──> RefundManager
                              │
                              └──> Call SLAStreamFactory.reportSLABreach()
                                     │
                                     ├──> Increment breachCount
                                     ├──> Calculate refundAmount
                                     ├──> Transfer refund to sender
                                     ├──> Emit RefundTriggered
                                     │
                                     └──> If breachCount >= 3 && autoStop:
                                            ├──> Set isActive = false
                                            └──> Return remaining balance
```

## Parallel Execution Model

### Why Monad?

Monad's parallel EVM enables true concurrent execution of transactions that don't conflict. ParallelStream leverages this by:

1. **Isolated Storage**: Each stream in separate storage slot
2. **No Shared State**: Streams don't read/write shared variables
3. **Independent Operations**: Create, withdraw, refund all independent
4. **Batch Operations**: 50-200 operations in single block

### Performance Comparison

**Traditional Sequential EVM**:
```
Stream 1 → Stream 2 → Stream 3 → ... → Stream 50
Total Time: 50 × T_single = 50T
```

**Monad Parallel EVM**:
```
Stream 1 ┐
Stream 2 ├─ Parallel Execution
Stream 3 ├─ in Single Block
  ...    │
Stream 50┘
Total Time: ~T_single
Speedup: 5-10x
```

### Storage Layout Optimization

```solidity
// BAD: Shared counter (causes contention)
uint256 public totalStreams;

function createStream() external {
    totalStreams++; // Lock needed!
    streams[totalStreams] = ...;
}

// GOOD: Independent slots (no contention)
uint256 public nextStreamId;

function batchCreateStreams() external {
    uint256 baseId = nextStreamId;
    nextStreamId += count; // Single update
    
    for (uint i = 0; i < count; i++) {
        streams[baseId + i] = ...; // Parallel writes!
    }
}
```

## Security Considerations

### Agent Authorization
- Oracle and RefundManager maintain authorized agent lists
- Only authorized agents can submit metrics or execute refunds
- Owner can add/remove agents

### Signature Verification
- Optional signed metric submission
- ECDSA signature verification on-chain
- Prevents unauthorized metric manipulation

### Refund Safeguards
- Refunds limited to configured percentage
- Cannot refund more than remaining balance
- Breach count tracked to prevent exploitation

### Reentrancy Protection
- Checks-effects-interactions pattern
- State updates before external calls
- No recursive calls in refund logic

## Gas Optimization

1. **Custom Errors**: 50% gas savings vs string reverts
2. **Storage Packing**: Efficient struct layout
3. **Batch Operations**: Amortized costs across operations
4. **View Functions**: Zero-cost balance queries
5. **Minimal State**: Only essential data stored

## Testing Strategy

### Unit Tests
- Stream creation/cancellation
- Balance calculations
- Withdrawal logic
- SLA breach reporting
- Oracle signature verification

### Integration Tests
- End-to-end stream lifecycle
- Metric submission → breach → refund
- Multi-agent coordination

### Stress Tests
- 50-200 concurrent streams
- Parallel metric submission
- Parallel refund execution
- Performance benchmarking

## Deployment Architecture

```
Development/Testing:
    - Local Hardhat Node
    - Mock metrics
    - Single agent

Monad Testnet:
    - Real contracts deployed
    - Simulated metrics
    - Multiple test agents

Monad Mainnet:
    - Production contracts
    - Real service monitoring
    - Authorized agent network
```

## Future Enhancements

1. **Token Support**: ERC-20 token streaming (currently ETH only)
2. **Oracle Network**: Decentralized metric reporting
3. **Advanced SLAs**: Complex conditions, weighted metrics
4. **Dispute Resolution**: Challenge mechanism for breaches
5. **Insurance Layer**: Optional insurance for streams
6. **Cross-Chain**: Bridge to other parallel EVMs

## Conclusion

ParallelStream demonstrates how Monad's parallel EVM can be leveraged to build sophisticated financial protocols with:
- Trustless SLA enforcement
- Automatic refund execution
- Massive scalability (50-200+ concurrent operations)
- AI-powered monitoring
- Gas-efficient implementation

The system provides a blueprint for building complex, high-throughput DeFi protocols that maintain security while achieving unprecedented performance.
