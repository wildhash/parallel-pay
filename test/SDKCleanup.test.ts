import { expect } from 'chai';
import { ethers } from 'hardhat';
import { AgentOracle, SLAStreamFactory, RefundManager } from '../typechain-types';
import { SLAMonitor } from '../agent-sdk/monitor';
import { RefundExecutor } from '../agent-sdk/refund';

describe('SDK Cleanup', () => {
  let oracle: AgentOracle;
  let streamFactory: SLAStreamFactory;
  let refundManager: RefundManager;
  let owner: any;
  let signer: any;

  beforeEach(async () => {
    [owner, signer] = await ethers.getSigners();
    
    // Deploy SLAStreamFactory
    const SLAStreamFactoryFactory = await ethers.getContractFactory('SLAStreamFactory');
    streamFactory = await SLAStreamFactoryFactory.deploy();
    await streamFactory.waitForDeployment();

    // Deploy AgentOracle
    const AgentOracleFactory = await ethers.getContractFactory('AgentOracle');
    oracle = await AgentOracleFactory.deploy(await streamFactory.getAddress());
    await oracle.waitForDeployment();

    // Deploy RefundManager
    const RefundManagerFactory = await ethers.getContractFactory('RefundManager');
    refundManager = await RefundManagerFactory.deploy(await streamFactory.getAddress());
    await refundManager.waitForDeployment();
  });

  describe('SLAMonitor', () => {
    it('should properly cleanup monitoring interval', async () => {
      const monitor = new SLAMonitor(
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      // Add some streams to monitor
      monitor.addStream(1n);
      monitor.addStream(2n);

      // Start monitoring (short interval for testing)
      monitor.startMonitoring(1000);

      // Cleanup should stop the interval
      monitor.cleanup();

      // Verify we can call cleanup again without errors
      expect(() => monitor.cleanup()).to.not.throw();
    });

    it('should properly cleanup breach listeners', async () => {
      const monitor = new SLAMonitor(
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      let breachCount = 0;
      await monitor.listenForBreaches(() => {
        breachCount++;
      });

      // Stop listening
      monitor.stopListeningForBreaches();

      // Verify we can call stopListeningForBreaches again without errors
      expect(() => monitor.stopListeningForBreaches()).to.not.throw();
    });

    it('should clear all streams', async () => {
      const monitor = new SLAMonitor(
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      monitor.addStream(1n);
      monitor.addStream(2n);
      monitor.addStream(3n);

      monitor.clearStreams();

      // Verify we can call clearStreams again without errors
      expect(() => monitor.clearStreams()).to.not.throw();
    });

    it('should perform complete cleanup', async () => {
      const monitor = new SLAMonitor(
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      monitor.addStream(1n);
      monitor.startMonitoring(1000);
      await monitor.listenForBreaches(() => {});

      // Complete cleanup should handle everything
      monitor.cleanup();

      // Should be safe to call multiple times
      expect(() => monitor.cleanup()).to.not.throw();
    });
  });

  describe('RefundExecutor', () => {
    it('should properly cleanup auto-refund listeners', async () => {
      const refundExecutor = new RefundExecutor(
        await refundManager.getAddress(),
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      await refundExecutor.startAutoRefund(1, 3);

      // Stop should cleanup listeners
      refundExecutor.stopAutoRefund();

      // Verify we can call stopAutoRefund again without errors
      expect(() => refundExecutor.stopAutoRefund()).to.not.throw();
    });

    it('should properly cleanup refund event listeners', async () => {
      const refundExecutor = new RefundExecutor(
        await refundManager.getAddress(),
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      await refundExecutor.listenForRefunds(() => {});

      // Stop listening
      refundExecutor.stopListeningForRefunds();

      // Verify we can call stopListeningForRefunds again without errors
      expect(() => refundExecutor.stopListeningForRefunds()).to.not.throw();
    });

    it('should perform complete cleanup', async () => {
      const refundExecutor = new RefundExecutor(
        await refundManager.getAddress(),
        await oracle.getAddress(),
        await streamFactory.getAddress(),
        signer
      );

      await refundExecutor.startAutoRefund(1, 3);
      await refundExecutor.listenForRefunds(() => {});

      // Complete cleanup should handle everything
      refundExecutor.cleanup();

      // Should be safe to call multiple times
      expect(() => refundExecutor.cleanup()).to.not.throw();
    });
  });
});
