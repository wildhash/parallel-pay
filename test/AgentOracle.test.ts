import { expect } from 'chai';
import { ethers } from 'hardhat';
import { AgentOracle, SLAStreamFactory } from '../typechain-types';

describe('AgentOracle', () => {
  let oracle: AgentOracle;
  let streamFactory: SLAStreamFactory;
  let owner: any;
  let agent: any;
  let user: any;

  beforeEach(async () => {
    [owner, agent, user] = await ethers.getSigners();
    
    // Deploy SLAStreamFactory first
    const SLAStreamFactoryFactory = await ethers.getContractFactory('SLAStreamFactory');
    streamFactory = await SLAStreamFactoryFactory.deploy();
    await streamFactory.waitForDeployment();

    // Deploy AgentOracle
    const AgentOracleFactory = await ethers.getContractFactory('AgentOracle');
    oracle = await AgentOracleFactory.deploy(await streamFactory.getAddress());
    await oracle.waitForDeployment();
  });

  describe('Agent Authorization', () => {
    it('should authorize deployer as agent by default', async () => {
      const isAuthorized = await oracle.authorizedAgents(owner.address);
      expect(isAuthorized).to.be.true;
    });

    it('should allow owner to authorize new agents', async () => {
      await expect(oracle.setAgentAuthorization(agent.address, true))
        .to.emit(oracle, 'AgentAuthorized')
        .withArgs(agent.address, true);

      const isAuthorized = await oracle.authorizedAgents(agent.address);
      expect(isAuthorized).to.be.true;
    });

    it('should allow owner to revoke agent authorization', async () => {
      await oracle.setAgentAuthorization(agent.address, true);
      
      await expect(oracle.setAgentAuthorization(agent.address, false))
        .to.emit(oracle, 'AgentAuthorized')
        .withArgs(agent.address, false);

      const isAuthorized = await oracle.authorizedAgents(agent.address);
      expect(isAuthorized).to.be.false;
    });
  });

  describe('Metric Reporting', () => {
    it('should allow authorized agent to submit metrics', async () => {
      const streamId = 1;
      const latencyMs = 150;
      const uptimePercent = 9900;
      const errorRate = 50;
      const jitterMs = 30;

      await expect(
        oracle.submitMetricReport(streamId, latencyMs, uptimePercent, errorRate, jitterMs)
      )
        .to.emit(oracle, 'MetricReported');

      const report = await oracle.getMetricReport(0);
      expect(report.streamId).to.equal(streamId);
      expect(report.latencyMs).to.equal(latencyMs);
      expect(report.uptimePercent).to.equal(uptimePercent);
      expect(report.errorRate).to.equal(errorRate);
      expect(report.jitterMs).to.equal(jitterMs);
      expect(report.reporter).to.equal(owner.address);
    });

    it('should reject metrics from unauthorized agent', async () => {
      await expect(
        oracle.connect(user).submitMetricReport(1, 150, 9900, 50, 30)
      ).to.be.revertedWithCustomError(oracle, 'Unauthorized');
    });

    it('should reject invalid metrics (uptime > 10000)', async () => {
      await expect(
        oracle.submitMetricReport(1, 150, 15000, 50, 30)
      ).to.be.revertedWithCustomError(oracle, 'InvalidMetrics');
    });

    it('should reject invalid metrics (error rate > 10000)', async () => {
      await expect(
        oracle.submitMetricReport(1, 150, 9900, 15000, 30)
      ).to.be.revertedWithCustomError(oracle, 'InvalidMetrics');
    });
  });

  describe('Batch Metric Reporting', () => {
    it('should submit multiple metrics in batch', async () => {
      const count = 5;
      const streamIds = Array.from({ length: count }, (_, i) => i + 1);
      const latencies = Array(count).fill(150);
      const uptimes = Array(count).fill(9900);
      const errorRates = Array(count).fill(50);
      const jitters = Array(count).fill(30);

      const tx = await oracle.batchSubmitMetricReports(
        streamIds,
        latencies,
        uptimes,
        errorRates,
        jitters
      );

      const receipt = await tx.wait();
      
      // Check that all MetricReported events were emitted
      const events = receipt?.logs.filter((log: any) => {
        try {
          const parsed = oracle.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed && parsed.name === 'MetricReported';
        } catch {
          return false;
        }
      });

      expect(events).to.have.length(count);

      // Verify next report ID
      const nextReportId = await oracle.nextReportId();
      expect(nextReportId).to.equal(count);
    });

    it('should reject batch with mismatched array lengths', async () => {
      const streamIds = [1, 2, 3];
      const latencies = [150, 150]; // Wrong length
      const uptimes = [9900, 9900, 9900];
      const errorRates = [50, 50, 50];
      const jitters = [30, 30, 30];

      await expect(
        oracle.batchSubmitMetricReports(streamIds, latencies, uptimes, errorRates, jitters)
      ).to.be.reverted;
    });
  });

  describe('SLA Breach Detection', () => {
    it('should emit breach events for high latency', async () => {
      const streamId = 1;
      const latencyMs = 1500; // High latency
      const uptimePercent = 9900;
      const errorRate = 50;
      const jitterMs = 30;

      await expect(
        oracle.submitMetricReport(streamId, latencyMs, uptimePercent, errorRate, jitterMs)
      )
        .to.emit(oracle, 'SLABreached')
        .withArgs(streamId, 'latency', 1000, latencyMs, await ethers.provider.getBlock('latest').then(b => b ? b.timestamp + 1 : 0));
    });

    it('should emit breach events for low uptime', async () => {
      const streamId = 1;
      const latencyMs = 150;
      const uptimePercent = 9800; // Below 99%
      const errorRate = 50;
      const jitterMs = 30;

      await expect(
        oracle.submitMetricReport(streamId, latencyMs, uptimePercent, errorRate, jitterMs)
      )
        .to.emit(oracle, 'SLABreached')
        .withArgs(streamId, 'uptime', 9900, uptimePercent, await ethers.provider.getBlock('latest').then(b => b ? b.timestamp + 1 : 0));
    });

    it('should emit breach events for high error rate', async () => {
      const streamId = 1;
      const latencyMs = 150;
      const uptimePercent = 9900;
      const errorRate = 500; // High error rate (5%)
      const jitterMs = 30;

      await expect(
        oracle.submitMetricReport(streamId, latencyMs, uptimePercent, errorRate, jitterMs)
      )
        .to.emit(oracle, 'SLABreached')
        .withArgs(streamId, 'error_rate', 100, errorRate, await ethers.provider.getBlock('latest').then(b => b ? b.timestamp + 1 : 0));
    });

    it('should emit breach events for high jitter', async () => {
      const streamId = 1;
      const latencyMs = 150;
      const uptimePercent = 9900;
      const errorRate = 50;
      const jitterMs = 200; // High jitter

      await expect(
        oracle.submitMetricReport(streamId, latencyMs, uptimePercent, errorRate, jitterMs)
      )
        .to.emit(oracle, 'SLABreached')
        .withArgs(streamId, 'jitter', 100, jitterMs, await ethers.provider.getBlock('latest').then(b => b ? b.timestamp + 1 : 0));
    });
  });

  describe('Signed Metric Reporting', () => {
    it('should verify signature and accept signed metrics', async () => {
      // Authorize agent
      await oracle.setAgentAuthorization(agent.address, true);

      const streamId = 1;
      const latencyMs = 150;
      const uptimePercent = 9900;
      const errorRate = 50;
      const jitterMs = 30;
      const timestamp = Math.floor(Date.now() / 1000);

      // Create message hash
      const messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
        [streamId, latencyMs, uptimePercent, errorRate, jitterMs, timestamp]
      );

      // Sign with agent
      const signature = await agent.signMessage(ethers.getBytes(messageHash));

      // Submit signed metrics (as any address, signature is what matters)
      await expect(
        oracle.connect(user).submitSignedMetricReport(
          streamId,
          latencyMs,
          uptimePercent,
          errorRate,
          jitterMs,
          timestamp,
          signature
        )
      )
        .to.emit(oracle, 'MetricReported');

      const report = await oracle.getMetricReport(0);
      expect(report.reporter).to.equal(agent.address);
    });

    it('should reject invalid signature', async () => {
      const streamId = 1;
      const latencyMs = 150;
      const uptimePercent = 9900;
      const errorRate = 50;
      const jitterMs = 30;
      const timestamp = Math.floor(Date.now() / 1000);

      const messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
        [streamId, latencyMs, uptimePercent, errorRate, jitterMs, timestamp]
      );

      // Sign with unauthorized user
      const signature = await user.signMessage(ethers.getBytes(messageHash));

      await expect(
        oracle.submitSignedMetricReport(
          streamId,
          latencyMs,
          uptimePercent,
          errorRate,
          jitterMs,
          timestamp,
          signature
        )
      ).to.be.revertedWithCustomError(oracle, 'InvalidSignature');
    });
  });
});
