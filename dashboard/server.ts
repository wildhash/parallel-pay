import express from 'express';
import { ethers } from 'ethers';
import { ParallelPaySDK, X402PaymentSDK } from '../sdk/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Load deployment info
let deploymentInfo: any = null;
const deploymentFile = path.join(__dirname, '..', 'deployments', 'monad-testnet.json');

if (fs.existsSync(deploymentFile)) {
  deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
}

// Set up provider
const rpcUrl = process.env.MONAD_RPC_URL || process.env.RPC_URL || 'http://127.0.0.1:8545';
const provider = new ethers.JsonRpcProvider(rpcUrl);

// Warn if using default localhost
if (rpcUrl === 'http://127.0.0.1:8545') {
  console.warn('⚠️  Using default localhost RPC. Set MONAD_RPC_URL in .env for testnet/mainnet');
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

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dashboard', 'public')));

// API Routes
app.get('/api/info', (req, res) => {
  res.json({
    deployment: deploymentInfo,
    connected: !!parallelPaySDK,
  });
});

app.get('/api/streams/:count?', async (req, res) => {
  try {
    if (!parallelPaySDK) {
      return res.status(503).json({ error: 'SDK not initialized' });
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
        recipient: stream.recipient,
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
      totalStreams: Number(nextStreamId),
      streams,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
      recipient: stream.recipient,
      deposit: ethers.formatEther(stream.deposit),
      startTime: Number(stream.startTime),
      stopTime: Number(stream.stopTime),
      ratePerSecond: ethers.formatEther(stream.ratePerSecond),
      remainingBalance: ethers.formatEther(stream.remainingBalance),
      availableBalance: ethers.formatEther(balance),
      isActive: stream.isActive,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payment-requests/:count?', async (req, res) => {
  try {
    if (!x402SDK) {
      return res.status(503).json({ error: 'SDK not initialized' });
    }

    const count = parseInt(req.params.count || '10');
    const requests = [];

    // Query recent payment requests
    for (let i = 0; i < count; i++) {
      try {
        const requestId = BigInt(i);
        const request = await x402SDK.getPaymentRequest(requestId);

        requests.push({
          id: i,
          requester: request.requester,
          payer: request.payer,
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

    res.json({ requests });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🌐 ParallelPay Dashboard running at http://localhost:${PORT}`);
  console.log(`\n📊 API Endpoints:`);
  console.log(`  GET /api/info                    - Deployment info`);
  console.log(`  GET /api/streams/:count          - List streams`);
  console.log(`  GET /api/stream/:id              - Get stream details`);
  console.log(`  GET /api/payment-requests/:count - List payment requests\n`);
});
