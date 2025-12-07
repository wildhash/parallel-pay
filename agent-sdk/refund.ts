import { ethers } from 'ethers';
import RefundManagerArtifact from '../artifacts/contracts/RefundManager.sol/RefundManager.json' with { type: 'json' };
import AgentOracleArtifact from '../artifacts/contracts/AgentOracle.sol/AgentOracle.json' with { type: 'json' };
import SLAStreamFactoryArtifact from '../artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json' with { type: 'json' };

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

      const tx = await this.refundManagerContract.executePartialRefund(
        options.streamId,
        options.breachType,
        options.breachValue
      );

      const receipt = await tx.wait();

      console.log(`✅ Partial refund executed successfully`);
      console.log(`   Transaction: ${receipt.hash}`);

      return {
        success: true,
        transactionHash: receipt.hash,
        streamId: options.streamId,
        type: 'partial',
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
    const breachCounts = new Map<string, number>();

    console.log(`🤖 Starting automatic refund execution`);
    console.log(`   Breach threshold: ${breachThreshold}`);
    console.log(`   Severity threshold: ${severityThreshold}`);

    this.oracleContract.on(
      'SLABreached',
      async (streamId, breachType, expectedValue, actualValue, timestamp) => {
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
          // Severe breach - execute full refund or cancel
          console.log(`⚠️  Severe breach threshold reached (${count}/${severityThreshold})`);
          await this.executeFullRefund(streamId, `Severe ${breachType} breach`);
          breachCounts.delete(key); // Reset counter after full refund
        } else if (count >= breachThreshold) {
          // Moderate breach - execute partial refund
          console.log(`⚠️  Breach threshold reached (${count}/${breachThreshold})`);
          await this.executePartialRefund({
            streamId,
            breachType,
            breachValue: Number(actualValue),
          });
        }
      }
    );

    console.log('👂 Listening for SLA breach events...');
  }

  /**
   * Stop listening for breach events
   */
  stopAutoRefund(): void {
    this.oracleContract.removeAllListeners('SLABreached');
    console.log('🛑 Automatic refund execution stopped');
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
   * Listen for refund events
   */
  async listenForRefunds(callback: (event: any) => void): Promise<void> {
    this.refundManagerContract.on(
      'PartialRefundExecuted',
      (streamId, executor, amount, reason, event) => {
        console.log(`💰 PARTIAL REFUND EVENT:`, {
          streamId: streamId.toString(),
          executor,
          amount: ethers.formatEther(amount),
          reason,
        });
        callback({ type: 'partial', event });
      }
    );

    this.refundManagerContract.on(
      'FullRefundExecuted',
      (streamId, executor, amount, reason, event) => {
        console.log(`💰 FULL REFUND EVENT:`, {
          streamId: streamId.toString(),
          executor,
          amount: ethers.formatEther(amount),
          reason,
        });
        callback({ type: 'full', event });
      }
    );

    this.refundManagerContract.on(
      'StreamCancelledByRefund',
      (streamId, executor, reason, event) => {
        console.log(`🚫 STREAM CANCELLED EVENT:`, {
          streamId: streamId.toString(),
          executor,
          reason,
        });
        callback({ type: 'cancel', event });
      }
    );

    console.log('👂 Listening for refund events...');
  }
}
