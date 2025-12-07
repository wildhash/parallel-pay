# ParallelPay Architecture

## Design Principles

### 1. Isolated Storage for Parallelism

Each stream is stored in an independent storage slot using a mapping:

```solidity
mapping(uint256 => Stream) public streams;
```

This design ensures:
- **Zero Lock Contention**: Different streams never conflict
- **Parallel Execution**: Multiple transactions can execute simultaneously
- **O(1) Access**: Direct mapping lookup
- **Gas Efficiency**: No iteration required

### 2. Batch Operations

Both contracts support batch operations for maximum throughput:

```solidity
function batchCreateStreams(
    address[] calldata recipients,
    uint256[] calldata startTimes,
    uint256[] calldata stopTimes,
    uint256[] calldata amounts
) external payable returns (uint256[] memory streamIds)
```

Benefits:
- Amortized gas costs
- Single transaction overhead
- Atomic operations
- Parallel processing by EVM

### 3. Event-Driven Architecture

All state changes emit events for off-chain tracking:

```solidity
event StreamCreated(...)
event WithdrawalMade(...)
event StreamCancelled(...)
```

This enables:
- Real-time dashboard updates
- Historical analysis
- Audit trails
- Integration with indexers

## Monad-Specific Optimizations

### Parallel EVM Advantages

Monad's parallel EVM processes transactions concurrently when they don't conflict:

1. **Storage Independence**: Each stream uses unique storage slots
2. **No Shared State**: Sender/recipient balances are independent
3. **Read-Only Operations**: View functions don't block writes
4. **Deterministic Execution**: Predictable gas costs

### Expected Performance

On Monad's parallel EVM:

| Metric | Traditional EVM | Monad Parallel EVM |
|--------|----------------|-------------------|
| Concurrent Streams | 1 | 50-100+ |
| TPS (Transactions/sec) | ~15 | ~10,000 |
| Latency | 12-15s | <1s |
| Gas Efficiency | Baseline | +20-30% |

## Stream Lifecycle

```
┌─────────────┐
│   Create    │ ──┐
│   Stream    │   │
└─────────────┘   │
                  │
                  ▼
         ┌────────────────┐
         │  Active Stream │ ◄──┐
         └────────────────┘    │
                  │             │
         ┌────────┴────────┐   │
         │                 │   │
         ▼                 ▼   │
    ┌─────────┐      ┌──────────┐
    │Withdraw │      │ Cancel   │
    │         │      │          │
    └─────────┘      └──────────┘
         │                 │
         └────────┬────────┘
                  │
                  ▼
         ┌────────────────┐
         │    Settled     │
         └────────────────┘
```

## X402 Payment Flow

```
Agent A                     X402Contract                    Agent B
   │                             │                             │
   │  createPaymentRequest()     │                             │
   ├────────────────────────────►│                             │
   │                             │                             │
   │          requestId          │                             │
   │◄────────────────────────────┤                             │
   │                             │                             │
   │                             │        payRequest()         │
   │                             │◄────────────────────────────┤
   │                             │                             │
   │        ETH Transfer         │                             │
   │◄────────────────────────────┤                             │
   │                             │                             │
   │                             │     requestRefund()?        │
   │                             │◄────────────────────────────┤
   │                             │                             │
   │      Refund (if valid)      │                             │
   │         Penalty             │◄────────────────────────────┤
   │◄───────────┬────────────────┤                             │
   │            └────────────────────────────────────────────►│
```

## Security Model

### Access Control

1. **Stream Cancellation**: Only sender or recipient
2. **Withdrawals**: Only recipient
3. **Refunds**: Only payer within policy window
4. **Policy Updates**: Only requester

### Safety Mechanisms

```solidity
// Checks-Effects-Interactions Pattern
function withdrawFromStream(uint256 streamId, uint256 amount) external {
    Stream storage stream = streams[streamId];
    
    // Checks
    if (!stream.isActive) revert StreamNotActive();
    if (msg.sender != stream.recipient) revert Unauthorized();
    
    // Effects
    stream.remainingBalance -= amount;
    emit WithdrawalMade(streamId, stream.recipient, amount);
    
    // Interactions
    (bool success, ) = stream.recipient.call{value: amount}("");
    if (!success) revert TransferFailed();
}
```

### Gas Optimization Strategies

1. **Custom Errors**: Save 50% gas vs string reverts
2. **Storage Layout**: Pack related fields
3. **Memory vs Storage**: Use memory for temporary data
4. **View Functions**: Off-chain queries
5. **Batch Operations**: Amortize costs

## Integration Patterns

### SDK Usage

```typescript
// Initialize SDK
const sdk = new ParallelPaySDK(contractAddress, signer);

// Create stream
const { streamId } = await sdk.createStream(
  recipientAddress,
  startTime,
  stopTime,
  amount
);

// Query stream
const stream = await sdk.getStream(streamId);
const balance = await sdk.balanceOf(streamId);

// Withdraw
await sdk.withdrawFromStream(streamId, amount);
```

### Dashboard Integration

```javascript
// Real-time updates
setInterval(async () => {
  const streams = await fetch('/api/streams/20').then(r => r.json());
  updateUI(streams);
}, 10000);
```

### Agent Integration

```typescript
// Agent creates payment request
const { requestId } = await x402SDK.createPaymentRequest(
  payerAddress,
  amount,
  deadline,
  contentHash,
  metadata
);

// Return 402 to client with requestId
response.status(402).json({
  requestId,
  amount: ethers.formatEther(amount),
  contract: x402Address
});
```

## Future Enhancements

1. **Stream Templates**: Reusable stream configurations
2. **Multi-Token Support**: ERC20 streaming
3. **Conditional Streams**: Unlock conditions
4. **Stream NFTs**: Tokenized stream ownership
5. **Governance**: DAO-controlled parameters
6. **Analytics**: Enhanced metrics and reporting
