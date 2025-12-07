# ParallelPay Examples

## Example 1: Simple Payment Stream

Create a payment stream for a freelancer working on a project:

```typescript
import { ethers } from 'ethers';
import { ParallelPaySDK, deployParallelPay } from './sdk/index.js';

async function payFreelancer() {
  // Set up provider and signer
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  // Deploy or connect to existing contract
  const { address } = await deployParallelPay(signer);
  const sdk = new ParallelPaySDK(address, signer);
  
  // Create a 30-day stream paying 1 ETH total
  const freelancerAddress = '0x...';
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const stopTime = now + (30 * 24 * 60 * 60); // 30 days
  const amount = ethers.parseEther('1.0'); // 1 ETH
  
  const { streamId, tx } = await sdk.createStream(
    freelancerAddress,
    startTime,
    stopTime,
    amount
  );
  
  console.log(`Stream created! ID: ${streamId}`);
  console.log(`Transaction: ${tx.hash}`);
  
  // Freelancer can withdraw at any time
  // Rate: 1 ETH / 30 days ≈ 0.00038 ETH per hour
}
```

## Example 2: Subscription Service

Monthly subscription with automatic streaming:

```typescript
async function createSubscription() {
  const sdk = new ParallelPaySDK(contractAddress, signer);
  
  // Create monthly recurring stream
  const subscriber = '0x...';
  const serviceProvider = '0x...';
  const now = Math.floor(Date.now() / 1000);
  
  // $10/month at $2000/ETH = 0.005 ETH/month
  const monthlyAmount = ethers.parseEther('0.005');
  
  const { streamId } = await sdk.createStream(
    serviceProvider,
    now,
    now + (30 * 24 * 60 * 60), // 30 days
    monthlyAmount
  );
  
  console.log(`Subscription active! Stream ID: ${streamId}`);
  
  // Service provider can withdraw daily
  const dailyWithdrawal = monthlyAmount / BigInt(30);
  
  // Auto-withdraw every 24 hours
  setInterval(async () => {
    const available = await sdk.balanceOf(streamId);
    if (available >= dailyWithdrawal) {
      await sdk.withdrawFromStream(streamId, dailyWithdrawal);
      console.log('Daily withdrawal processed');
    }
  }, 24 * 60 * 60 * 1000);
}
```

## Example 3: Multi-Employee Payroll

Pay multiple employees with parallel streams:

```typescript
async function processPayroll() {
  const sdk = new ParallelPaySDK(contractAddress, signer);
  
  // Employee data
  const employees = [
    { address: '0x...', salary: ethers.parseEther('3.0') }, // 3 ETH/month
    { address: '0x...', salary: ethers.parseEther('2.5') }, // 2.5 ETH/month
    { address: '0x...', salary: ethers.parseEther('2.0') }, // 2 ETH/month
    // ... more employees
  ];
  
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const stopTime = now + (30 * 24 * 60 * 60); // 30 days
  
  // Batch create all payroll streams
  const recipients = employees.map(e => e.address);
  const amounts = employees.map(e => e.salary);
  const startTimes = Array(employees.length).fill(startTime);
  const stopTimes = Array(employees.length).fill(stopTime);
  
  const { streamIds, tx } = await sdk.batchCreateStreams(
    recipients,
    startTimes,
    stopTimes,
    amounts
  );
  
  console.log(`Created ${streamIds.length} payroll streams`);
  console.log(`Total payroll: ${ethers.formatEther(
    amounts.reduce((sum, amt) => sum + amt, 0n)
  )} ETH`);
}
```

## Example 4: X402 API Monetization

Agent-to-agent payment for API calls:

```typescript
import { X402PaymentSDK } from './sdk/index.js';

// Service Provider (Agent A)
async function provideService() {
  const x402SDK = new X402PaymentSDK(x402Address, providerSigner);
  
  // Set refund policy: 1 hour window, 10% penalty
  await x402SDK.setRefundPolicy(
    3600,  // 1 hour refund window
    10,    // 10% penalty
    true   // auto-refund enabled
  );
  
  // Create payment request for API call
  const { requestId } = await x402SDK.createPaymentRequest(
    consumerAddress,
    ethers.parseEther('0.001'), // 0.001 ETH per call
    Math.floor(Date.now() / 1000) + 3600, // 1 hour deadline
    ethers.id('api-data-v1'),
    JSON.stringify({
      endpoint: '/api/v1/data',
      method: 'GET',
      estimatedResponseSize: '1MB'
    })
  );
  
  // Return 402 Payment Required
  return {
    status: 402,
    requestId,
    amount: '0.001 ETH',
    contract: x402Address
  };
}

// Consumer (Agent B)
async function consumeService(requestId: bigint) {
  const x402SDK = new X402PaymentSDK(x402Address, consumerSigner);
  
  // Get request details
  const request = await x402SDK.getPaymentRequest(requestId);
  
  // Pay for service
  await x402SDK.payRequest(requestId, request.amount);
  
  // Consume service
  const data = await fetchServiceData();
  
  // If unsatisfied, request refund within policy window
  if (!data.isValid) {
    const canRefund = await x402SDK.canRefund(requestId);
    if (canRefund) {
      await x402SDK.requestRefund(requestId);
      console.log('Refund requested');
    }
  }
}
```

## Example 5: Batch Payment Requests

Create multiple payment requests for parallel processing:

```typescript
async function batchServiceRequests() {
  const x402SDK = new X402PaymentSDK(x402Address, signer);
  
  // Multiple API consumers
  const consumers = [
    { address: '0x...', service: 'data-fetch' },
    { address: '0x...', service: 'image-process' },
    { address: '0x...', service: 'text-analysis' },
    // ... more consumers
  ];
  
  const now = Math.floor(Date.now() / 1000);
  
  const payers = consumers.map(c => c.address);
  const amounts = consumers.map(() => ethers.parseEther('0.001'));
  const deadlines = Array(consumers.length).fill(now + 3600);
  const contentHashes = consumers.map(c => ethers.id(c.service));
  const metadata = consumers.map(c => 
    JSON.stringify({ service: c.service, type: 'api-call' })
  );
  
  const { requestIds } = await x402SDK.batchCreatePaymentRequests(
    payers,
    amounts,
    deadlines,
    contentHashes,
    metadata
  );
  
  console.log(`Created ${requestIds.length} payment requests in parallel`);
  return requestIds;
}
```

## Example 6: Real-time Stream Monitoring

Monitor and visualize active streams:

```typescript
async function monitorStreams() {
  const sdk = new ParallelPaySDK(contractAddress, provider);
  
  // Get all active streams
  const nextStreamId = await sdk.getNextStreamId();
  
  for (let i = 0; i < Number(nextStreamId); i++) {
    const streamId = BigInt(i);
    const stream = await sdk.getStream(streamId);
    
    if (stream.isActive) {
      const balance = await sdk.balanceOf(streamId);
      const progress = calculateProgress(stream);
      
      console.log(`Stream #${i}:`);
      console.log(`  Progress: ${progress.toFixed(2)}%`);
      console.log(`  Available: ${ethers.formatEther(balance)} ETH`);
      console.log(`  Rate: ${ethers.formatEther(stream.ratePerSecond)} ETH/s`);
    }
  }
}

function calculateProgress(stream: any): number {
  const now = Date.now() / 1000;
  const start = Number(stream.startTime);
  const stop = Number(stream.stopTime);
  
  if (now <= start) return 0;
  if (now >= stop) return 100;
  
  return ((now - start) / (stop - start)) * 100;
}
```

## Example 7: Stream Cancellation

Cancel a stream and settle balances:

```typescript
async function cancelExpiredStream(streamId: bigint) {
  const sdk = new ParallelPaySDK(contractAddress, signer);
  
  // Get stream details
  const stream = await sdk.getStream(streamId);
  
  if (!stream.isActive) {
    console.log('Stream already inactive');
    return;
  }
  
  // Check if stream should be cancelled
  const now = Date.now() / 1000;
  const shouldCancel = 
    now > Number(stream.stopTime) ||  // Stream completed
    userRequestedCancel;               // Manual cancellation
  
  if (shouldCancel) {
    // Cancel stream
    const tx = await sdk.cancelStream(streamId);
    await tx.wait();
    
    console.log(`Stream #${streamId} cancelled`);
    console.log('Remaining funds distributed to sender and recipient');
  }
}
```

## Example 8: Dashboard Integration

Integrate with the dashboard API:

```typescript
async function updateDashboard() {
  // Fetch stream data
  const response = await fetch('http://localhost:3000/api/streams/20');
  const data = await response.json();
  
  // Calculate statistics
  const stats = {
    total: data.totalStreams,
    active: data.streams.filter((s: any) => s.isActive).length,
    tvl: data.streams.reduce(
      (sum: number, s: any) => sum + parseFloat(s.remainingBalance),
      0
    ),
    avgRate: data.streams.reduce(
      (sum: number, s: any) => sum + parseFloat(s.ratePerSecond),
      0
    ) / data.streams.length
  };
  
  console.log('Dashboard Stats:', stats);
  
  // Real-time updates every 10 seconds
  setInterval(updateDashboard, 10000);
}
```

## Example 9: Integration with Web3 DApp

Full DApp integration:

```typescript
import { BrowserProvider } from 'ethers';

async function connectWallet() {
  // Connect to MetaMask
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  
  return signer;
}

async function createStreamFromUI() {
  const signer = await connectWallet();
  const sdk = new ParallelPaySDK(contractAddress, signer);
  
  // Get form data
  const recipient = document.getElementById('recipient').value;
  const amount = document.getElementById('amount').value;
  const duration = document.getElementById('duration').value;
  
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const stopTime = now + parseInt(duration);
  
  // Create stream
  const { streamId, tx } = await sdk.createStream(
    recipient,
    startTime,
    stopTime,
    ethers.parseEther(amount)
  );
  
  // Show confirmation
  alert(`Stream created! ID: ${streamId}\nTx: ${tx.hash}`);
}
```

## Example 10: Stress Testing

Test parallel execution at scale:

```typescript
async function stressTest() {
  const sdk = new ParallelPaySDK(contractAddress, signer);
  
  // Generate 100 random recipients
  const count = 100;
  const recipients = Array(count)
    .fill(0)
    .map(() => ethers.Wallet.createRandom().address);
  
  const now = Math.floor(Date.now() / 1000);
  const startTimes = Array(count).fill(now);
  const stopTimes = Array(count).fill(now + 3600);
  const amounts = Array(count).fill(ethers.parseEther('0.01'));
  
  // Measure performance
  const startTime = Date.now();
  
  const { streamIds, tx } = await sdk.batchCreateStreams(
    recipients,
    startTimes,
    stopTimes,
    amounts
  );
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`Created ${streamIds.length} streams in ${duration}ms`);
  console.log(`Average: ${(duration / count).toFixed(2)}ms per stream`);
  console.log(`Gas used: ${tx.gasUsed}`);
  console.log(`Parallel execution advantage: ${
    (count * 500 / duration).toFixed(2)
  }x`);
}
```

## Best Practices

1. **Always check stream status** before operations
2. **Use batch operations** for multiple streams
3. **Monitor gas prices** for optimal transaction timing
4. **Implement error handling** for failed transactions
5. **Store stream IDs** for future reference
6. **Set appropriate deadlines** for X402 requests
7. **Configure refund policies** before creating requests
8. **Use events** for real-time monitoring
9. **Test on testnet** before mainnet deployment
10. **Validate addresses** before creating streams

## Troubleshooting

### Common Issues

**Issue**: Transaction fails with "Insufficient balance"
- **Solution**: Ensure sender has enough ETH for stream + gas

**Issue**: "StreamNotActive" error on withdrawal
- **Solution**: Check if stream has been cancelled or completed

**Issue**: "Unauthorized" error
- **Solution**: Verify you're using the correct signer (sender/recipient)

**Issue**: Can't withdraw funds
- **Solution**: Check that current time is after stream start time

**Issue**: Refund not available
- **Solution**: Verify refund window hasn't expired and payment was made
