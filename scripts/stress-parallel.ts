#!/usr/bin/env tsx
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SLAMonitor } from '../agent-sdk/monitor.js';
import { RefundExecutor } from '../agent-sdk/refund.js';
import { ParallelRunner } from '../agent-sdk/parallel_runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Stress test for parallel stream execution
 * Tests 50-200 concurrent streams with SLA monitoring and refunds
 */
async function main() {
  console.log('🚀 ParallelStream Stress Test - Parallel Execution\n');

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

  console.log(`Deployer address: ${signerAddress}`);
  console.log(`Network: ${rpcUrl}\n`);

  // Check balance
  try {
    const balance = await provider.getBalance(signerAddress);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

    if (balance === 0n) {
      console.error('❌ Insufficient balance. Please fund your account.');
      process.exit(1);
    }
  } catch (error: any) {
    console.warn(`⚠️  Could not fetch balance: ${error.message}\n`);
  }

  // Load deployment info
  const deploymentFile = path.join(__dirname, '..', 'deployments', 'monad-testnet.json');
  
  let deploymentInfo: any;
  if (fs.existsSync(deploymentFile)) {
    const data = fs.readFileSync(deploymentFile, 'utf-8');
    deploymentInfo = JSON.parse(data);
    console.log('📋 Loaded deployment info from:', deploymentFile);
  } else {
    console.error('❌ Deployment file not found. Please run `npm run deploy` first.');
    process.exit(1);
  }

  const {
    SLAStreamFactory: streamFactoryAddress,
    AgentOracle: oracleAddress,
    RefundManager: refundManagerAddress,
  } = deploymentInfo.contracts;

  console.log('\n📝 Contract Addresses:');
  console.log(`  SLAStreamFactory: ${streamFactoryAddress}`);
  console.log(`  AgentOracle:      ${oracleAddress}`);
  console.log(`  RefundManager:    ${refundManagerAddress}\n`);

  // Initialize SDK components
  const monitor = new SLAMonitor(oracleAddress, streamFactoryAddress, signer);
  const refundExecutor = new RefundExecutor(
    refundManagerAddress,
    oracleAddress,
    streamFactoryAddress,
    signer
  );
  const runner = new ParallelRunner(streamFactoryAddress, signer, provider);

  // Parse command line arguments for stream count
  const args = process.argv.slice(2);
  let streamCount = 50; // Default

  if (args.length > 0) {
    const parsed = parseInt(args[0]);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 200) {
      streamCount = parsed;
    } else {
      console.warn(`⚠️  Invalid stream count. Using default: ${streamCount}`);
    }
  }

  console.log(`🎯 Target: ${streamCount} parallel streams\n`);

  // Run comprehensive stress test
  await runner.runStressTest(
    streamCount,
    monitor,
    refundExecutor,
    oracleAddress,
    signerAddress
  );

  console.log('\n✅ Stress test completed!');
  
  // Cleanup resources before exit
  monitor.cleanup();
  refundExecutor.cleanup();
  
  console.log('\n💡 Tip: Try different stream counts:');
  console.log('   npm run stress-parallel 100');
  console.log('   npm run stress-parallel 200');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Stress test failed:', error);
    process.exit(1);
  });
