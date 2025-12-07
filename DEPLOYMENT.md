# Deployment Guide

## Prerequisites

1. **Node.js** v20+ installed
2. **npm** or **yarn** package manager
3. **Private key** with ETH for gas fees
4. **Monad testnet access** (or local node)

## Step 1: Environment Setup

### Clone and Install

```bash
git clone https://github.com/wildhash/monad-parallelstream.git
cd monad-parallelstream
npm install
```

### Configure Environment

Create `.env` file from template:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Your deployer private key (NEVER commit this!)
PRIVATE_KEY=0x...

# Monad Testnet RPC URL
MONAD_RPC_URL=https://testnet.monad.xyz

# Dashboard port (optional)
DASHBOARD_PORT=3000
```

## Step 2: Compile Contracts

Compile the Solidity contracts:

```bash
npm run compile
```

Expected output:
```
Compiling contracts...
✓ Compiled ParallelPay
✓ Compiled X402Payment

Compilation successful!
```

Artifacts will be generated in `artifacts/` directory.

## Step 3: Local Testing (Optional)

Before deploying to testnet, test locally:

### Start Local Node

```bash
# In a separate terminal
npx hardhat node
```

### Run Tests

```bash
npm run test-local
```

Expected output:
```
🧪 Testing ParallelPay Contracts

Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

1️⃣ Deploying ParallelPay...
✓ ParallelPay deployed at: 0x...

2️⃣ Deploying X402Payment...
✓ X402Payment deployed at: 0x...

3️⃣ Testing ParallelPay stream creation...
✓ Created stream #0
  - Recipient: 0x...
  - Deposit: 0.1 ETH
  - Active: true

✅ All tests passed!
```

## Step 4: Get Testnet Tokens

### Monad Testnet Faucet

1. Visit [https://faucet.monad.xyz](https://faucet.monad.xyz)
2. Enter your address
3. Request testnet ETH
4. Wait for confirmation

### Check Balance

```bash
# Using cast (from Foundry)
cast balance YOUR_ADDRESS --rpc-url https://testnet.monad.xyz

# Or use web3 provider
node -e "
const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://testnet.monad.xyz');
provider.getBalance('YOUR_ADDRESS').then(b => 
  console.log(ethers.formatEther(b) + ' ETH')
);
"
```

## Step 5: Deploy to Monad Testnet

Deploy contracts to Monad testnet:

```bash
npm run deploy
```

Expected output:
```
🚀 Deploying ParallelPay to Monad Testnet

Deployer address: 0x...
Network: https://testnet.monad.xyz
Deployer balance: 10.0 ETH

📝 Deploying ParallelPay contract...
✓ ParallelPay deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3

📝 Deploying X402Payment contract...
✓ X402Payment deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

============================================================
✅ Deployment Complete!
============================================================

📋 Deployment Summary:
  ParallelPay:  0x5FbDB2315678afecb367f032d93F642f64180aa3
  X402Payment:  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

💾 Saved to: deployments/monad-testnet.json
```

### Deployment File

The deployment information is saved to `deployments/monad-testnet.json`:

```json
{
  "network": "Monad Testnet",
  "rpcUrl": "https://testnet.monad.xyz",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "deployer": "0x...",
  "contracts": {
    "ParallelPay": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "X402Payment": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  }
}
```

## Step 6: Verify Deployment

### Check Contract on Explorer

Visit Monad testnet explorer and search for your contract addresses:
- `https://explorer.testnet.monad.xyz/address/[CONTRACT_ADDRESS]`

### Test Basic Functionality

```bash
# Run a simple test
node -e "
const { ethers } = require('ethers');
const { ParallelPaySDK } = require('./sdk/index.js');

const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const sdk = new ParallelPaySDK('YOUR_CONTRACT_ADDRESS', signer);

sdk.getNextStreamId().then(id => console.log('Next Stream ID:', id));
"
```

## Step 7: Run Stress Test

Test parallel execution capabilities:

```bash
npm run stress-test
```

This will:
1. Create 50 payment streams concurrently
2. Query stream data in parallel
3. Create 50 X402 payment requests
4. Display performance metrics

Expected output:
```
🚀 ParallelPay Stress Test

Deployer address: 0x...
Deployer balance: 5.0 ETH

📝 Deploying ParallelPay contract...
✓ ParallelPay deployed at: 0x...

🧪 Test 1: Creating 50 streams in parallel

✓ Created 50 streams successfully
⏱️  Time taken: 2847ms
⛽ Gas used: 11234567
📊 Average: 56.94ms per stream

Stream IDs: 0, 1, 2, 3, 4...

🧪 Test 2: Querying stream data in parallel

✓ Queried 50 streams successfully
⏱️  Time taken: 1234ms
📊 Average: 24.68ms per query

============================================================
✅ Stress Test Complete!
============================================================
```

## Step 8: Launch Dashboard

Start the real-time dashboard:

```bash
npm run dashboard
```

Expected output:
```
🌐 ParallelPay Dashboard running at http://localhost:3000

📊 API Endpoints:
  GET /api/info                    - Deployment info
  GET /api/streams/:count          - List streams
  GET /api/stream/:id              - Get stream details
  GET /api/payment-requests/:count - List payment requests
```

### Access Dashboard

Open your browser to:
```
http://localhost:3000
```

You should see:
- Total streams count
- Active streams
- Total value locked (TVL)
- Individual stream cards with progress bars
- Contract addresses

## Step 9: Integration Testing

### Create Test Streams

```bash
node -e "
const { ethers } = require('ethers');
const { ParallelPaySDK } = require('./sdk/index.js');

async function test() {
  const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  const deployment = require('./deployments/monad-testnet.json');
  const sdk = new ParallelPaySDK(deployment.contracts.ParallelPay, signer);
  
  const now = Math.floor(Date.now() / 1000);
  const { streamId } = await sdk.createStream(
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // recipient
    now,
    now + 3600, // 1 hour
    ethers.parseEther('0.01')
  );
  
  console.log('Stream created:', streamId);
}

test();
"
```

### Query Streams

```bash
curl http://localhost:3000/api/streams/10 | jq
```

## Step 10: Production Deployment

### Mainnet Deployment (When Ready)

1. **Audit contracts** - Get professional security audit
2. **Test thoroughly** - Complete all edge cases
3. **Update configuration**:
   ```bash
   MONAD_RPC_URL=https://mainnet.monad.xyz
   ```
4. **Deploy**:
   ```bash
   npm run deploy
   ```

### Security Checklist

- [ ] Private key stored securely (hardware wallet recommended)
- [ ] Contracts audited by reputable firm
- [ ] All tests passing
- [ ] Gas optimization reviewed
- [ ] Access controls verified
- [ ] Emergency pause mechanism (if needed)
- [ ] Upgrade path considered
- [ ] Documentation complete

## Troubleshooting

### Common Issues

#### 1. "Insufficient funds" error

**Problem**: Not enough ETH for deployment gas

**Solution**:
```bash
# Check balance
cast balance $ADDRESS --rpc-url $MONAD_RPC_URL

# Get more testnet tokens from faucet
```

#### 2. "Cannot download compiler" error

**Problem**: Blocked access to solc downloads

**Solution**:
```bash
# Use our custom compile script
npm run compile
```

#### 3. "Network connection failed"

**Problem**: Can't connect to RPC

**Solution**:
```bash
# Test RPC connection
curl -X POST $MONAD_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Try alternative RPC if needed
```

#### 4. "Transaction underpriced"

**Problem**: Gas price too low

**Solution**:
```bash
# Check current gas price
cast gas-price --rpc-url $MONAD_RPC_URL

# Increase gas price in transaction
```

#### 5. Dashboard not loading

**Problem**: Port conflict or deployment file missing

**Solution**:
```bash
# Check if port is in use
lsof -i :3000

# Verify deployment file exists
ls -la deployments/monad-testnet.json

# Try different port
DASHBOARD_PORT=3001 npm run dashboard
```

## Advanced Configuration

### Custom RPC Provider

```typescript
// scripts/deploy.ts
const provider = new ethers.JsonRpcProvider(
  process.env.MONAD_RPC_URL || 'https://custom-rpc.example.com',
  {
    chainId: 41454,
    name: 'Monad Testnet'
  }
);
```

### Gas Price Configuration

```typescript
const tx = await sdk.createStream(
  recipient,
  startTime,
  stopTime,
  amount,
  {
    maxFeePerGas: ethers.parseUnits('50', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
  }
);
```

### Multiple Network Support

```bash
# .env.development
MONAD_RPC_URL=https://testnet.monad.xyz

# .env.production
MONAD_RPC_URL=https://mainnet.monad.xyz
```

## Monitoring

### Contract Events

```typescript
// Monitor stream creation
const filter = contract.filters.StreamCreated();
contract.on(filter, (streamId, sender, recipient, ...args) => {
  console.log('New stream:', streamId);
});
```

### Analytics

Track key metrics:
- Total streams created
- Total value locked (TVL)
- Active streams
- Transaction volume
- Gas costs
- User activity

### Alerts

Set up alerts for:
- Large withdrawals
- Stream cancellations
- Failed transactions
- Unusual activity

## Next Steps

1. **Integrate with your application**
2. **Set up monitoring and alerts**
3. **Create user documentation**
4. **Build additional features**
5. **Scale to production**

## Support

- **GitHub Issues**: https://github.com/wildhash/monad-parallelstream/issues
- **Documentation**: See README.md and ARCHITECTURE.md
- **Examples**: See EXAMPLES.md

## Resources

- [Monad Documentation](https://docs.monad.xyz)
- [Ethers.js Documentation](https://docs.ethers.org)
- [Solidity Documentation](https://docs.soliditylang.org)
