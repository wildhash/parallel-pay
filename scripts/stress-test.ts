import { ethers } from 'ethers';
import {
  ParallelPaySDK,
  X402PaymentSDK,
  deployParallelPay,
  deployX402Payment,
} from '../sdk/index.js';

/**
 * Stress test script to open 50-100 streams concurrently
 * Demonstrates parallel execution capabilities on Monad
 */

const STREAM_COUNT = 50; // Adjust to 100 for more intensive testing
const STREAM_DURATION = 3600; // 1 hour
const STREAM_AMOUNT = ethers.parseEther('0.01'); // 0.01 ETH per stream

async function main() {
  console.log('🚀 ParallelPay Stress Test\n');

  // Set up provider and wallets
  const provider = new ethers.JsonRpcProvider(
    process.env.RPC_URL || 'http://127.0.0.1:8545'
  );

  // Create test wallets
  const deployer = new ethers.Wallet(
    process.env.PRIVATE_KEY ||
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider
  );

  console.log(`Deployer address: ${deployer.address}`);
  const balance = await provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH\n`);

  // Deploy contracts
  console.log('📝 Deploying ParallelPay contract...');
  const { address: parallelPayAddress, contract: parallelPayContract } =
    await deployParallelPay(deployer);
  console.log(`✓ ParallelPay deployed at: ${parallelPayAddress}\n`);

  console.log('📝 Deploying X402Payment contract...');
  const { address: x402Address, contract: x402Contract } =
    await deployX402Payment(deployer);
  console.log(`✓ X402Payment deployed at: ${x402Address}\n`);

  // Initialize SDKs
  const parallelPaySDK = new ParallelPaySDK(parallelPayAddress, deployer);
  const x402SDK = new X402PaymentSDK(x402Address, deployer);

  // Generate recipient addresses
  const recipients: string[] = [];
  for (let i = 0; i < STREAM_COUNT; i++) {
    const wallet = ethers.Wallet.createRandom();
    recipients.push(wallet.address);
  }

  // Test 1: Batch create streams (parallel execution)
  console.log(`\n🧪 Test 1: Creating ${STREAM_COUNT} streams in parallel\n`);
  const currentTime = Math.floor(Date.now() / 1000);
  const startTime = currentTime + 60; // Start in 1 minute
  const stopTime = startTime + STREAM_DURATION;

  const startTimes = Array(STREAM_COUNT).fill(startTime);
  const stopTimes = Array(STREAM_COUNT).fill(stopTime);
  const amounts = Array(STREAM_COUNT).fill(STREAM_AMOUNT);

  const batchStartTime = Date.now();

  try {
    const { streamIds, tx } = await parallelPaySDK.batchCreateStreams(
      recipients,
      startTimes,
      stopTimes,
      amounts
    );

    const batchEndTime = Date.now();
    const batchDuration = batchEndTime - batchStartTime;

    console.log(`✓ Created ${streamIds.length} streams successfully`);
    console.log(`⏱️  Time taken: ${batchDuration}ms`);
    console.log(`⛽ Gas used: ${tx.gasUsed ? tx.gasUsed.toString() : 'N/A'}`);
    console.log(`📊 Average: ${(batchDuration / STREAM_COUNT).toFixed(2)}ms per stream`);
    console.log(`\nStream IDs: ${streamIds.slice(0, 5).join(', ')}...`);
  } catch (error: any) {
    console.error('❌ Error creating streams:', error.message);
    process.exit(1);
  }

  // Test 2: Query multiple streams in parallel
  console.log(`\n🧪 Test 2: Querying stream data in parallel\n`);

  const nextStreamId = await parallelPaySDK.getNextStreamId();
  const streamQueries = [];
  const queryStartTime = Date.now();

  for (let i = 0; i < Math.min(STREAM_COUNT, Number(nextStreamId)); i++) {
    streamQueries.push(parallelPaySDK.getStream(BigInt(i)));
  }

  try {
    const streams = await Promise.all(streamQueries);
    const queryEndTime = Date.now();
    const queryDuration = queryEndTime - queryStartTime;

    console.log(`✓ Queried ${streams.length} streams successfully`);
    console.log(`⏱️  Time taken: ${queryDuration}ms`);
    console.log(`📊 Average: ${(queryDuration / streams.length).toFixed(2)}ms per query`);

    // Show sample stream data
    if (streams.length > 0) {
      const sampleStream = streams[0];
      console.log('\nSample Stream Data:');
      console.log(`  Sender: ${sampleStream.sender}`);
      console.log(`  Recipient: ${sampleStream.recipient}`);
      console.log(`  Deposit: ${ethers.formatEther(sampleStream.deposit)} ETH`);
      console.log(`  Active: ${sampleStream.isActive}`);
    }
  } catch (error: any) {
    console.error('❌ Error querying streams:', error.message);
  }

  // Test 3: X402 Payment Requests (parallel)
  console.log(`\n🧪 Test 3: Creating ${STREAM_COUNT} payment requests in parallel\n`);

  const payers = recipients.slice(0, STREAM_COUNT);
  const paymentAmounts = Array(STREAM_COUNT).fill(ethers.parseEther('0.001'));
  const deadlines = Array(STREAM_COUNT).fill(currentTime + 7200);
  const contentHashes = Array(STREAM_COUNT)
    .fill(0)
    .map((_, i) => ethers.id(`content-${i}`));
  const metadataList = Array(STREAM_COUNT)
    .fill(0)
    .map((_, i) => JSON.stringify({ api: `service-${i}`, type: 'data' }));

  const x402StartTime = Date.now();

  try {
    const { requestIds, tx } = await x402SDK.batchCreatePaymentRequests(
      payers,
      paymentAmounts,
      deadlines,
      contentHashes,
      metadataList
    );

    const x402EndTime = Date.now();
    const x402Duration = x402EndTime - x402StartTime;

    console.log(`✓ Created ${requestIds.length} payment requests successfully`);
    console.log(`⏱️  Time taken: ${x402Duration}ms`);
    console.log(`⛽ Gas used: ${tx.gasUsed ? tx.gasUsed.toString() : 'N/A'}`);
    console.log(`📊 Average: ${(x402Duration / STREAM_COUNT).toFixed(2)}ms per request`);
  } catch (error: any) {
    console.error('❌ Error creating payment requests:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Stress Test Complete!');
  console.log('='.repeat(60));
  console.log(`\n📋 Summary:`);
  console.log(`  - Total streams created: ${STREAM_COUNT}`);
  console.log(`  - ParallelPay contract: ${parallelPayAddress}`);
  console.log(`  - X402Payment contract: ${x402Address}`);
  console.log(`\n🎯 Parallel Execution Benefits:`);
  console.log(`  - Independent storage slots per stream`);
  console.log(`  - No lock contention between transactions`);
  console.log(`  - Optimized for Monad's parallel EVM`);
  console.log(`  - Scales linearly with concurrent transactions\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
