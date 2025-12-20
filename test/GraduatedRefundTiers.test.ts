import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SLAStreamFactory, RefundManager } from '../typechain-types';

describe('GraduatedRefundTiers', () => {
  let streamFactory: SLAStreamFactory;
  let refundManager: RefundManager;
  let owner: any;
  let sender: any;
  let recipient: any;

  beforeEach(async () => {
    [owner, sender, recipient] = await ethers.getSigners();
    
    const SLAStreamFactoryFactory = await ethers.getContractFactory('SLAStreamFactory');
    streamFactory = await SLAStreamFactoryFactory.deploy();
    await streamFactory.waitForDeployment();

    const RefundManagerFactory = await ethers.getContractFactory('RefundManager');
    refundManager = await RefundManagerFactory.deploy(await streamFactory.getAddress());
    await refundManager.waitForDeployment();

    // Authorize refund manager as oracle
    await streamFactory.setOracleAuthorization(await refundManager.getAddress(), true);
  });

  describe('Unit Tests - Tier Calculation', () => {
    it('should calculate tier 1 refund for minor breach', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0, // Not used with tiers
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,   // 5%
        tier2RefundPercent: 1500,  // 15%
        tier3RefundPercent: 5000,  // 50%
        tier1Threshold: 100,       // Minor: < 100
        tier2Threshold: 500,       // Moderate: 100-499, Severe: >= 500
      };

      const tx = await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      await tx.wait();

      // Test tier 1: breach value 50 (< 100)
      const [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 50, 'latency');
      
      expect(tier).to.equal(1);
      expect(refundAmount).to.equal(ethers.parseEther('0.05')); // 5% of 1 ETH
    });

    it('should calculate tier 2 refund for moderate breach', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,   // 5%
        tier2RefundPercent: 1500,  // 15%
        tier3RefundPercent: 5000,  // 50%
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      // Test tier 2: breach value 300 (100 <= x < 500)
      const [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 300, 'latency');
      
      expect(tier).to.equal(2);
      expect(refundAmount).to.equal(ethers.parseEther('0.15')); // 15% of 1 ETH
    });

    it('should calculate tier 3 refund for severe breach', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,   // 5%
        tier2RefundPercent: 1500,  // 15%
        tier3RefundPercent: 5000,  // 50%
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      // Test tier 3: breach value 1000 (>= 500)
      const [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 1000, 'latency');
      
      expect(tier).to.equal(3);
      expect(refundAmount).to.equal(ethers.parseEther('0.5')); // 50% of 1 ETH
    });

    it('should handle threshold boundary cases correctly', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      // At tier1Threshold boundary (100) -> should be tier 2
      let [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 100, 'latency');
      expect(tier).to.equal(2);

      // At tier2Threshold boundary (500) -> should be tier 3
      [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 500, 'latency');
      expect(tier).to.equal(3);

      // Just below tier1Threshold (99) -> should be tier 1
      [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 99, 'latency');
      expect(tier).to.equal(1);
    });

    it('should not exceed 10000 basis points for tier percentages', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const invalidRefundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 15000,  // Invalid: > 10000
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await expect(
        streamFactory.connect(sender).createStreamWithTiers(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          slaConfig,
          invalidRefundTiers,
          { value: amount }
        )
      ).to.be.revertedWithCustomError(streamFactory, 'InvalidSLAConfig');
    });

    it('should reject zero thresholds', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      // Test zero tier1Threshold
      const invalidTiers1 = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,
        tier1Threshold: 0,  // Invalid: must be > 0
        tier2Threshold: 500,
      };

      await expect(
        streamFactory.connect(sender).createStreamWithTiers(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          slaConfig,
          invalidTiers1,
          { value: amount }
        )
      ).to.be.revertedWithCustomError(streamFactory, 'InvalidSLAConfig');

      // Test zero tier2Threshold
      const invalidTiers2 = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,
        tier1Threshold: 100,
        tier2Threshold: 0,  // Invalid: must be > 0
      };

      await expect(
        streamFactory.connect(sender).createStreamWithTiers(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          slaConfig,
          invalidTiers2,
          { value: amount }
        )
      ).to.be.revertedWithCustomError(streamFactory, 'InvalidSLAConfig');
    });

    it('should support backward compatibility with legacy fixed percentage', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 1000, // 10% legacy refund
        autoStopOnSevereBreach: false,
      };

      // Create stream with old method (no tiers)
      await streamFactory.connect(sender).createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      // Should return tier 0 (legacy mode) and 10% refund
      const [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 100, 'latency');
      
      expect(tier).to.equal(0); // Legacy mode
      expect(refundAmount).to.equal(ethers.parseEther('0.1')); // 10% of 1 ETH
    });

    it('should not refund more than remaining balance', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('0.1'); // Small amount

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000, // 50% = 0.05 ETH
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      // Calculate expected refund for tier 3
      const [refundAmount, tier] = await streamFactory.calculateTieredRefund(0, 1000, 'latency');
      
      expect(tier).to.equal(3);
      expect(refundAmount).to.equal(ethers.parseEther('0.05')); // 50% of 0.1 ETH
      expect(refundAmount).to.be.lte(amount); // Should not exceed remaining balance
    });
  });

  describe('Integration Tests - Full Refund Flow', () => {
    it('should execute tier 1 breach refund correctly', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,   // 5%
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      const senderBalanceBefore = await ethers.provider.getBalance(sender.address);

      // Report breach with tier 1 severity
      const tx = await streamFactory.reportSLABreach(0, 'latency', 50);
      const receipt = await tx.wait();

      const senderBalanceAfter = await ethers.provider.getBalance(sender.address);
      const refunded = senderBalanceAfter - senderBalanceBefore;

      // Should refund 5% (0.05 ETH)
      expect(refunded).to.be.closeTo(ethers.parseEther('0.05'), ethers.parseEther('0.001'));
    });

    it('should execute tier 2 breach refund correctly', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,  // 15%
        tier3RefundPercent: 5000,
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      const senderBalanceBefore = await ethers.provider.getBalance(sender.address);

      // Report breach with tier 2 severity
      await streamFactory.reportSLABreach(0, 'uptime', 300);

      const senderBalanceAfter = await ethers.provider.getBalance(sender.address);
      const refunded = senderBalanceAfter - senderBalanceBefore;

      // Should refund 15% (0.15 ETH)
      expect(refunded).to.be.closeTo(ethers.parseEther('0.15'), ethers.parseEther('0.001'));
    });

    it('should execute tier 3 breach refund correctly', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,  // 50%
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      const senderBalanceBefore = await ethers.provider.getBalance(sender.address);

      // Report breach with tier 3 severity
      await streamFactory.reportSLABreach(0, 'error_rate', 1000);

      const senderBalanceAfter = await ethers.provider.getBalance(sender.address);
      const refunded = senderBalanceAfter - senderBalanceBefore;

      // Should refund 50% (0.5 ETH)
      expect(refunded).to.be.closeTo(ethers.parseEther('0.5'), ethers.parseEther('0.001'));
    });

    it('should handle escalation from tier 1 to tier 3 across multiple breaches', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,   // 5%
        tier2RefundPercent: 1500,  // 15%
        tier3RefundPercent: 5000,  // 50%
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      const senderBalanceBefore = await ethers.provider.getBalance(sender.address);

      // First breach: tier 1 (5%)
      await streamFactory.reportSLABreach(0, 'latency', 50);
      
      // Second breach: tier 2 (15%)
      await streamFactory.reportSLABreach(0, 'latency', 300);
      
      // Third breach: tier 3 (50%)
      await streamFactory.reportSLABreach(0, 'error_rate', 1000);

      const senderBalanceAfter = await ethers.provider.getBalance(sender.address);
      const totalRefunded = senderBalanceAfter - senderBalanceBefore;

      // Total: 5% + 15% + 50% = 70% = 0.7 ETH
      expect(totalRefunded).to.be.closeTo(ethers.parseEther('0.7'), ethers.parseEther('0.001'));

      const stream = await streamFactory.getStream(0);
      expect(stream.breachCount).to.equal(3);
    });

    it('should handle batch refunds with mixed tier levels', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      // Create 3 streams
      for (let i = 0; i < 3; i++) {
        await streamFactory.connect(sender).createStreamWithTiers(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          slaConfig,
          refundTiers,
          { value: amount }
        );
      }

      // Authorize refund manager
      await streamFactory.setOracleAuthorization(await refundManager.getAddress(), true);

      // Execute batch refunds with different tiers
      const tx = await refundManager.batchExecutePartialRefunds(
        [0, 1, 2],
        ['latency', 'uptime', 'error_rate'],
        [50, 300, 1000] // tier 1, tier 2, tier 3
      );

      await tx.wait();

      // Verify breach counts
      for (let i = 0; i < 3; i++) {
        const stream = await streamFactory.getStream(i);
        expect(stream.breachCount).to.equal(1);
      }
    });
  });

  describe('Event Tests', () => {
    it('should emit TieredRefundExecuted event with correct tier', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,
        tier2RefundPercent: 1500,
        tier3RefundPercent: 5000,
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      // Test tier 2 event
      const tx = await streamFactory.reportSLABreach(0, 'latency', 300);
      
      await expect(tx)
        .to.emit(streamFactory, 'TieredRefundExecuted')
        .withArgs(0, 2, ethers.parseEther('0.15'), 'latency', 300);
    });

    it('should emit correct refund amount in event', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('2.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 0,
        autoStopOnSevereBreach: false,
      };

      const refundTiers = {
        tier1RefundPercent: 500,   // 5% of 2 ETH = 0.1 ETH
        tier2RefundPercent: 1500,  // 15% of 2 ETH = 0.3 ETH
        tier3RefundPercent: 5000,  // 50% of 2 ETH = 1.0 ETH
        tier1Threshold: 100,
        tier2Threshold: 500,
      };

      await streamFactory.connect(sender).createStreamWithTiers(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        refundTiers,
        { value: amount }
      );

      // Tier 3 refund
      const tx = await streamFactory.reportSLABreach(0, 'error_rate', 1000);
      
      await expect(tx)
        .to.emit(streamFactory, 'TieredRefundExecuted')
        .withArgs(0, 3, ethers.parseEther('1.0'), 'error_rate', 1000);
    });

    it('should not emit TieredRefundExecuted for legacy streams', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 1000, // 10% legacy
        autoStopOnSevereBreach: false,
      };

      // Create legacy stream (no tiers)
      await streamFactory.connect(sender).createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      // Should not emit TieredRefundExecuted
      const tx = await streamFactory.reportSLABreach(0, 'latency', 300);
      
      const receipt = await tx.wait();
      const tieredEvents = receipt?.logs.filter((log: any) => {
        try {
          const parsed = streamFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed && parsed.name === 'TieredRefundExecuted';
        } catch {
          return false;
        }
      });

      expect(tieredEvents).to.have.length(0);
    });
  });
});
