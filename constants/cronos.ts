/**
 * Cronos Network Constants for x402 Integration
 *
 * Reference: https://docs.cronos.org/cronos-x402-facilitator/introduction
 */

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

export const CRONOS_MAINNET = {
  chainId: 25,
  name: 'Cronos Mainnet',
  rpcUrl: 'https://evm.cronos.org',
  explorerUrl: 'https://explorer.cronos.org',
  currency: {
    name: 'Cronos',
    symbol: 'CRO',
    decimals: 18,
  },
} as const;

export const CRONOS_TESTNET = {
  chainId: 338,
  name: 'Cronos Testnet',
  rpcUrl: 'https://evm-t3.cronos.org',
  explorerUrl: 'https://explorer.cronos.org/testnet',
  currency: {
    name: 'Cronos',
    symbol: 'TCRO',
    decimals: 18,
  },
} as const;

// =============================================================================
// TOKEN ADDRESSES
// =============================================================================

export const TOKENS = {
  // Cronos Testnet
  testnet: {
    USDC_E: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0', // devUSDC.e for testing
  },
  // Cronos Mainnet
  mainnet: {
    USDC_E: '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59', // USDC.e bridged
  },
} as const;

// =============================================================================
// x402 FACILITATOR
// =============================================================================

export const X402_FACILITATOR = {
  // Base URL for the Cronos x402 Facilitator service
  baseUrl: 'https://facilitator.cronoslabs.org/v2/x402',

  // Endpoints
  endpoints: {
    verify: '/verify',
    settle: '/settle',
    supported: '/supported',
  },

  // Full URLs
  verifyUrl: 'https://facilitator.cronoslabs.org/v2/x402/verify',
  settleUrl: 'https://facilitator.cronoslabs.org/v2/x402/settle',
  supportedUrl: 'https://facilitator.cronoslabs.org/v2/x402/supported',
} as const;

// =============================================================================
// EIP-3009 CONSTANTS
// =============================================================================

export const EIP3009 = {
  // EIP-3009 Transfer With Authorization TypeHash
  TRANSFER_WITH_AUTHORIZATION_TYPEHASH:
    '0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267',

  // EIP-712 Domain Separator TypeHash
  EIP712_DOMAIN_TYPEHASH:
    '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f',

  // Function selector for transferWithAuthorization
  TRANSFER_WITH_AUTHORIZATION_SELECTOR: '0xe3ee160e',
} as const;

// =============================================================================
// FAUCETS
// =============================================================================

export const FAUCETS = {
  testnet: {
    cro: 'https://cronos.org/faucet',
    usdc: 'https://faucet.cronos.org',
  },
} as const;

// =============================================================================
// PRICING DEFAULTS
// =============================================================================

export const PRICING = {
  // Default prices in USDC.e (6 decimals)
  premiumData: {
    amount: '100000', // 0.10 USDC.e
    description: 'Premium data access',
  },
  aiInference: {
    amount: '500000', // 0.50 USDC.e
    description: 'AI inference request',
  },
  streamCreation: {
    amount: '1000000', // 1.00 USDC.e
    description: 'SLA-backed stream creation',
  },
} as const;

// =============================================================================
// SLA CONFIGURATIONS
// =============================================================================

export const SLA_CONFIGS = {
  strict: {
    maxLatencyMs: 200,
    minUptimePercent: 9950,    // 99.50%
    maxErrorRate: 50,          // 0.50%
    maxJitterMs: 50,
    refundPercentOnBreach: 1000, // 10%
    autoStopOnSevereBreach: true,
  },
  moderate: {
    maxLatencyMs: 500,
    minUptimePercent: 9900,    // 99.00%
    maxErrorRate: 100,         // 1.00%
    maxJitterMs: 100,
    refundPercentOnBreach: 500, // 5%
    autoStopOnSevereBreach: true,
  },
  lenient: {
    maxLatencyMs: 1000,
    minUptimePercent: 9500,    // 95.00%
    maxErrorRate: 500,         // 5.00%
    maxJitterMs: 200,
    refundPercentOnBreach: 250, // 2.5%
    autoStopOnSevereBreach: false,
  },
} as const;

// =============================================================================
// GRADUATED REFUND TIERS
// =============================================================================

export const REFUND_TIERS = {
  tier1: {
    threshold: 1,      // 1 breach
    refundPercent: 10, // 10% refund
    description: 'Minor breach',
  },
  tier2: {
    threshold: 3,      // 3+ breaches
    refundPercent: 25, // 25% refund
    description: 'Moderate breach',
  },
  tier3: {
    threshold: 5,      // 5+ breaches
    refundPercent: 50, // 50% refund
    description: 'Severe breach',
  },
} as const;

// =============================================================================
// HTTP HEADERS
// =============================================================================

export const HTTP_HEADERS = {
  // x402 payment header
  PAYMENT: 'X-PAYMENT',

  // Response headers
  PAYMENT_REQUIRED: 'X-Payment-Required',
  PAYMENT_AMOUNT: 'X-Payment-Amount',
  PAYMENT_RECIPIENT: 'X-Payment-Recipient',
  PAYMENT_CHAIN_ID: 'X-Payment-Chain-Id',
  PAYMENT_TX_HASH: 'X-Payment-Tx-Hash',
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get network configuration by chain ID
 */
export function getNetworkConfig(chainId: number) {
  switch (chainId) {
    case 25:
      return { network: CRONOS_MAINNET, tokens: TOKENS.mainnet };
    case 338:
      return { network: CRONOS_TESTNET, tokens: TOKENS.testnet };
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: string, chainId: number = 338): string {
  const { network } = getNetworkConfig(chainId);
  return `${network.explorerUrl}/tx/${txHash}`;
}

/**
 * Get explorer URL for an address
 */
export function getExplorerAddressUrl(address: string, chainId: number = 338): string {
  const { network } = getNetworkConfig(chainId);
  return `${network.explorerUrl}/address/${address}`;
}

/**
 * Format USDC amount for display (6 decimals)
 */
export function formatUSDC(amount: string | bigint): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const whole = value / BigInt(1_000_000);
  const decimal = value % BigInt(1_000_000);
  return `${whole}.${decimal.toString().padStart(6, '0')} USDC.e`;
}

/**
 * Parse USDC amount from display string
 */
export function parseUSDC(amount: string): bigint {
  const [whole, decimal = '0'] = amount.replace(' USDC.e', '').split('.');
  const paddedDecimal = decimal.padEnd(6, '0').slice(0, 6);
  return BigInt(whole) * BigInt(1_000_000) + BigInt(paddedDecimal);
}

export default {
  CRONOS_MAINNET,
  CRONOS_TESTNET,
  TOKENS,
  X402_FACILITATOR,
  EIP3009,
  FAUCETS,
  PRICING,
  SLA_CONFIGS,
  REFUND_TIERS,
  HTTP_HEADERS,
  getNetworkConfig,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  formatUSDC,
  parseUSDC,
};
