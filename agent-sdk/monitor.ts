import { ethers } from 'ethers';
import AgentOracleArtifact from '../artifacts/contracts/AgentOracle.sol/AgentOracle.json' with { type: 'json' };
import SLAStreamFactoryArtifact from '../artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json' with { type: 'json' };

/**
 * SLA Metrics structure
 */
export interface SLAMetrics {
  streamId: bigint;
  latencyMs: number;
  uptimePercent: number;  // 0-10000 for 0.00%-100.00%
  errorRate: number;      // 0-10000 for 0.00%-100.00%
  jitterMs: number;
  timestamp: number;
}

/**
 * SLA Configuration from contract
 */
export interface SLAConfig {
  maxLatencyMs: number;
  minUptimePercent: number;
  maxErrorRate: number;
  maxJitterMs: number;
  refundPercentOnBreach: number;
  autoStopOnSevereBreach: boolean;
}

/**
 * SLA breach detection result
 */
export interface SLABreachResult {
  streamId: bigint;
  breached: boolean;
  breachType?: string;
  expectedValue?: number;
  actualValue?: number;
  shouldRefund: boolean;
}

/**
 * AI Agent Monitor for SLA metrics
 * Watches metrics, evaluates SLA conditions, and submits signed reports
 */
export class SLAMonitor {
  private oracleContract: ethers.Contract;
  private streamFactoryContract: ethers.Contract;
  private signer: ethers.Signer;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private streamIds: Set<bigint> = new Set();
  private breachListenerCleanup: (() => void) | null = null;

  constructor(
    oracleAddress: string,
    streamFactoryAddress: string,
    signer: ethers.Signer
  ) {
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
   * Start monitoring a stream
   */
  addStream(streamId: bigint): void {
    this.streamIds.add(streamId);
    console.log(`📊 Added stream ${streamId} to monitoring`);
  }

  /**
   * Stop monitoring a stream
   */
  removeStream(streamId: bigint): void {
    this.streamIds.delete(streamId);
    console.log(`📊 Removed stream ${streamId} from monitoring`);
  }

  /**
   * Get SLA configuration for a stream
   */
  async getSLAConfig(streamId: bigint): Promise<SLAConfig> {
    const stream = await this.streamFactoryContract.getStream(streamId);
    return {
      maxLatencyMs: stream.slaConfig.maxLatencyMs,
      minUptimePercent: stream.slaConfig.minUptimePercent,
      maxErrorRate: stream.slaConfig.maxErrorRate,
      maxJitterMs: stream.slaConfig.maxJitterMs,
      refundPercentOnBreach: stream.slaConfig.refundPercentOnBreach,
      autoStopOnSevereBreach: stream.slaConfig.autoStopOnSevereBreach,
    };
  }

  /**
   * Simulate metric collection (in production, replace with real monitoring)
   */
  async collectMetrics(streamId: bigint): Promise<SLAMetrics> {
    // Simulate realistic metrics with some variance
    const baseLatency = 50;
    const latencyVariance = Math.random() * 100; // 0-100ms variance
    const latencyMs = Math.floor(baseLatency + latencyVariance);

    const baseUptime = 9950; // 99.50%
    const uptimeVariance = Math.floor(Math.random() * 100); // 0-1% variance
    const uptimePercent = baseUptime + uptimeVariance;

    const baseErrorRate = 10; // 0.1%
    const errorVariance = Math.floor(Math.random() * 50); // 0-0.5% variance
    const errorRate = baseErrorRate + errorVariance;

    const baseJitter = 10;
    const jitterVariance = Math.random() * 20; // 0-20ms variance
    const jitterMs = Math.floor(baseJitter + jitterVariance);

    return {
      streamId,
      latencyMs,
      uptimePercent,
      errorRate,
      jitterMs,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Simulate degraded metrics (for testing)
   */
  async collectDegradedMetrics(streamId: bigint): Promise<SLAMetrics> {
    // Simulate poor performance
    const latencyMs = Math.floor(500 + Math.random() * 1000); // 500-1500ms
    const uptimePercent = Math.floor(9000 + Math.random() * 500); // 90-95%
    const errorRate = Math.floor(200 + Math.random() * 300); // 2-5%
    const jitterMs = Math.floor(100 + Math.random() * 200); // 100-300ms

    return {
      streamId,
      latencyMs,
      uptimePercent,
      errorRate,
      jitterMs,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Evaluate if metrics breach SLA
   */
  async evaluateSLA(
    metrics: SLAMetrics,
    config: SLAConfig
  ): Promise<SLABreachResult> {
    const result: SLABreachResult = {
      streamId: metrics.streamId,
      breached: false,
      shouldRefund: false,
    };

    // Check latency breach
    if (metrics.latencyMs > config.maxLatencyMs) {
      result.breached = true;
      result.breachType = 'latency';
      result.expectedValue = config.maxLatencyMs;
      result.actualValue = metrics.latencyMs;
      result.shouldRefund = true;
      return result;
    }

    // Check uptime breach
    if (metrics.uptimePercent < config.minUptimePercent) {
      result.breached = true;
      result.breachType = 'uptime';
      result.expectedValue = config.minUptimePercent;
      result.actualValue = metrics.uptimePercent;
      result.shouldRefund = true;
      return result;
    }

    // Check error rate breach
    if (metrics.errorRate > config.maxErrorRate) {
      result.breached = true;
      result.breachType = 'error_rate';
      result.expectedValue = config.maxErrorRate;
      result.actualValue = metrics.errorRate;
      result.shouldRefund = true;
      return result;
    }

    // Check jitter breach
    if (metrics.jitterMs > config.maxJitterMs) {
      result.breached = true;
      result.breachType = 'jitter';
      result.expectedValue = config.maxJitterMs;
      result.actualValue = metrics.jitterMs;
      result.shouldRefund = true;
      return result;
    }

    return result;
  }

  /**
   * Submit metrics to oracle
   */
  async submitMetrics(metrics: SLAMetrics): Promise<ethers.ContractTransactionResponse> {
    console.log(`📤 Submitting metrics for stream ${metrics.streamId}:`, {
      latency: `${metrics.latencyMs}ms`,
      uptime: `${(metrics.uptimePercent / 100).toFixed(2)}%`,
      errorRate: `${(metrics.errorRate / 100).toFixed(2)}%`,
      jitter: `${metrics.jitterMs}ms`,
    });

    return await this.oracleContract.submitMetricReport(
      metrics.streamId,
      metrics.latencyMs,
      metrics.uptimePercent,
      metrics.errorRate,
      metrics.jitterMs
    );
  }

  /**
   * Submit signed metrics to oracle (with signature verification)
   */
  async submitSignedMetrics(metrics: SLAMetrics): Promise<ethers.ContractTransactionResponse> {
    // Use current timestamp for signature
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Create message hash
    const messageHash = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        metrics.streamId,
        metrics.latencyMs,
        metrics.uptimePercent,
        metrics.errorRate,
        metrics.jitterMs,
        timestamp,
      ]
    );

    // Sign the message
    const signature = await this.signer.signMessage(ethers.getBytes(messageHash));

    console.log(`🔐 Submitting signed metrics for stream ${metrics.streamId}`);

    return await this.oracleContract.submitSignedMetricReport(
      metrics.streamId,
      metrics.latencyMs,
      metrics.uptimePercent,
      metrics.errorRate,
      metrics.jitterMs,
      timestamp,
      signature
    );
  }

  /**
   * Batch submit metrics for multiple streams
   */
  async batchSubmitMetrics(metricsList: SLAMetrics[]): Promise<ethers.ContractTransactionResponse> {
    const streamIds = metricsList.map((m) => m.streamId);
    const latencies = metricsList.map((m) => m.latencyMs);
    const uptimes = metricsList.map((m) => m.uptimePercent);
    const errorRates = metricsList.map((m) => m.errorRate);
    const jitters = metricsList.map((m) => m.jitterMs);

    console.log(`📤 Batch submitting metrics for ${metricsList.length} streams`);

    return await this.oracleContract.batchSubmitMetricReports(
      streamIds,
      latencies,
      uptimes,
      errorRates,
      jitters
    );
  }

  /**
   * Start automatic monitoring loop
   */
  startMonitoring(intervalMs: number = 10000, degraded: boolean = false): void {
    if (this.monitoringInterval) {
      console.log('⚠️  Monitoring already started');
      return;
    }

    console.log(`🚀 Starting SLA monitoring (interval: ${intervalMs}ms, degraded: ${degraded})`);

    this.monitoringInterval = setInterval(async () => {
      try {
        const metricsList: SLAMetrics[] = [];

        for (const streamId of this.streamIds) {
          // Collect metrics (degraded or normal)
          const metrics = degraded
            ? await this.collectDegradedMetrics(streamId)
            : await this.collectMetrics(streamId);

          metricsList.push(metrics);

          // Get SLA config and evaluate
          const config = await this.getSLAConfig(streamId);
          const breachResult = await this.evaluateSLA(metrics, config);

          if (breachResult.breached) {
            console.log(`⚠️  SLA BREACH detected on stream ${streamId}:`, {
              type: breachResult.breachType,
              expected: breachResult.expectedValue,
              actual: breachResult.actualValue,
            });
          }
        }

        // Batch submit all metrics
        if (metricsList.length > 0) {
          const tx = await this.batchSubmitMetrics(metricsList);
          await tx.wait();
          console.log(`✅ Metrics submitted successfully`);
        }
      } catch (error) {
        console.error('❌ Error during monitoring:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop automatic monitoring loop
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('🛑 Monitoring stopped');
    }
  }

  /**
   * Listen for SLA breach events
   */
  async listenForBreaches(callback: (event: any) => void): Promise<void> {
    // Remove existing listener if any
    if (this.breachListenerCleanup) {
      this.breachListenerCleanup();
    }

    const listener = (streamId: any, breachType: any, expectedValue: any, actualValue: any, timestamp: any, event: any) => {
      console.log(`🚨 SLA BREACHED EVENT:`, {
        streamId: streamId.toString(),
        breachType,
        expectedValue: expectedValue.toString(),
        actualValue: actualValue.toString(),
        timestamp: new Date(Number(timestamp) * 1000).toISOString(),
      });
      callback(event);
    };

    this.oracleContract.on('SLABreached', listener);

    // Store cleanup function
    this.breachListenerCleanup = () => {
      this.oracleContract.off('SLABreached', listener);
    };

    console.log('👂 Listening for SLA breach events...');
  }

  /**
   * Stop listening for breach events
   */
  stopListeningForBreaches(): void {
    if (this.breachListenerCleanup) {
      this.breachListenerCleanup();
      this.breachListenerCleanup = null;
      console.log('🛑 Stopped listening for breach events');
    }
  }

  /**
   * Clear all monitored streams
   */
  clearStreams(): void {
    this.streamIds.clear();
    console.log('🗑️  Cleared all monitored streams');
  }

  /**
   * Cleanup all resources (intervals, listeners, data)
   */
  cleanup(): void {
    this.stopMonitoring();
    this.stopListeningForBreaches();
    this.clearStreams();
    console.log('✅ SLAMonitor cleanup complete');
  }
}
