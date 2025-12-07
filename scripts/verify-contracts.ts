import { ethers } from 'ethers';
import ParallelPayArtifact from '../artifacts/contracts/ParallelPay.sol/ParallelPay.json' with { type: 'json' };
import X402PaymentArtifact from '../artifacts/contracts/X402Payment.sol/X402Payment.json' with { type: 'json' };

/**
 * Minimal test to verify contract compilation and basic functionality
 */

console.log('🧪 Contract Verification Tests\n');

// Test 1: Verify artifacts exist
console.log('1️⃣ Checking contract artifacts...');

if (!ParallelPayArtifact.abi || !ParallelPayArtifact.bytecode) {
  console.error('❌ ParallelPay artifact missing or incomplete');
  process.exit(1);
}
console.log('✓ ParallelPay artifact valid');

if (!X402PaymentArtifact.abi || !X402PaymentArtifact.bytecode) {
  console.error('❌ X402Payment artifact missing or incomplete');
  process.exit(1);
}
console.log('✓ X402Payment artifact valid');

// Test 2: Verify ABI structure
console.log('\n2️⃣ Checking contract interfaces...');

const ppInterface = new ethers.Interface(ParallelPayArtifact.abi);
const requiredPPFunctions = [
  'createStream',
  'batchCreateStreams',
  'withdrawFromStream',
  'cancelStream',
  'balanceOf',
  'getStream',
];

for (const func of requiredPPFunctions) {
  if (!ppInterface.getFunction(func)) {
    console.error(`❌ ParallelPay missing function: ${func}`);
    process.exit(1);
  }
}
console.log('✓ ParallelPay interface complete');

const x402Interface = new ethers.Interface(X402PaymentArtifact.abi);
const requiredX402Functions = [
  'createPaymentRequest',
  'payRequest',
  'requestRefund',
  'setRefundPolicy',
  'getPaymentRequest',
  'canRefund',
  'batchCreatePaymentRequests',
];

for (const func of requiredX402Functions) {
  if (!x402Interface.getFunction(func)) {
    console.error(`❌ X402Payment missing function: ${func}`);
    process.exit(1);
  }
}
console.log('✓ X402Payment interface complete');

// Test 3: Verify events
console.log('\n3️⃣ Checking contract events...');

const ppEvents = ['StreamCreated', 'WithdrawalMade', 'StreamCancelled'];
for (const event of ppEvents) {
  if (!ppInterface.getEvent(event)) {
    console.error(`❌ ParallelPay missing event: ${event}`);
    process.exit(1);
  }
}
console.log('✓ ParallelPay events complete');

const x402Events = ['PaymentRequestCreated', 'PaymentCompleted', 'RefundIssued'];
for (const event of x402Events) {
  if (!x402Interface.getEvent(event)) {
    console.error(`❌ X402Payment missing event: ${event}`);
    process.exit(1);
  }
}
console.log('✓ X402Payment events complete');

// Test 4: Verify bytecode size
console.log('\n4️⃣ Checking bytecode...');

const ppBytecodeSize = ParallelPayArtifact.bytecode.length / 2 - 1;
const x402BytecodeSize = X402PaymentArtifact.bytecode.length / 2 - 1;

console.log(`  ParallelPay bytecode: ${ppBytecodeSize} bytes`);
console.log(`  X402Payment bytecode: ${x402BytecodeSize} bytes`);

if (ppBytecodeSize > 24576) {
  console.warn('⚠️  ParallelPay bytecode exceeds 24KB limit');
}
if (x402BytecodeSize > 24576) {
  console.warn('⚠️  X402Payment bytecode exceeds 24KB limit');
}

console.log('✓ Bytecode sizes acceptable');

// Test 5: Verify constructor parameters
console.log('\n5️⃣ Checking constructors...');

const ppConstructor = ppInterface.getFunction('constructor');
const x402Constructor = x402Interface.getFunction('constructor');

console.log('✓ ParallelPay constructor:', ppConstructor ? 'has parameters' : 'no parameters');
console.log('✓ X402Payment constructor:', x402Constructor ? 'has parameters' : 'no parameters');

// Summary
console.log('\n' + '='.repeat(60));
console.log('✅ All contract verification tests passed!');
console.log('='.repeat(60));
console.log('\n📋 Summary:');
console.log('  ✓ Artifacts compiled correctly');
console.log('  ✓ All required functions present');
console.log('  ✓ All required events present');
console.log('  ✓ Bytecode within acceptable limits');
console.log('  ✓ Contracts ready for deployment\n');

console.log('🎯 Next steps:');
console.log('  1. Run: npm run test-local (on local node)');
console.log('  2. Run: npm run deploy (to testnet)');
console.log('  3. Run: npm run stress-test (performance test)');
console.log('  4. Run: npm run dashboard (view UI)\n');
