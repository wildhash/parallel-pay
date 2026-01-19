/**
 * Cronos ParallelPay - Buyer Agent
 *
 * An autonomous agent that:
 * 1. Detects HTTP 402 responses
 * 2. Generates EIP-3009 transferWithAuthorization signatures
 * 3. Submits payment via X-PAYMENT header
 * 4. Processes received data
 *
 * Reference: https://docs.cronos.org/cronos-x402-facilitator/quick-start-for-buyers
 */

import { ethers, Wallet, TypedDataDomain, TypedDataField } from 'ethers';
import * as dotenv from 'dotenv';
import {
  CRONOS_TESTNET,
  TOKENS,
  HTTP_HEADERS,
  getExplorerTxUrl,
  formatUSDC
} from '../../constants/cronos.js';

dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const SELLER_API_URL = process.env.SELLER_API_URL || 'http://localhost:3001';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const CHAIN_ID = CRONOS_TESTNET.chainId;
const USDC_ADDRESS = TOKENS.testnet.USDC_E;

// USDC.e token name for EIP-712 domain
const USDC_NAME = 'USD Coin';
const USDC_VERSION = '2';

// =============================================================================
// EIP-3009 TYPES FOR TYPED DATA SIGNING
// =============================================================================

const EIP3009_TYPES: Record<string, TypedDataField[]> = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

interface TransferWithAuthorizationParams {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
}

interface PaymentAuthorization {
  params: TransferWithAuthorizationParams;
  signature: string;
  v: number;
  r: string;
  s: string;
}

// =============================================================================
// EIP-3009 SIGNATURE GENERATION
// =============================================================================

/**
 * Generate a random nonce for EIP-3009
 */
function generateNonce(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Create EIP-712 domain for USDC.e
 */
function createDomain(chainId: number, tokenAddress: string): TypedDataDomain {
  return {
    name: USDC_NAME,
    version: USDC_VERSION,
    chainId: chainId,
    verifyingContract: tokenAddress,
  };
}

/**
 * Sign an EIP-3009 transferWithAuthorization
 */
async function signTransferWithAuthorization(
  wallet: Wallet,
  params: TransferWithAuthorizationParams,
  chainId: number,
  tokenAddress: string
): Promise<PaymentAuthorization> {
  const domain = createDomain(chainId, tokenAddress);

  const signature = await wallet.signTypedData(domain, EIP3009_TYPES, params);
  const { v, r, s } = ethers.Signature.from(signature);

  return {
    params,
    signature,
    v,
    r,
    s,
  };
}

/**
 * Create X-PAYMENT header value from authorization
 */
function createPaymentHeader(auth: PaymentAuthorization): string {
  // Encode as base64 JSON for header
  const payload = {
    type: 'eip3009',
    chainId: CHAIN_ID,
    token: USDC_ADDRESS,
    ...auth.params,
    v: auth.v,
    r: auth.r,
    s: auth.s,
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// =============================================================================
// BUYER AGENT CLASS
// =============================================================================

interface PaymentRequirements {
  amount: string;
  recipient: string;
  chainId: number;
  token: string;
  facilitatorUrl: string;
}

interface ResourceResult {
  success: boolean;
  data?: any;
  payment?: {
    txHash: string;
    amount: string;
    explorer: string;
  };
  error?: string;
}

class BuyerAgent {
  private wallet: Wallet;
  private baseUrl: string;

  constructor(privateKey: string, baseUrl: string) {
    if (!privateKey) {
      throw new Error('Private key is required');
    }

    const provider = new ethers.JsonRpcProvider(CRONOS_TESTNET.rpcUrl);
    this.wallet = new Wallet(privateKey, provider);
    this.baseUrl = baseUrl;

    console.log(`[Agent] Initialized with address: ${this.wallet.address}`);
  }

  /**
   * Fetch a resource, handling x402 payment flow automatically
   */
  async fetchResource(endpoint: string): Promise<ResourceResult> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`\n[Agent] Fetching: ${url}`);

    // Step 1: Initial request (will return 402)
    const initialResponse = await fetch(url);

    if (initialResponse.status === 402) {
      console.log(`[Agent] Received 402 Payment Required`);

      const requirements: PaymentRequirements = await initialResponse.json();
      console.log(`[Agent] Payment requirements:`);
      console.log(`        Amount: ${formatUSDC(requirements.amount)}`);
      console.log(`        Recipient: ${requirements.recipient}`);
      console.log(`        Chain: ${requirements.chainId}`);

      // Step 2: Generate payment authorization
      const paymentHeader = await this.generatePayment(requirements);

      // Step 3: Retry with payment
      console.log(`[Agent] Retrying with X-PAYMENT header...`);
      const paidResponse = await fetch(url, {
        headers: {
          [HTTP_HEADERS.PAYMENT]: paymentHeader,
        },
      });

      if (paidResponse.ok) {
        const data = await paidResponse.json();
        const txHash = paidResponse.headers.get(HTTP_HEADERS.PAYMENT_TX_HASH);

        console.log(`[Agent] Payment successful!`);
        if (txHash) {
          console.log(`[Agent] TxHash: ${txHash}`);
          console.log(`[Agent] Explorer: ${getExplorerTxUrl(txHash, CHAIN_ID)}`);
        }

        return {
          success: true,
          data: data,
          payment: data.payment,
        };
      } else {
        const error = await paidResponse.json();
        console.log(`[Agent] Payment failed: ${JSON.stringify(error)}`);
        return {
          success: false,
          error: error.error || 'Payment failed',
        };
      }
    }

    // No payment required
    if (initialResponse.ok) {
      const data = await initialResponse.json();
      return { success: true, data };
    }

    return {
      success: false,
      error: `HTTP ${initialResponse.status}: ${initialResponse.statusText}`,
    };
  }

  /**
   * Generate EIP-3009 payment authorization
   */
  private async generatePayment(requirements: PaymentRequirements): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const validBefore = now + 3600; // Valid for 1 hour

    const params: TransferWithAuthorizationParams = {
      from: this.wallet.address,
      to: requirements.recipient,
      value: requirements.amount,
      validAfter: 0,
      validBefore: validBefore,
      nonce: generateNonce(),
    };

    console.log(`[Agent] Signing EIP-3009 authorization...`);
    console.log(`        From: ${params.from}`);
    console.log(`        To: ${params.to}`);
    console.log(`        Value: ${formatUSDC(params.value)}`);

    const auth = await signTransferWithAuthorization(
      this.wallet,
      params,
      requirements.chainId,
      requirements.token
    );

    return createPaymentHeader(auth);
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Check wallet balance (CRO)
   */
  async getBalance(): Promise<string> {
    const balance = await this.wallet.provider!.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }
}

// =============================================================================
// DEMO EXECUTION
// =============================================================================

async function runDemo() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Cronos ParallelPay - Buyer Agent Demo');
  console.log('='.repeat(60));
  console.log('');

  if (!PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY environment variable is required');
    console.log('');
    console.log('To run this demo:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Add your private key');
    console.log('3. Get testnet CRO from https://cronos.org/faucet');
    console.log('4. Get testnet USDC.e from https://faucet.cronos.org');
    console.log('');
    process.exit(1);
  }

  const agent = new BuyerAgent(PRIVATE_KEY, SELLER_API_URL);

  console.log(`Network:      ${CRONOS_TESTNET.name} (Chain ID: ${CHAIN_ID})`);
  console.log(`Agent Wallet: ${agent.getAddress()}`);
  console.log(`Seller API:   ${SELLER_API_URL}`);
  console.log('');

  // Check balance
  try {
    const balance = await agent.getBalance();
    console.log(`CRO Balance:  ${balance} CRO`);
  } catch (error) {
    console.log(`CRO Balance:  Unable to fetch (network error)`);
  }
  console.log('');

  // Demo: Fetch premium data
  console.log('='.repeat(60));
  console.log('  Flow A: Premium Data (x402 Payment)');
  console.log('='.repeat(60));

  const premiumResult = await agent.fetchResource('/api/premium-data');

  if (premiumResult.success) {
    console.log('\n[Agent] Received premium data:');
    console.log(JSON.stringify(premiumResult.data, null, 2));
  } else {
    console.log(`\n[Agent] Failed: ${premiumResult.error}`);
    console.log('\nNote: Make sure the seller-api is running:');
    console.log('  npm run seller-api');
  }

  // Demo: AI Inference
  console.log('\n');
  console.log('='.repeat(60));
  console.log('  Flow B: AI Inference (x402 Payment)');
  console.log('='.repeat(60));

  const inferenceResult = await agent.fetchResource('/api/ai-inference?prompt=Analyze%20CRO%20price');

  if (inferenceResult.success) {
    console.log('\n[Agent] Received AI inference:');
    console.log(JSON.stringify(inferenceResult.data, null, 2));
  } else {
    console.log(`\n[Agent] Failed: ${inferenceResult.error}`);
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('  Demo Complete');
  console.log('='.repeat(60));
  console.log('');
}

// Run if executed directly
runDemo().catch(console.error);

export { BuyerAgent, generateNonce, signTransferWithAuthorization, createPaymentHeader };
