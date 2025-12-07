import { ethers } from 'ethers';
import {
  deployParallelPay,
  deployX402Payment,
  ParallelPaySDK,
  X402PaymentSDK,
} from '../sdk/index.js';

async function testContracts() {
  console.log('🧪 Testing ParallelPay Contracts\n');

  // Use hardhat's default test account
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const deployer = new ethers.Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider
  );

  console.log('Deployer:', deployer.address);

  // Deploy contracts
  console.log('\n1️⃣ Deploying ParallelPay...');
  const { address: ppAddress } = await deployParallelPay(deployer);
  console.log(`✓ ParallelPay deployed at: ${ppAddress}`);

  console.log('\n2️⃣ Deploying X402Payment...');
  const { address: x402Address } = await deployX402Payment(deployer);
  console.log(`✓ X402Payment deployed at: ${x402Address}`);

  // Test ParallelPay
  console.log('\n3️⃣ Testing ParallelPay stream creation...');
  const ppSDK = new ParallelPaySDK(ppAddress, deployer);

  const recipient = ethers.Wallet.createRandom().address;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 60;
  const stopTime = now + 3660;
  const amount = ethers.parseEther('0.1');

  const { streamId } = await ppSDK.createStream(
    recipient,
    startTime,
    stopTime,
    amount
  );
  console.log(`✓ Created stream #${streamId}`);

  const stream = await ppSDK.getStream(streamId);
  console.log(`  - Recipient: ${stream.recipient}`);
  console.log(`  - Deposit: ${ethers.formatEther(stream.deposit)} ETH`);
  console.log(`  - Active: ${stream.isActive}`);

  // Test batch creation
  console.log('\n4️⃣ Testing batch stream creation...');
  const recipients = Array(5)
    .fill(0)
    .map(() => ethers.Wallet.createRandom().address);
  const { streamIds } = await ppSDK.batchCreateStreams(
    recipients,
    Array(5).fill(startTime),
    Array(5).fill(stopTime),
    Array(5).fill(ethers.parseEther('0.01'))
  );
  console.log(`✓ Created ${streamIds.length} streams in batch`);

  // Test X402Payment
  console.log('\n5️⃣ Testing X402 payment request...');
  const x402SDK = new X402PaymentSDK(x402Address, deployer);

  const { requestId } = await x402SDK.createPaymentRequest(
    deployer.address,
    ethers.parseEther('0.001'),
    now + 3600,
    ethers.id('test-content'),
    JSON.stringify({ api: 'test-service', type: 'data' })
  );
  console.log(`✓ Created payment request #${requestId}`);

  const request = await x402SDK.getPaymentRequest(requestId);
  console.log(`  - Payer: ${request.payer}`);
  console.log(`  - Amount: ${ethers.formatEther(request.amount)} ETH`);
  console.log(`  - Paid: ${request.isPaid}`);

  console.log('\n✅ All tests passed!\n');
}

testContracts().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
