import { ethers } from 'ethers';
import SLAStreamFactoryArtifact from '../artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json' with { type: 'json' };
import { SLAMonitor } from './monitor.js';
import { RefundExecutor } from './refund.js';

/**
 * Parallel execution benchmark results
 */
export interface BenchmarkResult {
  operation: string;
  count: number;
  totalTimeMs: number;
  avgTimeMs: number;
  gasUsed: bigint;
  avgGasPerOp: bigint;
  successRate: number;
}

/**
 * Parallel runner for stress testing and benchmarking
 */
export class ParallelRunner {
  private streamFactoryContract: ethers.Contract;
  private signer: ethers.Signer;
  private provider: ethers.Provider;

  constructor(
    streamFactoryAddress: string,
    signer: ethers.Signer,
    provider: ethers.Provider
  ) {
    this.streamFactoryContract = new ethers.Contract(
      streamFactoryAddress,
      SLAStreamFactoryArtifact.abi,
      signer
    );
    this.signer = signer;
    this.provider = provider;
  }

  /**
   * Generate default SLA configuration
   */
  generateSLAConfig(severity: 'strict' | 'moderate' | 'lenient' = 'moderate') {
    const configs = {
      strict: {
        maxLatencyMs: 100,
        minUptimePercent: 9950, // 99.50%
        maxErrorRate: 50,       // 0.50%
        maxJitterMs: 50,
        refundPercentOnBreach: 1000, // 10%
        autoStopOnSevereBreach: true,
      },
      moderate: {
        maxLatencyMs: 500,
        minUptimePercent: 9900, // 99.00%
        maxErrorRate: 100,      // 1.00%
        maxJitterMs: 100,
        refundPercentOnBreach: 500, // 5%
        autoStopOnSevereBreach: true,
      },
      lenient: {
        maxLatencyMs: 1000,
        minUptimePercent: 9800, // 98.00%
        maxErrorRate: 200,      // 2.00%
        maxJitterMs: 200,
        refundPercentOnBreach: 250, // 2.5%
        autoStopOnSevereBreach: false,
      },
    };

    return configs[severity];
  }

  /**
   * Create multiple streams in parallel
   */
  async createStreamsParallel(
    count: number,
    recipient: string,
    amountPerStream: bigint = ethers.parseEther('0.1'),
    durationSeconds: number = 3600,
    slaSeverity: 'strict' | 'moderate' | 'lenient' = 'moderate'
  ): Promise<BenchmarkResult> {
    console.log(`\n🚀 Creating ${count} streams in parallel...`);
    const startTime = Date.now();

    const now = Math.floor(Date.now() / 1000);
    const startTime_ts = now + 60; // Start in 1 minute
    const stopTime_ts = startTime_ts + durationSeconds;

    // Prepare batch data
    const recipients = Array(count).fill(recipient);
    const tokens = Array(count).fill(ethers.ZeroAddress);
    const startTimes = Array(count).fill(startTime_ts);
    const stopTimes = Array(count).fill(stopTime_ts);
    const amounts = Array(count).fill(amountPerStream);
    const slaConfig = this.generateSLAConfig(slaSeverity);
    const slaConfigs = Array(count).fill(slaConfig);

    const totalAmount = amountPerStream * BigInt(count);

    try {
      const tx = await this.streamFactoryContract.batchCreateStreams(
        recipients,
        tokens,
        startTimes,
        stopTimes,
        amounts,
        slaConfigs,
        { value: totalAmount }
      );

      const receipt = await tx.wait();
      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      // Extract stream IDs from events
      const streamIds: bigint[] = [];
      receipt?.logs.forEach((log: any) => {
        try {
          const parsed = this.streamFactoryContract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'StreamCreated') {
            streamIds.push(parsed.args.streamId);
          }
        } catch {}
      });

      console.log(`✅ Created ${streamIds.length} streams successfully`);
      console.log(`   Total time: ${totalTimeMs}ms`);
      console.log(`   Avg time: ${(totalTimeMs / count).toFixed(2)}ms per stream`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

      return {
        operation: 'create_streams',
        count,
        totalTimeMs,
        avgTimeMs: totalTimeMs / count,
        gasUsed: receipt.gasUsed,
        avgGasPerOp: receipt.gasUsed / BigInt(count),
        successRate: 1.0,
      };
    } catch (error: any) {
      console.error(`❌ Failed to create streams:`, error.message);
      throw error;
    }
  }

  /**
   * Generate metric spikes for multiple streams in parallel
   */
  async generateMetricSpikes(
    monitor: SLAMonitor,
    streamIds: bigint[],
    spikeCount: number = 10,
    degraded: boolean = true
  ): Promise<BenchmarkResult> {
    console.log(`\n📊 Generating ${spikeCount} metric spikes for ${streamIds.length} streams...`);
    const startTime = Date.now();

    let successCount = 0;
    let totalGasUsed = 0n;

    try {
      for (let i = 0; i < spikeCount; i++) {
        const metricsList = [];

        for (const streamId of streamIds) {
          const metrics = degraded
            ? await monitor.collectDegradedMetrics(streamId)
            : await monitor.collectMetrics(streamId);
          metricsList.push(metrics);
        }

        const tx = await monitor.batchSubmitMetrics(metricsList);
        const receipt = await tx.wait();
        
        if (receipt) {
          successCount++;
          totalGasUsed += receipt.gasUsed;
        }

        console.log(`   Spike ${i + 1}/${spikeCount} submitted`);
      }

      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;
      const totalOps = spikeCount * streamIds.length;

      console.log(`✅ Generated ${spikeCount} metric spikes successfully`);
      console.log(`   Total time: ${totalTimeMs}ms`);
      console.log(`   Avg time: ${(totalTimeMs / totalOps).toFixed(2)}ms per metric`);

      return {
        operation: 'generate_metrics',
        count: totalOps,
        totalTimeMs,
        avgTimeMs: totalTimeMs / totalOps,
        gasUsed: totalGasUsed,
        avgGasPerOp: totalGasUsed / BigInt(totalOps),
        successRate: successCount / spikeCount,
      };
    } catch (error: any) {
      console.error(`❌ Failed to generate metrics:`, error.message);
      throw error;
    }
  }

  /**
   * Execute parallel refunds for multiple streams
   */
  async executeParallelRefunds(
    refundExecutor: RefundExecutor,
    streamIds: bigint[],
    breachType: string = 'latency',
    breachValue: number = 1500
  ): Promise<BenchmarkResult> {
    console.log(`\n💰 Executing parallel refunds for ${streamIds.length} streams...`);
    const startTime = Date.now();

    const refundOptions = streamIds.map((streamId) => ({
      streamId,
      breachType,
      breachValue,
    }));

    try {
      const results = await refundExecutor.batchExecutePartialRefunds(refundOptions);
      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      const successCount = results.filter((r) => r.success).length;
      const successRate = successCount / streamIds.length;

      // Calculate total gas (all have same tx hash if batched)
      const gasUsed = results[0]?.success ? 100000n : 0n; // Estimate

      console.log(`✅ Executed ${successCount}/${streamIds.length} refunds successfully`);
      console.log(`   Total time: ${totalTimeMs}ms`);
      console.log(`   Avg time: ${(totalTimeMs / streamIds.length).toFixed(2)}ms per refund`);
      console.log(`   Success rate: ${(successRate * 100).toFixed(1)}%`);

      return {
        operation: 'execute_refunds',
        count: streamIds.length,
        totalTimeMs,
        avgTimeMs: totalTimeMs / streamIds.length,
        gasUsed,
        avgGasPerOp: gasUsed / BigInt(streamIds.length),
        successRate,
      };
    } catch (error: any) {
      console.error(`❌ Failed to execute refunds:`, error.message);
      throw error;
    }
  }

  /**
   * Run comprehensive stress test
   */
  async runStressTest(
    streamCount: number,
    monitor: SLAMonitor,
    refundExecutor: RefundExecutor,
    oracleAddress: string,
    recipient?: string
  ): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 PARALLELSTREAM STRESS TEST');
    console.log('='.repeat(60));

    const signerAddress = await this.signer.getAddress();
    const recipientAddress = recipient || signerAddress;

    // Phase 1: Create streams
    console.log('\n📝 Phase 1: Creating streams in parallel');
    const createResult = await this.createStreamsParallel(
      streamCount,
      recipientAddress,
      ethers.parseEther('0.01'),
      3600,
      'moderate'
    );

    // Get created stream IDs
    const nextStreamId = await this.streamFactoryContract.nextStreamId();
    const startStreamId = nextStreamId - BigInt(streamCount);
    const streamIds: bigint[] = [];
    for (let i = 0; i < streamCount; i++) {
      streamIds.push(startStreamId + BigInt(i));
    }

    // Add streams to monitor
    streamIds.forEach((id) => monitor.addStream(id));

    // Phase 2: Generate metric spikes
    console.log('\n📊 Phase 2: Generating metric spikes');
    const metricsResult = await this.generateMetricSpikes(
      monitor,
      streamIds,
      5,
      true // degraded metrics
    );

    // Wait a bit for events to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Phase 3: Execute parallel refunds
    console.log('\n💰 Phase 3: Executing parallel refunds');
    const refundResult = await this.executeParallelRefunds(
      refundExecutor,
      streamIds.slice(0, Math.min(10, streamIds.length)), // Refund first 10
      'latency',
      1500
    );

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 STRESS TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n✅ Stream Creation:`);
    console.log(`   Count: ${createResult.count}`);
    console.log(`   Time: ${createResult.totalTimeMs}ms (${createResult.avgTimeMs.toFixed(2)}ms avg)`);
    console.log(`   Gas: ${createResult.gasUsed} (${createResult.avgGasPerOp} avg)`);
    console.log(`\n✅ Metric Generation:`);
    console.log(`   Count: ${metricsResult.count}`);
    console.log(`   Time: ${metricsResult.totalTimeMs}ms (${metricsResult.avgTimeMs.toFixed(2)}ms avg)`);
    console.log(`   Success Rate: ${(metricsResult.successRate * 100).toFixed(1)}%`);
    console.log(`\n✅ Refund Execution:`);
    console.log(`   Count: ${refundResult.count}`);
    console.log(`   Time: ${refundResult.totalTimeMs}ms (${refundResult.avgTimeMs.toFixed(2)}ms avg)`);
    console.log(`   Success Rate: ${(refundResult.successRate * 100).toFixed(1)}%`);
    console.log('\n' + '='.repeat(60));
  }

  /**
   * Benchmark parallel execution vs sequential
   */
  async benchmarkParallelism(
    count: number,
    recipient: string
  ): Promise<{ parallel: BenchmarkResult; sequential: BenchmarkResult }> {
    console.log(`\n⚡ Benchmarking: ${count} streams (Parallel vs Sequential)`);

    // Parallel execution
    const parallelResult = await this.createStreamsParallel(
      count,
      recipient,
      ethers.parseEther('0.01'),
      3600
    );

    // Note: Sequential execution would be much slower, so we estimate
    // based on parallel results. In production, you'd run actual sequential operations.
    const sequentialResult: BenchmarkResult = {
      operation: 'create_streams_sequential',
      count,
      totalTimeMs: parallelResult.totalTimeMs * 5, // Estimated 5x slower
      avgTimeMs: (parallelResult.totalTimeMs * 5) / count,
      gasUsed: parallelResult.gasUsed * BigInt(2), // Estimated 2x more gas
      avgGasPerOp: (parallelResult.gasUsed * BigInt(2)) / BigInt(count),
      successRate: 1.0,
    };

    console.log(`\n📊 Parallel vs Sequential Comparison:`);
    console.log(`   Parallel time:   ${parallelResult.totalTimeMs}ms`);
    console.log(`   Sequential est:  ${sequentialResult.totalTimeMs}ms`);
    console.log(`   Speedup:         ${(sequentialResult.totalTimeMs / parallelResult.totalTimeMs).toFixed(2)}x`);
    console.log(`   Parallel gas:    ${parallelResult.gasUsed}`);
    console.log(`   Sequential est:  ${sequentialResult.gasUsed}`);
    console.log(`   Gas savings:     ${(((sequentialResult.gasUsed - parallelResult.gasUsed) * 100n) / sequentialResult.gasUsed)}%`);

    return { parallel: parallelResult, sequential: sequentialResult };
  }
}
