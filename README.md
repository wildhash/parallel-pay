# ParallelStream 🚀

Massively parallel SLA-enforced payment streams on Monad with AI-powered monitoring and automatic trustless refunds.

## Overview

ParallelStream is a next-generation SLA-aware payment streaming protocol optimized for Monad's parallel EVM architecture. It combines high-throughput payment streaming with automated SLA monitoring, breach detection, and refund execution—enabling trustless service-level agreements with automatic financial guarantees.

### Key Features

- **🔥 Parallel Execution**: Independent storage slots per stream for zero lock contention
- **⚡ High Throughput**: Batch creation of 50-200 streams concurrently
- **💸 Real-time Streaming**: Continuous payment flows with per-second rates
- **📊 SLA Monitoring**: AI agent monitors latency, uptime, error rate, and jitter
- **🤖 Auto Refunds**: Automatic partial/full refunds on SLA breaches
- **🔄 X402 Protocol**: Agent-to-agent payments with automatic refund layer
- **📈 Live Dashboard**: Real-time visualization with SLA metrics
- **🛡️ Secure**: Gas-optimized Solidity contracts with trustless execution

## Architecture

### Smart Contracts

#### SLAStreamFactory.sol
SLA-enforced payment streaming with automatic refund triggers:
- `createStream()` - Create streams with SLA configuration
- `batchCreateStreams()` - Create 50-200 streams in parallel
- `reportSLABreach()` - Report SLA violations and trigger refunds
- `withdrawFromStream()` - Withdraw available funds
- `cancelStream()` - Cancel and settle streams
- `balanceOf()` - Query available balance

**SLA Configuration:**
```solidity
struct SLA {
  uint16 maxLatencyMs;          // Max acceptable latency
  uint16 minUptimePercent;      // Min uptime (0-10000 = 0.00%-100.00%)
  uint16 maxErrorRate;          // Max error rate (0-10000)
  uint16 maxJitterMs;           // Max jitter tolerance
  uint16 refundPercentOnBreach; // Refund % per breach (0-10000)
  bool autoStopOnSevereBreach;  // Auto-stop on 3+ breaches
}
```

#### RefundManager.sol
Executes refunds when SLA breaches occur:
- `executePartialRefund()` - Partial refund on minor breach
- `executeFullRefund()` - Full refund on severe breach
- `cancelStreamDueToSLA()` - Cancel stream for violations
- `batchExecutePartialRefunds()` - Parallel refund execution

#### AgentOracle.sol
Receives and validates signed metric reports from AI agents:
- `submitMetricReport()` - Submit metrics from authorized agent
- `submitSignedMetricReport()` - Submit with signature verification
- `batchSubmitMetricReports()` - Batch submit for 50-200 streams

#### ParallelPay.sol
Core streaming contract with isolated storage slots for parallel execution:
- `createStream()` - Create individual payment streams
- `batchCreateStreams()` - Create multiple streams in parallel
- `withdrawFromStream()` - Withdraw available funds
- `cancelStream()` - Cancel and settle streams
- `balanceOf()` - Query available balance

#### X402Payment.sol
Agent-to-agent payment protocol with refund layer (HTTP 402 inspired):
- `createPaymentRequest()` - Create payment requests
- `payRequest()` - Pay for services
- `requestRefund()` - Request refunds within policy window
- `setRefundPolicy()` - Configure refund policies
- `batchCreatePaymentRequests()` - Parallel request creation

### AI Agent SDK

**Location:** `/agent-sdk/`

Full-featured SDK for SLA monitoring and refund execution:

```typescript
import { SLAMonitor, RefundExecutor, ParallelRunner } from './agent-sdk';

// Initialize monitor
const monitor = new SLAMonitor(oracleAddress, streamFactoryAddress, signer);
monitor.addStream(streamId);
monitor.startMonitoring(10000); // Check every 10s

// Initialize refund executor
const refundExecutor = new RefundExecutor(
  refundManagerAddress,
  oracleAddress,
  streamFactoryAddress,
  signer
);

// Start automatic refund execution
refundExecutor.startAutoRefund(1, 3); // Threshold: 1, Severity: 3

// Run stress test with 100 streams
const runner = new ParallelRunner(streamFactoryAddress, signer, provider);
await runner.runStressTest(100, monitor, refundExecutor, oracleAddress);
```

### TypeScript SDK

Full-featured SDK for interacting with contracts:
```typescript
import { ParallelPaySDK, X402PaymentSDK } from './sdk';

const sdk = new ParallelPaySDK(contractAddress, signer);
await sdk.createStream(recipient, startTime, stopTime, amount);
```

## Installation

```bash
# Clone the repository
git clone https://github.com/wildhash/monad-parallelstream.git
cd monad-parallelstream

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration
```

## Usage

### 1. Compile Contracts

```bash
npm run compile
```

### 2. Deploy to Monad Testnet

```bash
# Configure .env with your PRIVATE_KEY and MONAD_RPC_URL
npm run deploy
```

### 3. Run Stress Test

Test parallel execution with 50-200 concurrent streams:

```bash
# Default: 50 streams
npm run stress-parallel

# Custom count (up to 200)
npm run stress-parallel 100
npm run stress-parallel 200
```

Example output:
```
🧪 Test 1: Creating 50 streams in parallel
✓ Created 50 streams successfully
⏱️  Time taken: 3247ms
⛽ Gas used: 12500000
📊 Average: 64.94ms per stream

📊 Test 2: Generating metric spikes
✓ Generated 250 metrics (5 rounds × 50 streams)
⏱️  Time taken: 5120ms

💰 Test 3: Executing parallel refunds
✓ Executed 10 refunds successfully
⏱️  Time taken: 1840ms
```

### 4. Simulate SLA Degradation

Demonstrate automatic refunds on SLA breaches:

```bash
npm run simulate-degradation
```

This creates streams with strict SLA, submits degraded metrics, and triggers automatic refunds.

### 5. Launch Dashboard

View real-time stream data:

```bash
npm run dashboard
```

Open http://localhost:3000 in your browser.

### 6. Run Tests

```bash
# Compile contracts
npm run compile

# Run full test suite
npm run test

# Run Hardhat tests only
npm run test-hardhat
```

## SLA-Aware Streaming

### How It Works

1. **Stream Creation with SLA**: Sender creates a stream with specific SLA thresholds
2. **AI Agent Monitoring**: Authorized agents continuously monitor service metrics
3. **Breach Detection**: Metrics are evaluated against SLA thresholds
4. **Automatic Refunds**: Breaches trigger partial or full refunds to sender
5. **Auto-Stop**: Severe breaches (3+) can automatically stop the stream

### SLA Metrics

- **Latency**: Response time in milliseconds
- **Uptime**: Service availability percentage (99.00%+)
- **Error Rate**: Percentage of failed requests (< 1.00%)
- **Jitter**: Variance in latency (ms)

### Refund Policies

```typescript
// Strict SLA (10% refund per breach)
const strictSLA = {
  maxLatencyMs: 200,
  minUptimePercent: 9950,    // 99.50%
  maxErrorRate: 50,          // 0.50%
  maxJitterMs: 50,
  refundPercentOnBreach: 1000, // 10%
  autoStopOnSevereBreach: true
};

// Moderate SLA (5% refund per breach)
const moderateSLA = {
  maxLatencyMs: 500,
  minUptimePercent: 9900,    // 99.00%
  maxErrorRate: 100,         // 1.00%
  maxJitterMs: 100,
  refundPercentOnBreach: 500, // 5%
  autoStopOnSevereBreach: true
};
```

### Use Cases

1. **API Monetization**: Pay-per-call with SLA guarantees
2. **Cloud Services**: Infrastructure payments with uptime SLAs
3. **Data Streaming**: Real-time data feeds with latency guarantees
4. **Agent Services**: AI agent payments with performance SLAs
5. **Content Delivery**: CDN payments with availability guarantees

## Parallel Execution Benefits

### Traditional Approach
- Sequential processing
- Lock contention on shared storage
- Limited throughput

### ParallelPay Approach
- **Isolated Storage Slots**: Each stream uses independent storage
- **Zero Lock Contention**: Parallel transactions don't block each other
- **Linear Scaling**: Throughput scales with available cores
- **Optimized for Monad**: Leverages Monad's parallel EVM architecture

### Performance Characteristics

```
Streams Created: 50-100 concurrent
Gas Optimization: ~20-30% reduction via isolated slots
Parallel Speedup: 5-10x vs sequential
Storage Layout: O(1) access per stream
```

## X402 Payment Protocol

### Agent-to-Agent Payments

Inspired by HTTP 402 (Payment Required), X402 enables:

1. **Payment Requests**: Services create payment requests with metadata
2. **Conditional Payments**: Pay only when content/service is delivered
3. **Refund Layer**: Automatic refunds within policy windows
4. **Penalty System**: Configurable penalties for refunds

### Use Cases

- API monetization with pay-per-call
- Content delivery with verification
- Service subscriptions with guarantees
- Agent-to-agent value transfer

## API Reference

### SLAStreamFactory Contract

```solidity
// Create stream with SLA configuration
function createStream(
    address recipient,
    address token,
    uint256 startTime,
    uint256 stopTime,
    SLA calldata slaConfig
) external payable returns (uint256 streamId)

// Batch create multiple streams with SLA
function batchCreateStreams(
    address[] calldata recipients,
    address[] calldata tokens,
    uint256[] calldata startTimes,
    uint256[] calldata stopTimes,
    uint256[] calldata amounts,
    SLA[] calldata slaConfigs
) external payable returns (uint256[] memory streamIds)

// Report SLA breach (authorized oracles only)
function reportSLABreach(
    uint256 streamId,
    string calldata breachType,
    uint256 breachValue
) external

// Withdraw from stream
function withdrawFromStream(uint256 streamId, uint256 amount) external

// Cancel stream
function cancelStream(uint256 streamId) external

// Query available balance
function balanceOf(uint256 streamId) public view returns (uint256)

// Get stream details
function getStream(uint256 streamId) external view returns (SLAStream memory)
```

### AgentOracle Contract

```solidity
// Submit metric report (authorized agents only)
function submitMetricReport(
    uint256 streamId,
    uint256 latencyMs,
    uint256 uptimePercent,
    uint256 errorRate,
    uint256 jitterMs
) external returns (uint256 reportId)

// Submit signed metric report with signature verification
function submitSignedMetricReport(
    uint256 streamId,
    uint256 latencyMs,
    uint256 uptimePercent,
    uint256 errorRate,
    uint256 jitterMs,
    bytes calldata signature
) external returns (uint256 reportId)

// Batch submit metrics for multiple streams
function batchSubmitMetricReports(
    uint256[] calldata streamIds,
    uint256[] calldata latencies,
    uint256[] calldata uptimes,
    uint256[] calldata errorRates,
    uint256[] calldata jitters
) external returns (uint256[] memory reportIds)

// Get metric report details
function getMetricReport(uint256 reportId) 
    external view returns (MetricReport memory)
```

### RefundManager Contract

```solidity
// Execute partial refund for SLA breach
function executePartialRefund(
    uint256 streamId,
    string calldata breachType,
    uint256 breachValue
) external

// Execute full refund for severe breach
function executeFullRefund(
    uint256 streamId,
    string calldata reason
) external

// Cancel stream due to SLA violations
function cancelStreamDueToSLA(
    uint256 streamId,
    string calldata reason
) external

// Batch execute partial refunds
function batchExecutePartialRefunds(
    uint256[] calldata streamIds,
    string[] calldata breachTypes,
    uint256[] calldata breachValues
) external

// Get refund execution details
function getRefundExecution(uint256 executionId)
    external view returns (RefundExecution memory)
```

### AI Agent SDK API

```typescript
// SLAMonitor
class SLAMonitor {
  addStream(streamId: bigint): void
  removeStream(streamId: bigint): void
  collectMetrics(streamId: bigint): Promise<SLAMetrics>
  collectDegradedMetrics(streamId: bigint): Promise<SLAMetrics>
  evaluateSLA(metrics: SLAMetrics, config: SLAConfig): Promise<SLABreachResult>
  submitMetrics(metrics: SLAMetrics): Promise<ContractTransactionResponse>
  submitSignedMetrics(metrics: SLAMetrics): Promise<ContractTransactionResponse>
  batchSubmitMetrics(metricsList: SLAMetrics[]): Promise<ContractTransactionResponse>
  startMonitoring(intervalMs: number, degraded: boolean): void
  stopMonitoring(): void
  listenForBreaches(callback: (event: any) => void): Promise<void>
}

// RefundExecutor
class RefundExecutor {
  executePartialRefund(options: RefundOptions): Promise<RefundResult>
  executeFullRefund(streamId: bigint, reason: string): Promise<RefundResult>
  cancelStreamDueToSLA(streamId: bigint, reason: string): Promise<RefundResult>
  batchExecutePartialRefunds(options: RefundOptions[]): Promise<RefundResult[]>
  startAutoRefund(breachThreshold: number, severityThreshold: number): Promise<void>
  stopAutoRefund(): void
  getStreamStatus(streamId: bigint): Promise<any>
  listenForRefunds(callback: (event: any) => void): Promise<void>
}

// ParallelRunner
class ParallelRunner {
  createStreamsParallel(
    count: number,
    recipient: string,
    amountPerStream: bigint,
    durationSeconds: number,
    slaSeverity: 'strict' | 'moderate' | 'lenient'
  ): Promise<BenchmarkResult>
  
  generateMetricSpikes(
    monitor: SLAMonitor,
    streamIds: bigint[],
    spikeCount: number,
    degraded: boolean
  ): Promise<BenchmarkResult>
  
  executeParallelRefunds(
    refundExecutor: RefundExecutor,
    streamIds: bigint[],
    breachType: string,
    breachValue: number
  ): Promise<BenchmarkResult>
  
  runStressTest(
    streamCount: number,
    monitor: SLAMonitor,
    refundExecutor: RefundExecutor,
    oracleAddress: string,
    recipient?: string
  ): Promise<void>
  
  benchmarkParallelism(
    count: number,
    recipient: string
  ): Promise<{ parallel: BenchmarkResult; sequential: BenchmarkResult }>
}
```

### ParallelPay Contract

```solidity
function createStream(
    address recipient,
    uint256 startTime,
    uint256 stopTime
) external payable returns (uint256 streamId)

function batchCreateStreams(
    address[] calldata recipients,
    uint256[] calldata startTimes,
    uint256[] calldata stopTimes,
    uint256[] calldata amounts
) external payable returns (uint256[] memory streamIds)

function withdrawFromStream(uint256 streamId, uint256 amount) external

function cancelStream(uint256 streamId) external

function balanceOf(uint256 streamId) public view returns (uint256)
```

### X402Payment Contract

```solidity
function createPaymentRequest(
    address payer,
    uint256 amount,
    uint256 deadline,
    bytes32 contentHash,
    string calldata metadata
) external returns (uint256 requestId)

function payRequest(uint256 requestId) external payable

function requestRefund(uint256 requestId) external

function setRefundPolicy(
    uint256 refundWindow,
    uint256 penaltyPercent,
    bool autoRefundEnabled
) external
```

## Dashboard API

### Endpoints

```
GET /api/info                    - Deployment information
GET /api/streams/:count          - List recent streams
GET /api/stream/:id              - Get specific stream details
GET /api/payment-requests/:count - List payment requests
```

## Development

### Project Structure

```
monad-parallelstream/
├── contracts/           # Solidity smart contracts
│   ├── ParallelPay.sol
│   └── X402Payment.sol
├── sdk/                 # TypeScript SDK
│   └── index.ts
├── scripts/             # Deployment and testing scripts
│   ├── compile.js
│   ├── deploy.ts
│   └── stress-test.ts
├── dashboard/           # Real-time dashboard
│   ├── server.ts
│   └── public/
│       └── index.html
├── artifacts/           # Compiled contracts
├── deployments/         # Deployment records
└── test/               # Test files
```

### Running Tests

```bash
# Run stress test against local node
npm run stress-test

# Deploy to Monad Testnet
npm run deploy

# Start dashboard
npm run dashboard
```

## Monad Testnet Deployment

### Prerequisites

1. Get testnet tokens from [Monad Faucet](https://faucet.monad.xyz)
2. Configure `.env`:
```bash
PRIVATE_KEY=your_private_key_here
MONAD_RPC_URL=https://testnet.monad.xyz
```

### Deployment

```bash
npm run deploy
```

Deployment addresses are saved to `deployments/monad-testnet.json`.

## Security Considerations

- ✅ Custom errors for gas efficiency
- ✅ Reentrancy protection via checks-effects-interactions
- ✅ Isolated storage slots prevent cross-stream interference
- ✅ Integer overflow protection (Solidity 0.8+)
- ✅ Access control on sensitive operations
- ✅ Deadline validation on payment requests

## Gas Optimization

### Techniques Used

1. **Custom Errors**: 50% gas savings vs strings
2. **Storage Packing**: Efficient struct layout
3. **Batch Operations**: Amortized costs across multiple operations
4. **View Functions**: Off-chain queries at zero cost
5. **viaIR Compilation**: Advanced optimizer with Yul intermediate representation

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

ISC

## Links

- **Repository**: https://github.com/wildhash/monad-parallelstream
- **Monad Network**: https://monad.xyz
- **Documentation**: See this README

## Support

For issues and questions:
- Open a GitHub issue
- Join the Monad Discord

---

**Built for Monad's Parallel EVM** | Optimized for Massive Concurrency | Real-time Value Transfer at Scale

