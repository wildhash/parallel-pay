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
import { CRONOS_TESTNET, CRONOS_MAINNET, getExplorerAddressUrl } from '../constants/cronos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const networkArg = args.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'cronos-testnet';

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  envKey: string;
  deploymentFile: string;
  currency: string;
}

const NETWORKS: Record<string, NetworkConfig> = {
  'cronos-testnet': {
    name: 'Cronos Testnet',
    chainId: CRONOS_TESTNET.chainId,
    rpcUrl: process.env.CRONOS_TESTNET_RPC_URL || CRONOS_TESTNET.rpcUrl,
    explorerUrl: CRONOS_TESTNET.explorerUrl,
    envKey: 'CRONOS_TESTNET_RPC_URL',
    deploymentFile: 'cronos-testnet.json',
    currency: 'TCRO',
  },
  'cronos': {
    name: 'Cronos Mainnet',
    chainId: CRONOS_MAINNET.chainId,
    rpcUrl: process.env.CRONOS_RPC_URL || CRONOS_MAINNET.rpcUrl,
    explorerUrl: CRONOS_MAINNET.explorerUrl,
    envKey: 'CRONOS_RPC_URL',
    deploymentFile: 'cronos-mainnet.json',
    currency: 'CRO',
  },
  'monad-testnet': {
    name: 'Monad Testnet',
    chainId: 41454,
    rpcUrl: process.env.MONAD_RPC_URL || 'https://testnet.monad.xyz',
    explorerUrl: 'https://explorer.monad.xyz',
    envKey: 'MONAD_RPC_URL',
    deploymentFile: 'monad-testnet.json',
    currency: 'ETH',
  },
};

async function main() {
  const network = NETWORKS[networkArg];

  if (!network) {
    console.error(`Unknown network: ${networkArg}`);
    console.log('Available networks: cronos-testnet, cronos, monad-testnet');
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`  Cronos ParallelPay - Contract Deployment`);
  console.log('='.repeat(60));
  console.log('');
  console.log(`Network:  ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`RPC:      ${network.rpcUrl}`);
  console.log(`Explorer: ${network.explorerUrl}`);
  console.log('');

  // Set up provider
  const provider = new ethers.JsonRpcProvider(network.rpcUrl);

  // Set up signer
  if (!process.env.PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not set in .env file');
    process.exit(1);
  }

  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`Deployer: ${deployer.address}`);

  try {
    const balance = await provider.getBalance(deployer.address);
    console.log(`Balance:  ${ethers.formatEther(balance)} ${network.currency}`);
    console.log('');

    if (balance === 0n) {
      console.error(`Error: Insufficient balance. Please fund your account.`);
      if (networkArg === 'cronos-testnet') {
        console.log('Get testnet CRO from: https://cronos.org/faucet');
      }
      process.exit(1);
    }
  } catch (error: any) {
    console.warn(`Warning: Could not fetch balance: ${error.message}`);
    console.log('');
  }

  console.log('Deploying contracts...');
  console.log('');

  // Deploy ParallelPay
  console.log('[1/5] Deploying ParallelPay...');
  const { address: parallelPayAddress } = await deployParallelPay(deployer);
  console.log(`      ${parallelPayAddress}`);
  console.log(`      ${getExplorerAddressUrl(parallelPayAddress, network.chainId)}`);
  console.log('');

  // Deploy X402Payment
  console.log('[2/5] Deploying X402Payment...');
  const { address: x402Address } = await deployX402Payment(deployer);
  console.log(`      ${x402Address}`);
  console.log(`      ${getExplorerAddressUrl(x402Address, network.chainId)}`);
  console.log('');

  // Deploy SLAStreamFactory
  console.log('[3/5] Deploying SLAStreamFactory...');
  const { address: slaStreamFactoryAddress } = await deploySLAStreamFactory(deployer);
  console.log(`      ${slaStreamFactoryAddress}`);
  console.log(`      ${getExplorerAddressUrl(slaStreamFactoryAddress, network.chainId)}`);
  console.log('');

  // Deploy AgentOracle
  console.log('[4/5] Deploying AgentOracle...');
  const { address: agentOracleAddress } = await deployAgentOracle(deployer, slaStreamFactoryAddress);
  console.log(`      ${agentOracleAddress}`);
  console.log(`      ${getExplorerAddressUrl(agentOracleAddress, network.chainId)}`);
  console.log('');

  // Deploy RefundManager
  console.log('[5/5] Deploying RefundManager...');
  const { address: refundManagerAddress } = await deployRefundManager(deployer, slaStreamFactoryAddress);
  console.log(`      ${refundManagerAddress}`);
  console.log(`      ${getExplorerAddressUrl(refundManagerAddress, network.chainId)}`);
  console.log('');

  // Save deployment addresses
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
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

  const deploymentFile = path.join(deploymentsDir, network.deploymentFile);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log('='.repeat(60));
  console.log('  Deployment Complete!');
  console.log('='.repeat(60));
  console.log('');
  console.log('Contracts:');
  console.log(`  ParallelPay:      ${parallelPayAddress}`);
  console.log(`  X402Payment:      ${x402Address}`);
  console.log(`  SLAStreamFactory: ${slaStreamFactoryAddress}`);
  console.log(`  AgentOracle:      ${agentOracleAddress}`);
  console.log(`  RefundManager:    ${refundManagerAddress}`);
  console.log('');
  console.log(`Saved to: ${deploymentFile}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Start the seller API:  npm run seller-api');
  console.log('  2. Run the buyer agent:   npm run buyer-agent');
  console.log('  3. View the dashboard:    npm run dashboard');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment error:', error);
    process.exit(1);
  });
