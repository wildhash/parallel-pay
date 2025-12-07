import { ethers } from 'ethers';
import { 
  deployParallelPay, 
  deployX402Payment,
  deploySLAStreamFactory,
  deployAgentOracle,
  deployRefundManager
} from '../sdk/index.js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function main() {
  console.log('🚀 Deploying ParallelPay to Monad Testnet\n');

  // Set up provider
  const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet.monad.xyz';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Set up signer
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env file');
    process.exit(1);
  }

  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Network: ${rpcUrl}`);

  try {
    const balance = await provider.getBalance(deployer.address);
    console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH\n`);

    if (balance === 0n) {
      console.error('❌ Insufficient balance. Please fund your account.');
      process.exit(1);
    }
  } catch (error: any) {
    console.warn(`⚠️  Could not fetch balance: ${error.message}\n`);
  }

  // Deploy ParallelPay
  console.log('📝 Deploying ParallelPay contract...');
  const { address: parallelPayAddress } = await deployParallelPay(deployer);
  console.log(`✓ ParallelPay deployed at: ${parallelPayAddress}\n`);

  // Deploy X402Payment
  console.log('📝 Deploying X402Payment contract...');
  const { address: x402Address } = await deployX402Payment(deployer);
  console.log(`✓ X402Payment deployed at: ${x402Address}\n`);

  // Deploy SLAStreamFactory
  console.log('📝 Deploying SLAStreamFactory contract...');
  const { address: slaStreamFactoryAddress } = await deploySLAStreamFactory(deployer);
  console.log(`✓ SLAStreamFactory deployed at: ${slaStreamFactoryAddress}\n`);

  // Deploy AgentOracle
  console.log('📝 Deploying AgentOracle contract...');
  const { address: agentOracleAddress } = await deployAgentOracle(deployer, slaStreamFactoryAddress);
  console.log(`✓ AgentOracle deployed at: ${agentOracleAddress}\n`);

  // Deploy RefundManager
  console.log('📝 Deploying RefundManager contract...');
  const { address: refundManagerAddress } = await deployRefundManager(deployer, slaStreamFactoryAddress);
  console.log(`✓ RefundManager deployed at: ${refundManagerAddress}\n`);

  // Save deployment addresses
  const deploymentInfo = {
    network: 'Monad Testnet',
    rpcUrl,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      ParallelPay: parallelPayAddress,
      X402Payment: x402Address,
      SLAStreamFactory: slaStreamFactoryAddress,
      AgentOracle: agentOracleAddress,
      RefundManager: refundManagerAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, 'monad-testnet.json');
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log('='.repeat(60));
  console.log('✅ Deployment Complete!');
  console.log('='.repeat(60));
  console.log('\n📋 Deployment Summary:');
  console.log(`  ParallelPay:      ${parallelPayAddress}`);
  console.log(`  X402Payment:      ${x402Address}`);
  console.log(`  SLAStreamFactory: ${slaStreamFactoryAddress}`);
  console.log(`  AgentOracle:      ${agentOracleAddress}`);
  console.log(`  RefundManager:    ${refundManagerAddress}`);
  console.log(`\n💾 Saved to: ${deploymentFile}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment error:', error);
    process.exit(1);
  });
