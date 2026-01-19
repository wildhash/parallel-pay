/**
 * Cronos ParallelPay - Seller API (x402 Server)
 *
 * An x402-compliant Express server that:
 * 1. Returns HTTP 402 with payment requirements when unauthorized
 * 2. Accepts X-PAYMENT header with EIP-3009 authorization
 * 3. Calls Cronos x402 Facilitator to verify and settle payments
 * 4. Serves premium content after successful payment
 *
 * Reference: https://docs.cronos.org/cronos-x402-facilitator/quick-start-for-sellers
 */

import express, { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import {
  X402_FACILITATOR,
  CRONOS_TESTNET,
  TOKENS,
  PRICING,
  HTTP_HEADERS,
  getExplorerTxUrl,
  formatUSDC
} from '../../constants/cronos.js';

dotenv.config();

const app = express();
app.use(express.json());

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.SELLER_API_PORT || 3001;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS || '0x0000000000000000000000000000000000000000';
const CHAIN_ID = CRONOS_TESTNET.chainId;
const USDC_ADDRESS = TOKENS.testnet.USDC_E;

// In-memory storage for payments (replace with DB in production)
const payments: Map<string, PaymentRecord> = new Map();

interface PaymentRecord {
  txHash: string;
  payer: string;
  amount: string;
  resource: string;
  timestamp: number;
  settled: boolean;
}

// =============================================================================
// x402 FACILITATOR INTEGRATION
// =============================================================================

interface VerifyResponse {
  valid: boolean;
  payer?: string;
  amount?: string;
  error?: string;
}

interface SettleResponse {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Verify a payment authorization with the x402 Facilitator
 */
async function verifyPayment(paymentHeader: string): Promise<VerifyResponse> {
  try {
    const response = await fetch(X402_FACILITATOR.verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: paymentHeader,
        chainId: CHAIN_ID,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { valid: false, error };
    }

    return await response.json();
  } catch (error) {
    console.error('Verify payment error:', error);
    return { valid: false, error: String(error) };
  }
}

/**
 * Settle a payment with the x402 Facilitator
 */
async function settlePayment(paymentHeader: string): Promise<SettleResponse> {
  try {
    const response = await fetch(X402_FACILITATOR.settleUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: paymentHeader,
        chainId: CHAIN_ID,
        recipient: SELLER_ADDRESS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return await response.json();
  } catch (error) {
    console.error('Settle payment error:', error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// x402 MIDDLEWARE
// =============================================================================

interface PaymentRequirements {
  amount: string;
  description: string;
}

/**
 * Middleware that handles x402 payment flow
 */
function requirePayment(requirements: PaymentRequirements) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers[HTTP_HEADERS.PAYMENT.toLowerCase()] as string;

    // No payment header - return 402
    if (!paymentHeader) {
      return res.status(402).json({
        paymentRequired: true,
        amount: requirements.amount,
        currency: 'USDC.e',
        recipient: SELLER_ADDRESS,
        chainId: CHAIN_ID,
        token: USDC_ADDRESS,
        facilitatorUrl: X402_FACILITATOR.baseUrl,
        description: requirements.description,
        network: CRONOS_TESTNET.name,
      });
    }

    // Verify the payment
    console.log(`[x402] Verifying payment...`);
    const verifyResult = await verifyPayment(paymentHeader);

    if (!verifyResult.valid) {
      return res.status(402).json({
        paymentRequired: true,
        error: 'Payment verification failed',
        details: verifyResult.error,
        amount: requirements.amount,
        currency: 'USDC.e',
        recipient: SELLER_ADDRESS,
        chainId: CHAIN_ID,
      });
    }

    // Settle the payment
    console.log(`[x402] Settling payment from ${verifyResult.payer}...`);
    const settleResult = await settlePayment(paymentHeader);

    if (!settleResult.success) {
      return res.status(402).json({
        paymentRequired: true,
        error: 'Payment settlement failed',
        details: settleResult.error,
        amount: requirements.amount,
        currency: 'USDC.e',
        recipient: SELLER_ADDRESS,
        chainId: CHAIN_ID,
      });
    }

    // Payment successful - store record
    const paymentRecord: PaymentRecord = {
      txHash: settleResult.txHash!,
      payer: verifyResult.payer!,
      amount: requirements.amount,
      resource: req.path,
      timestamp: Date.now(),
      settled: true,
    };
    payments.set(settleResult.txHash!, paymentRecord);

    // Add payment info to request for downstream handlers
    (req as any).payment = paymentRecord;

    // Set response headers
    res.setHeader(HTTP_HEADERS.PAYMENT_TX_HASH, settleResult.txHash!);

    console.log(`[x402] Payment settled! TxHash: ${settleResult.txHash}`);
    console.log(`[x402] Explorer: ${getExplorerTxUrl(settleResult.txHash!, CHAIN_ID)}`);

    next();
  };
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Cronos ParallelPay Seller API',
    network: CRONOS_TESTNET.name,
    chainId: CHAIN_ID,
    facilitator: X402_FACILITATOR.baseUrl,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Pricing information endpoint
 */
app.get('/api/pricing', (req: Request, res: Response) => {
  res.json({
    endpoints: [
      {
        path: '/api/premium-data',
        price: formatUSDC(PRICING.premiumData.amount),
        description: PRICING.premiumData.description,
      },
      {
        path: '/api/ai-inference',
        price: formatUSDC(PRICING.aiInference.amount),
        description: PRICING.aiInference.description,
      },
    ],
    currency: 'USDC.e',
    network: CRONOS_TESTNET.name,
    chainId: CHAIN_ID,
    paymentMethod: 'x402 (EIP-3009 transferWithAuthorization)',
  });
});

/**
 * Premium data endpoint - requires x402 payment
 */
app.get(
  '/api/premium-data',
  requirePayment(PRICING.premiumData),
  (req: Request, res: Response) => {
    const payment = (req as any).payment as PaymentRecord;

    res.json({
      success: true,
      data: {
        type: 'premium_market_data',
        timestamp: new Date().toISOString(),
        prices: {
          BTC: 98500.00,
          ETH: 3850.00,
          CRO: 0.145,
        },
        signals: [
          { asset: 'BTC', action: 'HOLD', confidence: 0.85 },
          { asset: 'ETH', action: 'BUY', confidence: 0.72 },
        ],
      },
      payment: {
        txHash: payment.txHash,
        amount: formatUSDC(payment.amount),
        explorer: getExplorerTxUrl(payment.txHash, CHAIN_ID),
      },
    });
  }
);

/**
 * AI inference endpoint - requires x402 payment
 */
app.get(
  '/api/ai-inference',
  requirePayment(PRICING.aiInference),
  (req: Request, res: Response) => {
    const payment = (req as any).payment as PaymentRecord;
    const prompt = req.query.prompt || 'Analyze market trends';

    // Simulated AI response
    res.json({
      success: true,
      inference: {
        prompt: prompt,
        response: `Based on current market analysis: The crypto market shows bullish momentum with BTC testing resistance at $100K. Key support levels to watch: $95K for BTC, $3,500 for ETH. Recommended strategy: DCA into major assets with 5-10% portfolio allocation to emerging L1s like Cronos.`,
        model: 'parallel-pay-ai-v1',
        tokensUsed: 150,
        timestamp: new Date().toISOString(),
      },
      payment: {
        txHash: payment.txHash,
        amount: formatUSDC(payment.amount),
        explorer: getExplorerTxUrl(payment.txHash, CHAIN_ID),
      },
    });
  }
);

/**
 * List recent payments
 */
app.get('/api/payments', (req: Request, res: Response) => {
  const count = Math.min(parseInt(req.query.count as string) || 10, 100);
  const recentPayments = Array.from(payments.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count)
    .map(p => ({
      ...p,
      amountFormatted: formatUSDC(p.amount),
      explorer: getExplorerTxUrl(p.txHash, CHAIN_ID),
    }));

  res.json({
    payments: recentPayments,
    total: payments.size,
  });
});

/**
 * Get specific payment by txHash
 */
app.get('/api/payments/:txHash', (req: Request, res: Response) => {
  const payment = payments.get(req.params.txHash);

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json({
    ...payment,
    amountFormatted: formatUSDC(payment.amount),
    explorer: getExplorerTxUrl(payment.txHash, CHAIN_ID),
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Cronos ParallelPay - Seller API (x402 Server)');
  console.log('='.repeat(60));
  console.log('');
  console.log(`  Server:     http://localhost:${PORT}`);
  console.log(`  Network:    ${CRONOS_TESTNET.name} (Chain ID: ${CHAIN_ID})`);
  console.log(`  Seller:     ${SELLER_ADDRESS}`);
  console.log(`  Facilitator: ${X402_FACILITATOR.baseUrl}`);
  console.log('');
  console.log('  Endpoints:');
  console.log(`    GET /api/health        - Health check`);
  console.log(`    GET /api/pricing       - View pricing`);
  console.log(`    GET /api/premium-data  - Premium data (${formatUSDC(PRICING.premiumData.amount)})`);
  console.log(`    GET /api/ai-inference  - AI inference (${formatUSDC(PRICING.aiInference.amount)})`);
  console.log(`    GET /api/payments      - List payments`);
  console.log('');
  console.log('  x402 Flow:');
  console.log('    1. Client requests resource without payment');
  console.log('    2. Server returns HTTP 402 with payment requirements');
  console.log('    3. Client signs EIP-3009 authorization');
  console.log('    4. Client retries with X-PAYMENT header');
  console.log('    5. Server verifies & settles via Cronos Facilitator');
  console.log('    6. Server returns resource with txHash proof');
  console.log('');
  console.log('='.repeat(60));
});

export default app;
