#!/usr/bin/env tsx
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SLAMonitor } from '../agent-sdk/monitor.js';
import { RefundExecutor } from '../agent-sdk/refund.js';
import { deploySLAStreamFactory, deployAgentOracle, deployRefundManager } from '../sdk/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Simulate SLA degradation and automatic refunds
 * Creates streams with strict SLA, simulates degraded performance, triggers refunds
 */
async function main() {
  console.log('🔬 ParallelStream - SLA Degradation Simulation\n');

  // Set up provider
  const rpcUrl = process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Set up signer
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env file');
    process.exit(1);
  }

  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const signerAddress = await signer.getAddress();

  console.log(`Account: ${signerAddress}`);
  console.log(`Network: ${rpcUrl}\n`);

  // Check if contracts are deployed
  const deploymentFile = path.join(__dirname, '..', 'deployments', 'monad-testnet.json');
  
  let streamFactoryAddress: string;
  let oracleAddress: string;
  let refundManagerAddress: string;

  if (fs.existsSync(deploymentFile)) {
    const data = fs.readFileSync(deploymentFile, 'utf-8');
    const deploymentInfo = JSON.parse(data);
    streamFactoryAddress = deploymentInfo.contracts.SLAStreamFactory;
    oracleAddress = deploymentInfo.contracts.AgentOracle;
    refundManagerAddress = deploymentInfo.contracts.RefundManager;
    console.log('📋 Using deployed contracts from:', deploymentFile);
  } else {
    console.log('📝 Deploying contracts for simulation...\n');
    
    // Deploy contracts
    const { address: factoryAddr } = await deploySLAStreamFactory(signer);
    streamFactoryAddress = factoryAddr;
    console.log(`✓ SLAStreamFactory: ${streamFactoryAddress}`);

    const { address: oracleAddr } = await deployAgentOracle(signer, streamFactoryAddress);
    oracleAddress = oracleAddr;
    console.log(`✓ AgentOracle: ${oracleAddress}`);

    const { address: refundAddr } = await deployRefundManager(signer, streamFactoryAddress);
    refundManagerAddress = refundAddr;
    console.log(`✓ RefundManager: ${refundManagerAddress}\n`);
  }

  // Initialize components
  const monitor = new SLAMonitor(oracleAddress, streamFactoryAddress, signer);
  const refundExecutor = new RefundExecutor(
    refundManagerAddress,
    oracleAddress,
    streamFactoryAddress,
    signer
  );

  // Import artifacts
  const SLAStreamFactoryArtifact = await import('../artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json', { with: { type: 'json' } });
  const streamFactory = new ethers.Contract(
    streamFactoryAddress,
    SLAStreamFactoryArtifact.default.abi,
    signer
  );

  console.log('='.repeat(60));
  console.log('PHASE 1: Create Streams with Strict SLA');
  console.log('='.repeat(60));

  // Create 10 streams with strict SLA
  const streamCount = 10;
  const recipient = signerAddress;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 60; // Start in 1 minute
  const stopTime = startTime + 3600; // 1 hour duration
  const amountPerStream = ethers.parseEther('0.01');

  const recipients = Array(streamCount).fill(recipient);
  const tokens = Array(streamCount).fill(ethers.ZeroAddress);
  const startTimes = Array(streamCount).fill(startTime);
  const stopTimes = Array(streamCount).fill(stopTime);
  const amounts = Array(streamCount).fill(amountPerStream);

  // Strict SLA configuration
  const strictSLA = {
    maxLatencyMs: 200,
    minUptimePercent: 9950, // 99.50%
    maxErrorRate: 50,       // 0.50%
    maxJitterMs: 50,
    refundPercentOnBreach: 1000, // 10% refund per breach
    autoStopOnSevereBreach: true,
  };
  const slaConfigs = Array(streamCount).fill(strictSLA);

  const totalAmount = amountPerStream * BigInt(streamCount);

  console.log(`\n📝 Creating ${streamCount} streams with strict SLA...`);
  console.log(`   Max Latency: ${strictSLA.maxLatencyMs}ms`);
  console.log(`   Min Uptime: ${strictSLA.minUptimePercent / 100}%`);
  console.log(`   Max Error Rate: ${strictSLA.maxErrorRate / 100}%`);
  console.log(`   Refund per breach: ${strictSLA.refundPercentOnBreach / 100}%\n`);

  const createTx = await streamFactory.batchCreateStreams(
    recipients,
    tokens,
    startTimes,
    stopTimes,
    amounts,
    slaConfigs,
    { value: totalAmount }
  );

  const createReceipt = await createTx.wait();
  console.log(`✅ Created ${streamCount} streams`);
  console.log(`   Gas used: ${createReceipt.gasUsed}\n`);

  // Extract stream IDs
  const nextStreamId = await streamFactory.nextStreamId();
  const startStreamId = nextStreamId - BigInt(streamCount);
  const streamIds: bigint[] = [];
  for (let i = 0; i < streamCount; i++) {
    streamIds.push(startStreamId + BigInt(i));
  }

  console.log(`📊 Stream IDs: ${streamIds.slice(0, 3).join(', ')}${streamIds.length > 3 ? '...' : ''}\n`);

  // Add streams to monitor
  streamIds.forEach((id) => monitor.addStream(id));

  console.log('='.repeat(60));
  console.log('PHASE 2: Submit Normal Metrics');
  console.log('='.repeat(60));

  console.log('\n📊 Submitting normal metrics (should pass SLA)...\n');

  // Submit good metrics
  const goodMetrics = await Promise.all(
    streamIds.map((id) => monitor.collectMetrics(id))
  );

  const goodTx = await monitor.batchSubmitMetrics(goodMetrics);
  await goodTx.wait();
  console.log('✅ Normal metrics submitted - No breaches expected\n');

  // Wait a bit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('='.repeat(60));
  console.log('PHASE 3: Simulate SLA Degradation');
  console.log('='.repeat(60));

  console.log('\n⚠️  Simulating degraded performance...\n');

  // Submit degraded metrics multiple times to trigger breaches
  for (let round = 1; round <= 3; round++) {
    console.log(`🔴 Degradation Round ${round}/3`);
    
    const degradedMetrics = await Promise.all(
      streamIds.map((id) => monitor.collectDegradedMetrics(id))
    );

    // Show sample metrics
    const sample = degradedMetrics[0];
    console.log(`   Sample metrics:`, {
      latency: `${sample.latencyMs}ms (limit: ${strictSLA.maxLatencyMs}ms)`,
      uptime: `${(sample.uptimePercent / 100).toFixed(2)}% (limit: ${strictSLA.minUptimePercent / 100}%)`,
      errorRate: `${(sample.errorRate / 100).toFixed(2)}% (limit: ${strictSLA.maxErrorRate / 100}%)`,
      jitter: `${sample.jitterMs}ms (limit: ${strictSLA.maxJitterMs}ms)`,
    });

    const degradedTx = await monitor.batchSubmitMetrics(degradedMetrics);
    const receipt = await degradedTx.wait();
    console.log(`   ✓ Metrics submitted (Gas: ${receipt.gasUsed})\n`);

    // Wait between rounds
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('='.repeat(60));
  console.log('PHASE 4: Check Stream Status & Refunds');
  console.log('='.repeat(60));

  console.log('\n📊 Checking stream status after degradation...\n');

  // Check status of first few streams
  for (let i = 0; i < Math.min(3, streamIds.length); i++) {
    const status = await refundExecutor.getStreamStatus(streamIds[i]);
    console.log(`Stream ${streamIds[i]}:`);
    console.log(`   Active: ${status.isActive}`);
    console.log(`   Deposit: ${status.deposit} ETH`);
    console.log(`   Remaining: ${status.remainingBalance} ETH`);
    console.log(`   Refunded: ${status.totalRefunded} ETH`);
    console.log(`   Breaches: ${status.breachCount}\n`);
  }

  console.log('='.repeat(60));
  console.log('SIMULATION COMPLETE');
  console.log('='.repeat(60));

  console.log('\n✅ SLA degradation simulation completed!');
  console.log('\n📊 Summary:');
  console.log(`   Streams created: ${streamCount}`);
  console.log(`   Degradation rounds: 3`);
  console.log(`   Metrics submitted: ${(streamCount * 4)} (1 normal + 3 degraded per stream)`);
  console.log(`   Expected breaches: Multiple per stream`);
  console.log(`   Expected refunds: Automatic based on breach count\n`);

  console.log('💡 The simulation demonstrates:');
  console.log('   1. Strict SLA enforcement');
  console.log('   2. Automatic breach detection');
  console.log('   3. Refund triggering on violations');
  console.log('   4. Stream monitoring at scale\n');

  // Cleanup resources before exit
  monitor.cleanup();
  refundExecutor.cleanup();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Simulation failed:', error);
    process.exit(1);
  });
