/**
 * ParallelStream AI Agent SDK
 * 
 * Provides tools for SLA monitoring, refund execution, and parallel stress testing
 * for the Monad-native SLA payment streaming protocol.
 */

export { SLAMonitor, type SLAMetrics, type SLAConfig, type SLABreachResult } from './monitor.js';
export { RefundExecutor, type RefundOptions, type RefundResult } from './refund.js';
export { ParallelRunner, type BenchmarkResult } from './parallel_runner.js';

/**
 * Quick start example:
 * 
 * ```typescript
 * import { SLAMonitor, RefundExecutor, ParallelRunner } from './agent-sdk';
 * import { ethers } from 'ethers';
 * 
 * // Set up provider and signer
 * const provider = new ethers.JsonRpcProvider(rpcUrl);
 * const signer = new ethers.Wallet(privateKey, provider);
 * 
 * // Initialize components
 * const monitor = new SLAMonitor(oracleAddress, streamFactoryAddress, signer);
 * const refundExecutor = new RefundExecutor(
 *   refundManagerAddress,
 *   oracleAddress,
 *   streamFactoryAddress,
 *   signer
 * );
 * const runner = new ParallelRunner(streamFactoryAddress, signer, provider);
 * 
 * // Add streams to monitor
 * monitor.addStream(streamId);
 * 
 * // Start automatic monitoring
 * monitor.startMonitoring(10000); // Check every 10 seconds
 * 
 * // Start automatic refund execution
 * refundExecutor.startAutoRefund(1, 3); // Threshold: 1, Severity: 3
 * 
 * // Run stress test
 * await runner.runStressTest(50, monitor, refundExecutor, oracleAddress);
 * ```
 */

export const version = '1.0.0';
