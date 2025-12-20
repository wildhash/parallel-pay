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
    RefundTiers refundTiers; // Graduated refund tiers (optional)
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
- **Graduated refund tiers** based on breach severity

**Authorization**:
- Owner can authorize/revoke agents
- Only authorized agents can execute refunds
- Integration with AgentOracle for breach detection

**Graduated Refund Tiers**:
The system supports tiered refunds that scale based on breach severity:
- **Tier 1 (Minor)**: Small refund percentage for minor SLA violations
- **Tier 2 (Moderate)**: Medium refund percentage for noticeable degradation
- **Tier 3 (Severe)**: Large refund percentage for major SLA violations

```solidity
struct RefundTiers {
    uint16 tier1RefundPercent;  // e.g., 500 (5%)
    uint16 tier2RefundPercent;  // e.g., 1500 (15%)
    uint16 tier3RefundPercent;  // e.g., 5000 (50%)
    uint16 tier1Threshold;      // Breach value for tier 1
    uint16 tier2Threshold;      // Breach value for tier 2
}
```

**Tiered Refund Flow**:
```
Breach Detected → Calculate Tier → Determine Refund % → Execute Refund
      │                │                    │                   │
      │                │                    │                   │
  breachValue    if >= tier2Threshold   tier3Percent      Emit Events
                 elif >= tier1Threshold tier2Percent    (TieredRefundExecuted)
                 else                    tier1Percent
```

**Backward Compatibility**:
Streams created without tiers continue to use the fixed `refundPercentOnBreach` value from the SLA configuration.

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

## Graduated Refund Tiers - Configuration Examples

### Example 1: Conservative SaaS Service
For a SaaS platform with high uptime requirements:

```typescript
const refundTiers = {
  tier1RefundPercent: 200,    // 2% - Minor latency spikes
  tier2RefundPercent: 1000,   // 10% - Service degradation
  tier3RefundPercent: 3000,   // 30% - Major outage
  tier1Threshold: 100,        // < 100ms extra latency
  tier2Threshold: 500,        // 100-499ms extra latency, >= 500ms severe
};

// Create stream with tiers
const tx = await streamFactory.createStreamWithTiers(
  recipientAddress,
  ethers.ZeroAddress,
  startTime,
  stopTime,
  slaConfig,
  refundTiers,
  { value: ethers.parseEther('10.0') }
);
```

### Example 2: Aggressive API Service
For a high-performance API with strict SLAs:

```typescript
const refundTiers = {
  tier1RefundPercent: 1000,   // 10% - Any degradation
  tier2RefundPercent: 2500,   // 25% - Noticeable issues
  tier3RefundPercent: 7500,   // 75% - Critical failure
  tier1Threshold: 50,         // Very low tolerance
  tier2Threshold: 200,
};
```

### Example 3: Balanced Cloud Service
For a cloud service with moderate expectations:

```typescript
const refundTiers = {
  tier1RefundPercent: 500,    // 5% - Minor issues
  tier2RefundPercent: 1500,   // 15% - Moderate problems
  tier3RefundPercent: 5000,   // 50% - Severe breach
  tier1Threshold: 100,
  tier2Threshold: 500,
};
```

## Migration Guide: Fixed Percentage to Graduated Tiers

### Step 1: Identify Current Streams
Existing streams using fixed `refundPercentOnBreach` continue to work without changes:

```solidity
// Old method - still supported
const slaConfig = {
  maxLatencyMs: 500,
  minUptimePercent: 9900,
  maxErrorRate: 100,
  maxJitterMs: 100,
  refundPercentOnBreach: 1000,  // 10% flat rate
  autoStopOnSevereBreach: true,
};

await streamFactory.createStream(..., slaConfig, ...);
```

### Step 2: Design Your Tier Structure
Map your current fixed percentage to a tiered structure:

```
Current: 10% flat refund
↓
Graduated:
- Minor (< threshold1): 5%
- Moderate (threshold1-threshold2): 10%  ← matches old rate
- Severe (>= threshold2): 25%
```

### Step 3: Create New Streams with Tiers
For new streams, use `createStreamWithTiers`:

```typescript
const refundTiers = {
  tier1RefundPercent: 500,    // 5%
  tier2RefundPercent: 1000,   // 10% (matches old flat rate)
  tier3RefundPercent: 2500,   // 25%
  tier1Threshold: 100,
  tier2Threshold: 500,
};

await streamFactory.createStreamWithTiers(
  recipient,
  token,
  startTime,
  stopTime,
  slaConfig,  // refundPercentOnBreach ignored when tiers present
  refundTiers,
  { value: amount }
);
```

### Step 4: Update SDK Integration
Update your agent SDK calls to leverage tier information:

```typescript
// Before
const result = await refundExecutor.executePartialRefund({
  streamId: 1n,
  breachType: 'latency',
  breachValue: 300,
});

// After - same call, but result now includes tier info
const result = await refundExecutor.executePartialRefund({
  streamId: 1n,
  breachType: 'latency',
  breachValue: 300,
});

if (result.tier) {
  console.log(`Applied tier ${result.tier} refund`);
  console.log(`Refund amount: ${ethers.formatEther(result.refundAmount)} ETH`);
}
```

### Step 5: Query Tier Configuration
Check stream tier configuration programmatically:

```typescript
const tiers = await refundExecutor.getRefundTiers(streamId);

console.log('Tier Configuration:', {
  tier1: `${tiers.tier1RefundPercent / 100}% (breach < ${tiers.tier1Threshold})`,
  tier2: `${tiers.tier2RefundPercent / 100}% (breach < ${tiers.tier2Threshold})`,
  tier3: `${tiers.tier3RefundPercent / 100}% (breach >= ${tiers.tier2Threshold})`,
});
```

### Step 6: Monitor Events
Listen for tiered refund events:

```typescript
streamFactory.on('TieredRefundExecuted', (streamId, tier, amount, breachType, breachValue) => {
  console.log(`Tiered Refund: Stream ${streamId}, Tier ${tier}, Amount ${ethers.formatEther(amount)}`);
});
```

## Conclusion

ParallelStream demonstrates how Monad's parallel EVM can be leveraged to build sophisticated financial protocols with:
- Trustless SLA enforcement
- Automatic refund execution with **graduated tiers**
- Massive scalability (50-200+ concurrent operations)
- AI-powered monitoring
- Gas-efficient implementation

The graduated refund tier system provides fine-grained control over refund policies, allowing service providers to better match refund amounts to breach severity while maintaining backward compatibility with existing streams.

The system provides a blueprint for building complex, high-throughput DeFi protocols that maintain security while achieving unprecedented performance.
