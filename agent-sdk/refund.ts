import { ethers } from 'ethers';
import RefundManagerArtifact from '../artifacts/contracts/RefundManager.sol/RefundManager.json' with { type: 'json' };
import AgentOracleArtifact from '../artifacts/contracts/AgentOracle.sol/AgentOracle.json' with { type: 'json' };
import SLAStreamFactoryArtifact from '../artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json' with { type: 'json' };

/**
 * Refund tier configuration
 */
export interface RefundTiers {
  tier1RefundPercent: number;  // Minor breach (basis points 0-10000)
  tier2RefundPercent: number;  // Moderate breach
  tier3RefundPercent: number;  // Severe breach
  tier1Threshold: number;      // Breach value threshold for tier 1
  tier2Threshold: number;      // Breach value threshold for tier 2
}

/**
 * Refund execution options
 */
export interface RefundOptions {
  streamId: bigint;
  breachType: string;
  breachValue: number;
  reason?: string;
}

/**
 * Refund execution result
 */
export interface RefundResult {
  success: boolean;
  transactionHash: string;
  streamId: bigint;
  type: 'partial' | 'full' | 'cancel';
  tier?: number;           // NEW: Which tier was applied
  refundAmount?: bigint;   // NEW: Actual refund amount
  error?: string;
}

/**
 * AI Agent Refund Executor
 * Listens for SLA breaches and executes refunds automatically
 */
export class RefundExecutor {
  private refundManagerContract: ethers.Contract;
  private oracleContract: ethers.Contract;
  private streamFactoryContract: ethers.Contract;
  private signer: ethers.Signer;
  private autoRefundCleanup: (() => void) | null = null;
  private refundListenerCleanup: (() => void) | null = null;

  constructor(
    refundManagerAddress: string,
    oracleAddress: string,
    streamFactoryAddress: string,
    signer: ethers.Signer
  ) {
    this.refundManagerContract = new ethers.Contract(
      refundManagerAddress,
      RefundManagerArtifact.abi,
      signer
    );

    this.oracleContract = new ethers.Contract(
      oracleAddress,
      AgentOracleArtifact.abi,
      signer
    );

    this.streamFactoryContract = new ethers.Contract(
      streamFactoryAddress,
      SLAStreamFactoryArtifact.abi,
      signer
    );

    this.signer = signer;
  }

  /**
   * Execute a partial refund for an SLA breach
   */
  async executePartialRefund(options: RefundOptions): Promise<RefundResult> {
    try {
      console.log(`💰 Executing partial refund for stream ${options.streamId}`, {
        breachType: options.breachType,
        breachValue: options.breachValue,
      });

      // Try to get tier information first
      let tier: number | undefined;
      let refundAmount: bigint | undefined;
      
      try {
        const [amount, tierNum] = await this.streamFactoryContract.calculateTieredRefund(
          options.streamId,
          options.breachValue,
          options.breachType
        );
        refundAmount = amount;
        tier = Number(tierNum);
      } catch (e: any) {
        // If calculateTieredRefund fails, continue without tier info
        console.log('   Note: Could not calculate tier information');
        console.log(`   Reason: ${e.message || 'Unknown error'}`);
      }

      const tx = await this.refundManagerContract.executePartialRefund(
        options.streamId,
        options.breachType,
        options.breachValue
      );

      const receipt = await tx.wait();

      console.log(`✅ Partial refund executed successfully`);
      console.log(`   Transaction: ${receipt.hash}`);
      if (tier !== undefined && tier > 0) {
        console.log(`   Tier: ${tier} (${refundAmount ? ethers.formatEther(refundAmount) : 'unknown'} ETH)`);
      }

      return {
        success: true,
        transactionHash: receipt.hash,
        streamId: options.streamId,
        type: 'partial',
        tier,
        refundAmount,
      };
    } catch (error: any) {
      console.error(`❌ Failed to execute partial refund:`, error.message);
      return {
        success: false,
        transactionHash: '',
        streamId: options.streamId,
        type: 'partial',
        error: error.message,
      };
    }
  }

  /**
   * Execute a full refund for severe SLA violations
   */
  async executeFullRefund(streamId: bigint, reason: string): Promise<RefundResult> {
    try {
      console.log(`💰 Executing FULL refund for stream ${streamId}`, {
        reason,
      });

      const tx = await this.refundManagerContract.executeFullRefund(streamId, reason);
      const receipt = await tx.wait();

      console.log(`✅ Full refund executed successfully`);
      console.log(`   Transaction: ${receipt.hash}`);

      return {
        success: true,
        transactionHash: receipt.hash,
        streamId,
        type: 'full',
      };
    } catch (error: any) {
      console.error(`❌ Failed to execute full refund:`, error.message);
      return {
        success: false,
        transactionHash: '',
        streamId,
        type: 'full',
        error: error.message,
      };
    }
  }

  /**
   * Cancel a stream due to SLA violations
   */
  async cancelStreamDueToSLA(streamId: bigint, reason: string): Promise<RefundResult> {
    try {
      console.log(`🚫 Cancelling stream ${streamId} due to SLA breach`, {
        reason,
      });

      const tx = await this.refundManagerContract.cancelStreamDueToSLA(streamId, reason);
      const receipt = await tx.wait();

      console.log(`✅ Stream cancelled successfully`);
      console.log(`   Transaction: ${receipt.hash}`);

      return {
        success: true,
        transactionHash: receipt.hash,
        streamId,
        type: 'cancel',
      };
    } catch (error: any) {
      console.error(`❌ Failed to cancel stream:`, error.message);
      return {
        success: false,
        transactionHash: '',
        streamId,
        type: 'cancel',
        error: error.message,
      };
    }
  }

  /**
   * Batch execute partial refunds for multiple streams
   */
  async batchExecutePartialRefunds(
    options: RefundOptions[]
  ): Promise<RefundResult[]> {
    try {
      const streamIds = options.map((o) => o.streamId);
      const breachTypes = options.map((o) => o.breachType);
      const breachValues = options.map((o) => o.breachValue);

      console.log(`💰 Batch executing ${options.length} partial refunds`);

      const tx = await this.refundManagerContract.batchExecutePartialRefunds(
        streamIds,
        breachTypes,
        breachValues
      );

      const receipt = await tx.wait();

      console.log(`✅ Batch refunds executed successfully`);
      console.log(`   Transaction: ${receipt.hash}`);

      return options.map((o) => ({
        success: true,
        transactionHash: receipt.hash,
        streamId: o.streamId,
        type: 'partial' as const,
      }));
    } catch (error: any) {
      console.error(`❌ Failed to execute batch refunds:`, error.message);
      return options.map((o) => ({
        success: false,
        transactionHash: '',
        streamId: o.streamId,
        type: 'partial' as const,
        error: error.message,
      }));
    }
  }

  /**
   * Listen for SLA breach events and automatically trigger refunds
   */
  async startAutoRefund(
    breachThreshold: number = 1,
    severityThreshold: number = 3
  ): Promise<void> {
    // Stop existing auto-refund if running
    if (this.autoRefundCleanup) {
      this.stopAutoRefund();
    }

    const breachCounts = new Map<string, number>();

    console.log(`🤖 Starting automatic refund execution`);
    console.log(`   Breach threshold: ${breachThreshold}`);
    console.log(`   Severity threshold: ${severityThreshold}`);

    const listener = async (streamId: any, breachType: any, expectedValue: any, actualValue: any, timestamp: any) => {
      const key = streamId.toString();
      const count = (breachCounts.get(key) || 0) + 1;
      breachCounts.set(key, count);

      console.log(`🚨 SLA BREACH detected:`, {
        streamId: streamId.toString(),
        breachType,
        breachCount: count,
        expected: expectedValue.toString(),
        actual: actualValue.toString(),
      });

      // Execute appropriate refund based on breach count
      if (count >= severityThreshold) {
        console.log(`⚠️  Severe breach threshold reached (${count}/${severityThreshold})`);
        await this.executeFullRefund(streamId, `Severe ${breachType} breach`);
        breachCounts.delete(key); // Reset counter after full refund
      } else if (count >= breachThreshold) {
        console.log(`⚠️  Breach threshold reached (${count}/${breachThreshold})`);
        await this.executePartialRefund({
          streamId,
          breachType,
          breachValue: Number(actualValue),
        });
      }
    };

    this.oracleContract.on('SLABreached', listener);

    // Store cleanup function
    this.autoRefundCleanup = () => {
      this.oracleContract.off('SLABreached', listener);
      breachCounts.clear();
    };

    console.log('👂 Listening for SLA breach events...');
  }

  /**
   * Stop listening for breach events
   */
  stopAutoRefund(): void {
    if (this.autoRefundCleanup) {
      this.autoRefundCleanup();
      this.autoRefundCleanup = null;
      console.log('🛑 Automatic refund execution stopped');
    }
  }

  /**
   * Get stream status
   */
  async getStreamStatus(streamId: bigint): Promise<any> {
    const stream = await this.streamFactoryContract.getStream(streamId);
    return {
      streamId,
      isActive: stream.isActive,
      remainingBalance: ethers.formatEther(stream.remainingBalance),
      deposit: ethers.formatEther(stream.deposit),
      totalRefunded: ethers.formatEther(stream.totalRefunded),
      breachCount: stream.breachCount.toString(),
      sender: stream.sender,
      recipient: stream.recipient,
    };
  }

  /**
   * Get refund tiers configuration for a stream
   */
  async getRefundTiers(streamId: bigint): Promise<RefundTiers> {
    const stream = await this.streamFactoryContract.getStream(streamId);
    
    // The stream struct includes refundTiers
    return {
      tier1RefundPercent: Number(stream.refundTiers.tier1RefundPercent),
      tier2RefundPercent: Number(stream.refundTiers.tier2RefundPercent),
      tier3RefundPercent: Number(stream.refundTiers.tier3RefundPercent),
      tier1Threshold: Number(stream.refundTiers.tier1Threshold),
      tier2Threshold: Number(stream.refundTiers.tier2Threshold),
    };
  }

  /**
   * Listen for refund events
   */
  async listenForRefunds(callback: (event: any) => void): Promise<void> {
    // Remove existing listeners if any
    if (this.refundListenerCleanup) {
      this.stopListeningForRefunds();
    }

    const partialListener = (streamId: any, executor: any, amount: any, reason: any, event: any) => {
      console.log(`💰 PARTIAL REFUND EVENT:`, {
        streamId: streamId.toString(),
        executor,
        amount: ethers.formatEther(amount),
        reason,
      });
      callback({ type: 'partial', event });
    };

    const fullListener = (streamId: any, executor: any, amount: any, reason: any, event: any) => {
      console.log(`💰 FULL REFUND EVENT:`, {
        streamId: streamId.toString(),
        executor,
        amount: ethers.formatEther(amount),
        reason,
      });
      callback({ type: 'full', event });
    };

    const cancelListener = (streamId: any, executor: any, reason: any, event: any) => {
      console.log(`🚫 STREAM CANCELLED EVENT:`, {
        streamId: streamId.toString(),
        executor,
        reason,
      });
      callback({ type: 'cancel', event });
    };

    const tieredRefundListener = (streamId: any, tier: any, amount: any, breachType: any, breachValue: any, event: any) => {
      console.log(`💰 TIERED REFUND EVENT:`, {
        streamId: streamId.toString(),
        tier: tier.toString(),
        amount: ethers.formatEther(amount),
        breachType,
        breachValue: breachValue.toString(),
      });
      callback({ type: 'tiered', tier: Number(tier), event });
    };

    this.refundManagerContract.on('PartialRefundExecuted', partialListener);
    this.refundManagerContract.on('FullRefundExecuted', fullListener);
    this.refundManagerContract.on('StreamCancelledByRefund', cancelListener);
    this.refundManagerContract.on('TieredRefundExecuted', tieredRefundListener);

    // Store cleanup function
    this.refundListenerCleanup = () => {
      this.refundManagerContract.off('PartialRefundExecuted', partialListener);
      this.refundManagerContract.off('FullRefundExecuted', fullListener);
      this.refundManagerContract.off('StreamCancelledByRefund', cancelListener);
      this.refundManagerContract.off('TieredRefundExecuted', tieredRefundListener);
    };

    console.log('👂 Listening for refund events...');
  }

  /**
   * Stop listening for refund events
   */
  stopListeningForRefunds(): void {
    if (this.refundListenerCleanup) {
      this.refundListenerCleanup();
      this.refundListenerCleanup = null;
      console.log('🛑 Stopped listening for refund events');
    }
  }

  /**
   * Cleanup all resources (listeners)
   */
  cleanup(): void {
    this.stopAutoRefund();
    this.stopListeningForRefunds();
    console.log('✅ RefundExecutor cleanup complete');
  }
}
