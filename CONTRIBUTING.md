# Contributing to ParallelPay

Thank you for your interest in contributing to ParallelPay! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, constructive, and collaborative. We're building something great together!

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported
2. Use the GitHub issue tracker
3. Provide detailed information:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details (Node version, OS, etc.)
   - Contract addresses (if applicable)

### Suggesting Features

1. Open a GitHub issue with the "enhancement" label
2. Clearly describe the feature and its benefits
3. Provide use cases
4. Consider implementation approaches

### Pull Requests

1. **Fork the repository**
2. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**:
   - Follow existing code style
   - Add tests if applicable
   - Update documentation
   - Keep commits focused and atomic
4. **Test your changes**:
   ```bash
   npm test
   npm run compile
   ```
5. **Commit with clear messages**:
   ```bash
   git commit -m "Add feature: description"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/monad-parallelstream.git
cd monad-parallelstream

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Compile contracts
npm run compile

# Run tests
npm test
```

## Code Style

### Solidity

- Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use clear, descriptive variable names
- Add NatSpec comments for public functions
- Use custom errors instead of require strings
- Optimize for gas efficiency

Example:
```solidity
/// @notice Create a new payment stream
/// @param recipient The address receiving the stream
/// @param startTime When the stream starts
/// @param stopTime When the stream stops
/// @return streamId The ID of the created stream
function createStream(
    address recipient,
    uint256 startTime,
    uint256 stopTime
) external payable returns (uint256 streamId) {
    if (startTime >= stopTime) revert InvalidTimeRange();
    // ...
}
```

### TypeScript

- Use TypeScript for type safety
- Follow consistent formatting (2 spaces, semicolons)
- Use async/await over promises
- Add JSDoc comments for public APIs

Example:
```typescript
/**
 * Create a new payment stream
 */
async createStream(
  recipient: string,
  startTime: number,
  stopTime: number,
  amount: bigint
): Promise<{ streamId: bigint; tx: ethers.ContractTransactionResponse }> {
  // ...
}
```

## Testing

### Contract Tests

Write comprehensive tests for contract functions:

```typescript
describe('ParallelPay', () => {
  it('should create a stream', async () => {
    // Test implementation
  });

  it('should allow withdrawals', async () => {
    // Test implementation
  });
});
```

### Integration Tests

Test end-to-end workflows:

```typescript
describe('Stream lifecycle', () => {
  it('should complete full payment flow', async () => {
    // Create stream
    // Wait for time to pass
    // Withdraw funds
    // Verify balances
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for design changes
- Add examples to EXAMPLES.md for new features
- Update DEPLOYMENT.md for deployment changes

## Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead:
1. Email security concerns to the maintainers
2. Include detailed information
3. Allow time for fixes before public disclosure

### Security Best Practices

- Follow checks-effects-interactions pattern
- Avoid reentrancy vulnerabilities
- Use SafeMath (or Solidity 0.8+)
- Validate all inputs
- Test edge cases thoroughly
- Consider gas optimization vs security tradeoffs

## Git Commit Messages

Format:
```
<type>: <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

Example:
```
feat: Add batch withdrawal function

Implement batchWithdraw to allow multiple withdrawals in a single
transaction, reducing gas costs for users with multiple streams.

Closes #123
```

## Review Process

1. **Automated checks** must pass (linting, tests, build)
2. **Code review** by at least one maintainer
3. **Testing** on testnet if applicable
4. **Documentation** review
5. **Approval** and merge

## Release Process

1. Version bump following [Semantic Versioning](https://semver.org/)
2. Update CHANGELOG.md
3. Tag release
4. Deploy to testnet
5. Verify deployment
6. Announce release

## Questions?

- Open a GitHub issue
- Check existing documentation
- Join community discussions

## License

By contributing, you agree that your contributions will be licensed under the ISC License.

---

Thank you for contributing to ParallelPay! 🚀
