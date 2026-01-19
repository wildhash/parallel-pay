import express from 'express';
import { ethers } from 'ethers';
import { ParallelPaySDK, X402PaymentSDK } from '../sdk/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  CRONOS_TESTNET,
  CRONOS_MAINNET,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  formatUSDC
} from '../constants/cronos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Track if cleanup has been performed
let isShuttingDown = false;

// Determine which deployment file to use
const deploymentsDir = path.join(__dirname, '..', 'deployments');
const cronTestnetFile = path.join(deploymentsDir, 'cronos-testnet.json');
const cronMainnetFile = path.join(deploymentsDir, 'cronos-mainnet.json');
const monadTestnetFile = path.join(deploymentsDir, 'monad-testnet.json');

let deploymentInfo: any = null;
let deploymentFile: string = '';

// Try loading deployment files in order of preference
if (fs.existsSync(cronTestnetFile)) {
  deploymentInfo = JSON.parse(fs.readFileSync(cronTestnetFile, 'utf8'));
  deploymentFile = cronTestnetFile;
} else if (fs.existsSync(cronMainnetFile)) {
  deploymentInfo = JSON.parse(fs.readFileSync(cronMainnetFile, 'utf8'));
  deploymentFile = cronMainnetFile;
} else if (fs.existsSync(monadTestnetFile)) {
  deploymentInfo = JSON.parse(fs.readFileSync(monadTestnetFile, 'utf8'));
  deploymentFile = monadTestnetFile;
}

// Determine network configuration
let networkConfig = CRONOS_TESTNET;
let chainId = 338;

if (deploymentInfo) {
  chainId = deploymentInfo.chainId || 338;
  if (chainId === 25) {
    networkConfig = CRONOS_MAINNET;
  }
}

// Set up provider
const rpcUrl = deploymentInfo?.rpcUrl ||
  process.env.CRONOS_TESTNET_RPC_URL ||
  process.env.CRONOS_RPC_URL ||
  process.env.MONAD_RPC_URL ||
  'http://127.0.0.1:8545';

const provider = new ethers.JsonRpcProvider(rpcUrl);

// Warn if using default localhost
if (rpcUrl === 'http://127.0.0.1:8545') {
  console.warn('Warning: Using default localhost RPC. Set CRONOS_TESTNET_RPC_URL in .env');
}

let parallelPaySDK: ParallelPaySDK | null = null;
let x402SDK: X402PaymentSDK | null = null;

if (deploymentInfo) {
  parallelPaySDK = new ParallelPaySDK(
    deploymentInfo.contracts.ParallelPay,
    provider
  );
  x402SDK = new X402PaymentSDK(deploymentInfo.contracts.X402Payment, provider);
}

// In-memory storage for x402 payments (in production, use a database)
const x402Payments: any[] = [];
const refundEvents: any[] = [];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * Deployment and connection info
 */
app.get('/api/info', (req, res) => {
  res.json({
    service: 'Cronos ParallelPay Dashboard',
    network: deploymentInfo?.network || 'Unknown',
    chainId: chainId,
    explorerUrl: networkConfig.explorerUrl,
    deployment: deploymentInfo,
    connected: !!parallelPaySDK,
    deploymentFile: deploymentFile || 'None',
  });
});

/**
 * List streams
 */
app.get('/api/streams/:count?', async (req, res) => {
  try {
    if (!parallelPaySDK) {
      return res.status(503).json({ error: 'SDK not initialized - deploy contracts first' });
    }

    const count = parseInt(req.params.count || '10');
    const nextStreamId = await parallelPaySDK.getNextStreamId();
    const streamCount = Math.min(count, Number(nextStreamId));

    const streams = [];
    for (let i = 0; i < streamCount; i++) {
      const streamId = BigInt(i);
      const stream = await parallelPaySDK.getStream(streamId);
      const balance = await parallelPaySDK.balanceOf(streamId);

      streams.push({
        id: i,
        sender: stream.sender,
        senderUrl: getExplorerAddressUrl(stream.sender, chainId),
        recipient: stream.recipient,
        recipientUrl: getExplorerAddressUrl(stream.recipient, chainId),
        deposit: ethers.formatEther(stream.deposit),
        startTime: Number(stream.startTime),
        stopTime: Number(stream.stopTime),
        ratePerSecond: ethers.formatEther(stream.ratePerSecond),
        remainingBalance: ethers.formatEther(stream.remainingBalance),
        availableBalance: ethers.formatEther(balance),
        isActive: stream.isActive,
      });
    }

    res.json({
      network: deploymentInfo?.network,
      chainId: chainId,
      totalStreams: Number(nextStreamId),
      streams,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get stream details
 */
app.get('/api/stream/:id', async (req, res) => {
  try {
    if (!parallelPaySDK) {
      return res.status(503).json({ error: 'SDK not initialized' });
    }

    const streamId = BigInt(req.params.id);
    const stream = await parallelPaySDK.getStream(streamId);
    const balance = await parallelPaySDK.balanceOf(streamId);

    res.json({
      id: req.params.id,
      sender: stream.sender,
      senderUrl: getExplorerAddressUrl(stream.sender, chainId),
      recipient: stream.recipient,
      recipientUrl: getExplorerAddressUrl(stream.recipient, chainId),
      deposit: ethers.formatEther(stream.deposit),
      startTime: Number(stream.startTime),
      stopTime: Number(stream.stopTime),
      ratePerSecond: ethers.formatEther(stream.ratePerSecond),
      remainingBalance: ethers.formatEther(stream.remainingBalance),
      availableBalance: ethers.formatEther(balance),
      isActive: stream.isActive,
      network: deploymentInfo?.network,
      chainId: chainId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * List payment requests
 */
app.get('/api/payment-requests/:count?', async (req, res) => {
  try {
    if (!x402SDK) {
      return res.status(503).json({ error: 'SDK not initialized' });
    }

    const count = parseInt(req.params.count || '10');
    const requests = [];

    for (let i = 0; i < count; i++) {
      try {
        const requestId = BigInt(i);
        const request = await x402SDK.getPaymentRequest(requestId);

        requests.push({
          id: i,
          requester: request.requester,
          requesterUrl: getExplorerAddressUrl(request.requester, chainId),
          payer: request.payer,
          payerUrl: getExplorerAddressUrl(request.payer, chainId),
          amount: ethers.formatEther(request.amount),
          deadline: Number(request.deadline),
          isPaid: request.isPaid,
          isRefunded: request.isRefunded,
          metadata: request.metadata,
        });
      } catch {
        break;
      }
    }

    res.json({
      network: deploymentInfo?.network,
      chainId: chainId,
      requests
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * List x402 payments (from seller-api)
 */
app.get('/api/payments', (req, res) => {
  const count = Math.min(parseInt(req.query.count as string) || 20, 100);
  const recentPayments = x402Payments
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count)
    .map(p => ({
      ...p,
      explorerUrl: getExplorerTxUrl(p.txHash, chainId),
    }));

  res.json({
    network: deploymentInfo?.network,
    chainId: chainId,
    payments: recentPayments,
    total: x402Payments.length,
  });
});

/**
 * Record an x402 payment (called by seller-api)
 */
app.post('/api/payments', (req, res) => {
  const payment = {
    ...req.body,
    timestamp: Date.now(),
  };
  x402Payments.push(payment);
  res.json({ success: true, payment });
});

/**
 * List refund events
 */
app.get('/api/refunds', (req, res) => {
  const count = Math.min(parseInt(req.query.count as string) || 20, 100);
  const recentRefunds = refundEvents
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count)
    .map(r => ({
      ...r,
      explorerUrl: r.txHash ? getExplorerTxUrl(r.txHash, chainId) : null,
    }));

  res.json({
    network: deploymentInfo?.network,
    chainId: chainId,
    refunds: recentRefunds,
    total: refundEvents.length,
  });
});

/**
 * Record a refund event (called by agent-sdk)
 */
app.post('/api/refunds', (req, res) => {
  const refund = {
    ...req.body,
    timestamp: Date.now(),
  };
  refundEvents.push(refund);
  res.json({ success: true, refund });
});

/**
 * Network stats
 */
app.get('/api/stats', async (req, res) => {
  try {
    const stats: any = {
      network: deploymentInfo?.network || 'Unknown',
      chainId: chainId,
      explorerUrl: networkConfig.explorerUrl,
      x402PaymentsCount: x402Payments.length,
      refundEventsCount: refundEvents.length,
    };

    if (parallelPaySDK) {
      const nextStreamId = await parallelPaySDK.getNextStreamId();
      stats.totalStreams = Number(nextStreamId);
    }

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Cronos ParallelPay Dashboard');
  console.log('='.repeat(60));
  console.log('');
  console.log(`  URL:       http://localhost:${PORT}`);
  console.log(`  Network:   ${deploymentInfo?.network || 'Not deployed'}`);
  console.log(`  Chain ID:  ${chainId}`);
  console.log(`  Explorer:  ${networkConfig.explorerUrl}`);
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET /api/info              - Deployment info');
  console.log('    GET /api/stats             - Network stats');
  console.log('    GET /api/streams/:count    - List streams');
  console.log('    GET /api/stream/:id        - Stream details');
  console.log('    GET /api/payments          - x402 payments');
  console.log('    GET /api/refunds           - Refund events');
  console.log('');
  if (!deploymentInfo) {
    console.log('  Note: No deployment found. Deploy contracts first:');
    console.log('    npm run deploy:cronos-testnet');
    console.log('');
  }
  console.log('='.repeat(60));
});

// Graceful shutdown
const gracefulShutdown = () => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    try {
      provider.destroy();
      console.log('Provider destroyed');
    } catch (error) {
      // Ignore
    }
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
