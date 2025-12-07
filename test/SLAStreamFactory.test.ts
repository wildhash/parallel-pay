import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SLAStreamFactory } from '../typechain-types';

describe('SLAStreamFactory', () => {
  let streamFactory: SLAStreamFactory;
  let owner: any;
  let recipient: any;
  let user: any;

  beforeEach(async () => {
    [owner, recipient, user] = await ethers.getSigners();
    
    const SLAStreamFactoryFactory = await ethers.getContractFactory('SLAStreamFactory');
    streamFactory = await SLAStreamFactoryFactory.deploy();
    await streamFactory.waitForDeployment();
  });

  describe('Stream Creation', () => {
    it('should create a stream with SLA configuration', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: true,
      };

      const tx = await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      await expect(tx)
        .to.emit(streamFactory, 'StreamCreated')
        .to.emit(streamFactory, 'SLAConfigured');

      const stream = await streamFactory.getStream(0);
      expect(stream.sender).to.equal(owner.address);
      expect(stream.recipient).to.equal(recipient.address);
      expect(stream.deposit).to.equal(amount);
      expect(stream.isActive).to.be.true;
    });

    it('should reject invalid time range', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 3600;
      const stopTime = startTime - 1; // Invalid: stop before start
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await expect(
        streamFactory.createStream(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          slaConfig,
          { value: amount }
        )
      ).to.be.revertedWithCustomError(streamFactory, 'InvalidTimeRange');
    });

    it('should reject zero deposit', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await expect(
        streamFactory.createStream(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          slaConfig,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(streamFactory, 'InvalidDeposit');
    });

    it('should reject invalid SLA configuration', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const invalidSLA = {
        maxLatencyMs: 500,
        minUptimePercent: 15000, // Invalid: > 10000
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await expect(
        streamFactory.createStream(
          recipient.address,
          ethers.ZeroAddress,
          startTime,
          stopTime,
          invalidSLA,
          { value: amount }
        )
      ).to.be.revertedWithCustomError(streamFactory, 'InvalidSLAConfig');
    });
  });

  describe('Batch Stream Creation', () => {
    it('should create multiple streams in parallel', async () => {
      const count = 5;
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amountPerStream = ethers.parseEther('0.1');

      const recipients = Array(count).fill(recipient.address);
      const tokens = Array(count).fill(ethers.ZeroAddress);
      const startTimes = Array(count).fill(startTime);
      const stopTimes = Array(count).fill(stopTime);
      const amounts = Array(count).fill(amountPerStream);

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: true,
      };
      const slaConfigs = Array(count).fill(slaConfig);

      const totalAmount = amountPerStream * BigInt(count);

      const tx = await streamFactory.batchCreateStreams(
        recipients,
        tokens,
        startTimes,
        stopTimes,
        amounts,
        slaConfigs,
        { value: totalAmount }
      );

      const receipt = await tx.wait();
      
      // Check that all StreamCreated events were emitted
      const events = receipt?.logs.filter((log: any) => {
        try {
          const parsed = streamFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed && parsed.name === 'StreamCreated';
        } catch {
          return false;
        }
      });

      expect(events).to.have.length(count);

      // Verify streams were created
      const nextStreamId = await streamFactory.nextStreamId();
      expect(nextStreamId).to.equal(count);
    });
  });

  describe('Balance Calculation', () => {
    it('should calculate balance correctly over time', async () => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now - 100; // Started 100 seconds ago
      const stopTime = now + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      // Balance should be > 0 since time has elapsed
      const balance = await streamFactory.balanceOf(0);
      expect(balance).to.be.gt(0);
    });

    it('should return 0 balance before start time', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 3600; // Future
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      const balance = await streamFactory.balanceOf(0);
      expect(balance).to.equal(0);
    });
  });

  describe('Withdrawals', () => {
    it('should allow recipient to withdraw available balance', async () => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now - 100; // Started 100 seconds ago
      const stopTime = now + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      const balance = await streamFactory.balanceOf(0);
      expect(balance).to.be.gt(0);

      const initialBalance = await ethers.provider.getBalance(recipient.address);

      await streamFactory.connect(recipient).withdrawFromStream(0, balance);

      const finalBalance = await ethers.provider.getBalance(recipient.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it('should reject withdrawal from non-recipient', async () => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now - 100;
      const stopTime = now + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      const balance = await streamFactory.balanceOf(0);

      await expect(
        streamFactory.connect(user).withdrawFromStream(0, balance)
      ).to.be.revertedWithCustomError(streamFactory, 'Unauthorized');
    });
  });

  describe('Stream Cancellation', () => {
    it('should allow sender to cancel stream', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      await expect(streamFactory.cancelStream(0))
        .to.emit(streamFactory, 'StreamCancelled');

      const stream = await streamFactory.getStream(0);
      expect(stream.isActive).to.be.false;
    });

    it('should allow recipient to cancel stream', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      await streamFactory.connect(recipient).cancelStream(0);

      const stream = await streamFactory.getStream(0);
      expect(stream.isActive).to.be.false;
    });
  });

  describe('SLA Breach Reporting', () => {
    it('should allow authorized oracle to report breach', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 1000, // 10% refund
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      // Owner is authorized by default
      await expect(
        streamFactory.reportSLABreach(0, 'latency', 1500)
      )
        .to.emit(streamFactory, 'SLABreached')
        .to.emit(streamFactory, 'RefundTriggered');

      const stream = await streamFactory.getStream(0);
      expect(stream.breachCount).to.equal(1);
      expect(stream.totalRefunded).to.be.gt(0);
    });

    it('should reject breach report from unauthorized address', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 500,
        autoStopOnSevereBreach: false,
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      await expect(
        streamFactory.connect(user).reportSLABreach(0, 'latency', 1500)
      ).to.be.revertedWithCustomError(streamFactory, 'OracleNotAuthorized');
    });

    it('should auto-stop stream on severe breaches', async () => {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const stopTime = startTime + 3600;
      const amount = ethers.parseEther('1.0');

      const slaConfig = {
        maxLatencyMs: 500,
        minUptimePercent: 9900,
        maxErrorRate: 100,
        maxJitterMs: 100,
        refundPercentOnBreach: 1000,
        autoStopOnSevereBreach: true, // Auto-stop enabled
      };

      await streamFactory.createStream(
        recipient.address,
        ethers.ZeroAddress,
        startTime,
        stopTime,
        slaConfig,
        { value: amount }
      );

      // Report 3 breaches to trigger auto-stop
      await streamFactory.reportSLABreach(0, 'latency', 1500);
      await streamFactory.reportSLABreach(0, 'uptime', 8000);
      await streamFactory.reportSLABreach(0, 'error_rate', 500);

      const stream = await streamFactory.getStream(0);
      expect(stream.isActive).to.be.false;
      expect(stream.breachCount).to.equal(3);
    });
  });
});
