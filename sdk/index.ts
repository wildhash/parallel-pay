import { ethers } from 'ethers';
import ParallelPayArtifact from '../artifacts/contracts/ParallelPay.sol/ParallelPay.json' with { type: 'json' };
import X402PaymentArtifact from '../artifacts/contracts/X402Payment.sol/X402Payment.json' with { type: 'json' };
import SLAStreamFactoryArtifact from '../artifacts/contracts/SLAStreamFactory.sol/SLAStreamFactory.json' with { type: 'json' };
import RefundManagerArtifact from '../artifacts/contracts/RefundManager.sol/RefundManager.json' with { type: 'json' };
import AgentOracleArtifact from '../artifacts/contracts/AgentOracle.sol/AgentOracle.json' with { type: 'json' };

export interface StreamData {
  sender: string;
  recipient: string;
  deposit: bigint;
  startTime: bigint;
  stopTime: bigint;
  ratePerSecond: bigint;
  remainingBalance: bigint;
  isActive: boolean;
}

export interface PaymentRequestData {
  requester: string;
  payer: string;
  amount: bigint;
  deadline: bigint;
  contentHash: string;
  isPaid: boolean;
  isRefunded: boolean;
  metadata: string;
}

/**
 * ParallelPay SDK for interacting with the streaming payment protocol
 */
export class ParallelPaySDK {
  private contract: ethers.Contract;
  private signer: ethers.Signer;

  constructor(
    contractAddress: string,
    signerOrProvider: ethers.Signer | ethers.Provider
  ) {
    this.contract = new ethers.Contract(
      contractAddress,
      ParallelPayArtifact.abi,
      signerOrProvider
    );

    if ('sendTransaction' in signerOrProvider) {
      this.signer = signerOrProvider as ethers.Signer;
    } else {
      throw new Error('A signer is required for write operations');
    }
  }

  /**
   * Create a new payment stream
   */
  async createStream(
    recipient: string,
    startTime: number,
    stopTime: number,
    amount: bigint
  ): Promise<{ streamId: bigint; tx: ethers.ContractTransactionResponse }> {
    const tx = await this.contract.createStream(recipient, startTime, stopTime, {
      value: amount,
    });
    const receipt = await tx.wait();

    // Find the StreamCreated event
    const event = receipt?.logs
      .map((log: any) => {
        try {
          return this.contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e && e.name === 'StreamCreated');

    const streamId = event?.args?.streamId || 0n;
    return { streamId, tx };
  }

  /**
   * Batch create multiple streams in parallel
   */
  async batchCreateStreams(
    recipients: string[],
    startTimes: number[],
    stopTimes: number[],
    amounts: bigint[]
  ): Promise<{ streamIds: bigint[]; tx: ethers.ContractTransactionResponse }> {
    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);

    const tx = await this.contract.batchCreateStreams(
      recipients,
      startTimes,
      stopTimes,
      amounts,
      { value: totalAmount }
    );
    const receipt = await tx.wait();

    // Extract all stream IDs from events
    const streamIds: bigint[] = [];
    receipt?.logs.forEach((log: any) => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === 'StreamCreated') {
          streamIds.push(parsed.args.streamId);
        }
      } catch {}
    });

    return { streamIds, tx };
  }

  /**
   * Get stream details
   */
  async getStream(streamId: bigint): Promise<StreamData> {
    const stream = await this.contract.getStream(streamId);
    return {
      sender: stream.sender,
      recipient: stream.recipient,
      deposit: stream.deposit,
      startTime: stream.startTime,
      stopTime: stream.stopTime,
      ratePerSecond: stream.ratePerSecond,
      remainingBalance: stream.remainingBalance,
      isActive: stream.isActive,
    };
  }

  /**
   * Get available balance for withdrawal
   */
  async balanceOf(streamId: bigint): Promise<bigint> {
    return await this.contract.balanceOf(streamId);
  }

  /**
   * Withdraw from a stream
   */
  async withdrawFromStream(
    streamId: bigint,
    amount: bigint
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.withdrawFromStream(streamId, amount);
  }

  /**
   * Cancel a stream
   */
  async cancelStream(streamId: bigint): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.cancelStream(streamId);
  }

  /**
   * Get the next stream ID
   */
  async getNextStreamId(): Promise<bigint> {
    return await this.contract.nextStreamId();
  }
}

/**
 * X402Payment SDK for agent-to-agent payments with refunds
 */
export class X402PaymentSDK {
  private contract: ethers.Contract;
  private signer: ethers.Signer;

  constructor(
    contractAddress: string,
    signerOrProvider: ethers.Signer | ethers.Provider
  ) {
    this.contract = new ethers.Contract(
      contractAddress,
      X402PaymentArtifact.abi,
      signerOrProvider
    );

    if ('sendTransaction' in signerOrProvider) {
      this.signer = signerOrProvider as ethers.Signer;
    } else {
      throw new Error('A signer is required for write operations');
    }
  }

  /**
   * Create a payment request
   */
  async createPaymentRequest(
    payer: string,
    amount: bigint,
    deadline: number,
    contentHash: string,
    metadata: string
  ): Promise<{ requestId: bigint; tx: ethers.ContractTransactionResponse }> {
    const tx = await this.contract.createPaymentRequest(
      payer,
      amount,
      deadline,
      contentHash,
      metadata
    );
    const receipt = await tx.wait();

    const event = receipt?.logs
      .map((log: any) => {
        try {
          return this.contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e && e.name === 'PaymentRequestCreated');

    const requestId = event?.args?.requestId || 0n;
    return { requestId, tx };
  }

  /**
   * Pay for a payment request
   */
  async payRequest(
    requestId: bigint,
    amount: bigint
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.payRequest(requestId, { value: amount });
  }

  /**
   * Request a refund
   */
  async requestRefund(requestId: bigint): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.requestRefund(requestId);
  }

  /**
   * Set refund policy
   */
  async setRefundPolicy(
    refundWindow: number,
    penaltyPercent: number,
    autoRefundEnabled: boolean
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.setRefundPolicy(
      refundWindow,
      penaltyPercent,
      autoRefundEnabled
    );
  }

  /**
   * Get payment request details
   */
  async getPaymentRequest(requestId: bigint): Promise<PaymentRequestData> {
    const request = await this.contract.getPaymentRequest(requestId);
    return {
      requester: request.requester,
      payer: request.payer,
      amount: request.amount,
      deadline: request.deadline,
      contentHash: request.contentHash,
      isPaid: request.isPaid,
      isRefunded: request.isRefunded,
      metadata: request.metadata,
    };
  }

  /**
   * Check if refund is available
   */
  async canRefund(requestId: bigint): Promise<boolean> {
    return await this.contract.canRefund(requestId);
  }

  /**
   * Batch create payment requests
   */
  async batchCreatePaymentRequests(
    payers: string[],
    amounts: bigint[],
    deadlines: number[],
    contentHashes: string[],
    metadataList: string[]
  ): Promise<{ requestIds: bigint[]; tx: ethers.ContractTransactionResponse }> {
    const tx = await this.contract.batchCreatePaymentRequests(
      payers,
      amounts,
      deadlines,
      contentHashes,
      metadataList
    );
    const receipt = await tx.wait();

    const requestIds: bigint[] = [];
    receipt?.logs.forEach((log: any) => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === 'PaymentRequestCreated') {
          requestIds.push(parsed.args.requestId);
        }
      } catch {}
    });

    return { requestIds, tx };
  }
}

/**
 * Deploy ParallelPay contract
 */
export async function deployParallelPay(
  signer: ethers.Signer
): Promise<{ address: string; contract: ethers.Contract }> {
  const factory = new ethers.ContractFactory(
    ParallelPayArtifact.abi,
    ParallelPayArtifact.bytecode,
    signer
  );
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  return { address, contract };
}

/**
 * Deploy X402Payment contract
 */
export async function deployX402Payment(
  signer: ethers.Signer
): Promise<{ address: string; contract: ethers.Contract }> {
  const factory = new ethers.ContractFactory(
    X402PaymentArtifact.abi,
    X402PaymentArtifact.bytecode,
    signer
  );
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  return { address, contract };
}

/**
 * Deploy SLAStreamFactory contract
 */
export async function deploySLAStreamFactory(
  signer: ethers.Signer
): Promise<{ address: string; contract: ethers.Contract }> {
  const factory = new ethers.ContractFactory(
    SLAStreamFactoryArtifact.abi,
    SLAStreamFactoryArtifact.bytecode,
    signer
  );
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  return { address, contract };
}

/**
 * Deploy AgentOracle contract
 */
export async function deployAgentOracle(
  signer: ethers.Signer,
  streamFactoryAddress: string
): Promise<{ address: string; contract: ethers.Contract }> {
  const factory = new ethers.ContractFactory(
    AgentOracleArtifact.abi,
    AgentOracleArtifact.bytecode,
    signer
  );
  const contract = await factory.deploy(streamFactoryAddress);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  return { address, contract };
}

/**
 * Deploy RefundManager contract
 */
export async function deployRefundManager(
  signer: ethers.Signer,
  streamFactoryAddress: string
): Promise<{ address: string; contract: ethers.Contract }> {
  const factory = new ethers.ContractFactory(
    RefundManagerArtifact.abi,
    RefundManagerArtifact.bytecode,
    signer
  );
  const contract = await factory.deploy(streamFactoryAddress);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  return { address, contract };
}
