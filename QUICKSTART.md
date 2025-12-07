# Quick Start Guide

Get ParallelStream up and running with SLA-enforced payment streaming in 5 minutes!

## 1. Installation (1 minute)

```bash
# Clone repository
git clone https://github.com/wildhash/monad-parallelstream.git
cd monad-parallelstream

# Install dependencies
npm install --legacy-peer-deps
```

## 2. Configuration (1 minute)

```bash
# Create environment file
cp .env.example .env

# Edit .env (use your favorite editor)
nano .env
```

Add your private key:
```bash
PRIVATE_KEY=0xyour_private_key_here
MONAD_RPC_URL=https://testnet.monad.xyz
```

⚠️ **Never commit your .env file!**

## 3. Compile Contracts (30 seconds)

```bash
npm run compile
```

You should see:
```
✓ Compiled SLAStreamFactory
✓ Compiled AgentOracle
✓ Compiled RefundManager
✓ Compiled ParallelPay
✓ Compiled X402Payment
```

## 4. Get Testnet Tokens (1 minute)

1. Get your address from private key
2. Visit: https://faucet.monad.xyz
3. Request testnet ETH
4. Wait for confirmation

## 5. Deploy (1 minute)

```bash
npm run deploy
```

Save the contract addresses shown in the output:
```
✅ Deployment Complete!
  SLAStreamFactory: 0x...
  AgentOracle:      0x...
  RefundManager:    0x...
  ParallelPay:      0x...
  X402Payment:      0x...
```

## 6. Test SLA Features! (2 minutes)

### Option A: SLA Degradation Simulation
```bash
npm run simulate-degradation
```

This creates streams with strict SLA, simulates performance degradation, and triggers automatic refunds!

### Option B: Parallel Stress Test
```bash
npm run stress-parallel 50
```

Watch 50 SLA-enforced streams get created and monitored in parallel!

## 7. View Dashboard (30 seconds)

```bash
npm run dashboard
```

Open: http://localhost:3000

## What's Next?

### For Developers

- Check out [EXAMPLES.md](EXAMPLES.md) for code samples
- Read [SLA_ARCHITECTURE.md](SLA_ARCHITECTURE.md) to understand the SLA system
- See [ARCHITECTURE.md](ARCHITECTURE.md) for parallel execution design
- Explore [DEPLOYMENT.md](DEPLOYMENT.md) for advanced deployment

### For Users

- Explore the dashboard interface
- Try creating your own SLA-enforced streams
- Monitor real-time payments and SLA metrics
- Observe automatic refund execution

### Quick SLA Example

Create a stream with SLA monitoring:

```typescript
import { ethers } from 'ethers';
import SLAStreamFactoryArtifact from './artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json';

const streamFactory = new ethers.Contract(
  streamFactoryAddress,
  SLAStreamFactoryArtifact.abi,
  signer
);

// Define SLA
const sla = {
  maxLatencyMs: 500,
  minUptimePercent: 9900,      // 99.00%
  maxErrorRate: 100,           // 1.00%
  maxJitterMs: 100,
  refundPercentOnBreach: 500,  // 5% refund per breach
  autoStopOnSevereBreach: true
};

// Create stream with SLA
await streamFactory.createStream(
  recipientAddress,
  ethers.ZeroAddress,  // ETH
  startTime,
  stopTime,
  sla,
  { value: ethers.parseEther('1.0') }
);
```

## Common First-Time Issues

### "Insufficient funds"
→ Get more testnet ETH from faucet

### "Cannot connect to network"
→ Check your RPC_URL in .env

### "Compilation failed"
→ Make sure you ran `npm install --legacy-peer-deps`

### "OracleNotAuthorized"
→ Your deployer address is automatically authorized. Make sure you're using the same account.

### Dashboard shows "not connected"
→ Run `npm run deploy` first to create deployment file

## Commands Cheat Sheet

```bash
# Development
npm run compile               # Compile contracts
npm run deploy                # Deploy to testnet
npm run stress-parallel 100   # Create 100 parallel SLA streams
npm run simulate-degradation  # Simulate SLA breaches
npm run test                  # Run test suite
npm run dashboard             # Start dashboard

# Quick test
npm run compile && npm run test
```

## AI Agent SDK Quick Example

```typescript
import { SLAMonitor, RefundExecutor } from './agent-sdk';

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

// Start automatic refunds
await refundExecutor.startAutoRefund(1, 3); // Threshold: 1, Severity: 3

console.log('SLA monitoring and auto-refunds active!');
```

## Help & Support

- **README**: Main documentation
- **EXAMPLES**: Code examples
- **ARCHITECTURE**: Technical details
- **DEPLOYMENT**: Full deployment guide
- **GitHub Issues**: Report bugs

---

**Ready to build?** Check out the full documentation in [README.md](README.md)!
