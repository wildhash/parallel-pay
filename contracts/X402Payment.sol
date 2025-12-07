// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title X402Payment
 * @notice Agent-to-agent payment protocol with refund layer (HTTP 402 Payment Required inspired)
 * @dev Integrates with ParallelPay for streaming agent payments with automatic refund mechanism
 */
contract X402Payment {
    /// @notice Payment request structure
    struct PaymentRequest {
        address requester;
        address payer;
        uint256 amount;
        uint256 deadline;
        bytes32 contentHash;
        bool isPaid;
        bool isRefunded;
        string metadata; // API endpoint, content type, etc.
    }

    /// @notice Mapping from payment request ID to PaymentRequest
    mapping(uint256 => PaymentRequest) public paymentRequests;

    /// @notice Current payment request ID counter
    uint256 public nextRequestId;

    /// @notice Refund policy configuration
    struct RefundPolicy {
        uint256 refundWindow; // Time window for refunds
        uint256 penaltyPercent; // Penalty percentage (0-100)
        bool autoRefundEnabled;
    }

    /// @notice Mapping from requester to their refund policy
    mapping(address => RefundPolicy) public refundPolicies;

    /// @notice Events
    event PaymentRequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        address indexed payer,
        uint256 amount,
        uint256 deadline,
        bytes32 contentHash
    );

    event PaymentCompleted(
        uint256 indexed requestId,
        address indexed payer,
        uint256 amount
    );

    event RefundIssued(
        uint256 indexed requestId,
        address indexed payer,
        uint256 amount,
        uint256 penalty
    );

    event RefundPolicyUpdated(
        address indexed requester,
        uint256 refundWindow,
        uint256 penaltyPercent,
        bool autoRefundEnabled
    );

    /// @notice Errors
    error InvalidAmount();
    error InvalidDeadline();
    error Unauthorized();
    error PaymentAlreadyPaid();
    error PaymentNotPaid();
    error RefundNotAvailable();
    error DeadlinePassed();
    error InvalidPolicy();
    error TransferFailed();

    /**
     * @notice Create a payment request (402 Payment Required)
     * @param payer The address that should pay
     * @param amount The payment amount required
     * @param deadline Payment deadline timestamp
     * @param contentHash Hash of the content/service being provided
     * @param metadata Additional metadata (JSON string)
     * @return requestId The ID of the payment request
     */
    function createPaymentRequest(
        address payer,
        uint256 amount,
        uint256 deadline,
        bytes32 contentHash,
        string calldata metadata
    ) external returns (uint256 requestId) {
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (payer == address(0)) revert Unauthorized();

        requestId = nextRequestId++;

        paymentRequests[requestId] = PaymentRequest({
            requester: msg.sender,
            payer: payer,
            amount: amount,
            deadline: deadline,
            contentHash: contentHash,
            isPaid: false,
            isRefunded: false,
            metadata: metadata
        });

        emit PaymentRequestCreated(
            requestId,
            msg.sender,
            payer,
            amount,
            deadline,
            contentHash
        );
    }

    /**
     * @notice Pay for a payment request
     * @param requestId The ID of the payment request
     */
    function payRequest(uint256 requestId) external payable {
        PaymentRequest storage request = paymentRequests[requestId];

        if (msg.sender != request.payer) revert Unauthorized();
        if (request.isPaid) revert PaymentAlreadyPaid();
        if (block.timestamp > request.deadline) revert DeadlinePassed();
        if (msg.value != request.amount) revert InvalidAmount();

        request.isPaid = true;

        emit PaymentCompleted(requestId, msg.sender, msg.value);

        // Transfer to requester
        (bool success, ) = request.requester.call{value: msg.value}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Request a refund for a paid request
     * @param requestId The ID of the payment request
     */
    function requestRefund(uint256 requestId) external {
        PaymentRequest storage request = paymentRequests[requestId];

        if (msg.sender != request.payer) revert Unauthorized();
        if (!request.isPaid) revert PaymentNotPaid();
        if (request.isRefunded) revert RefundNotAvailable();

        RefundPolicy memory policy = refundPolicies[request.requester];

        // Check if refund is available within the window
        if (policy.refundWindow == 0) revert RefundNotAvailable();
        if (block.timestamp > request.deadline + policy.refundWindow) {
            revert RefundNotAvailable();
        }

        request.isRefunded = true;

        // Calculate refund amount with penalty
        uint256 penalty = (request.amount * policy.penaltyPercent) / 100;
        uint256 refundAmount = request.amount - penalty;

        emit RefundIssued(requestId, request.payer, refundAmount, penalty);

        // Send refund to payer
        if (refundAmount > 0) {
            (bool success, ) = request.payer.call{value: refundAmount}("");
            if (!success) revert TransferFailed();
        }

        // Keep penalty as requester compensation
        if (penalty > 0) {
            (bool success, ) = request.requester.call{value: penalty}("");
            if (!success) revert TransferFailed();
        }
    }

    /**
     * @notice Set refund policy for the caller
     * @param refundWindow Time window in seconds for allowing refunds
     * @param penaltyPercent Penalty percentage (0-100)
     * @param autoRefundEnabled Whether automatic refunds are enabled
     */
    function setRefundPolicy(
        uint256 refundWindow,
        uint256 penaltyPercent,
        bool autoRefundEnabled
    ) external {
        if (penaltyPercent > 100) revert InvalidPolicy();

        refundPolicies[msg.sender] = RefundPolicy({
            refundWindow: refundWindow,
            penaltyPercent: penaltyPercent,
            autoRefundEnabled: autoRefundEnabled
        });

        emit RefundPolicyUpdated(
            msg.sender,
            refundWindow,
            penaltyPercent,
            autoRefundEnabled
        );
    }

    /**
     * @notice Get payment request details
     * @param requestId The ID of the payment request
     * @return PaymentRequest details
     */
    function getPaymentRequest(uint256 requestId)
        external
        view
        returns (PaymentRequest memory)
    {
        return paymentRequests[requestId];
    }

    /**
     * @notice Batch create multiple payment requests for parallel execution
     * @param payers Array of payer addresses
     * @param amounts Array of payment amounts
     * @param deadlines Array of payment deadlines
     * @param contentHashes Array of content hashes
     * @param metadataList Array of metadata strings
     * @return requestIds Array of created request IDs
     */
    function batchCreatePaymentRequests(
        address[] calldata payers,
        uint256[] calldata amounts,
        uint256[] calldata deadlines,
        bytes32[] calldata contentHashes,
        string[] calldata metadataList
    ) external returns (uint256[] memory requestIds) {
        uint256 length = payers.length;
        if (
            length != amounts.length ||
            length != deadlines.length ||
            length != contentHashes.length ||
            length != metadataList.length
        ) revert InvalidAmount();

        requestIds = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            if (amounts[i] == 0) revert InvalidAmount();
            if (deadlines[i] <= block.timestamp) revert InvalidDeadline();
            if (payers[i] == address(0)) revert Unauthorized();

            uint256 requestId = nextRequestId++;
            requestIds[i] = requestId;

            paymentRequests[requestId] = PaymentRequest({
                requester: msg.sender,
                payer: payers[i],
                amount: amounts[i],
                deadline: deadlines[i],
                contentHash: contentHashes[i],
                isPaid: false,
                isRefunded: false,
                metadata: metadataList[i]
            });

            emit PaymentRequestCreated(
                requestId,
                msg.sender,
                payers[i],
                amounts[i],
                deadlines[i],
                contentHashes[i]
            );
        }
    }

    /**
     * @notice Check if a payment can be refunded
     * @param requestId The ID of the payment request
     * @return bool indicating if refund is available
     */
    function canRefund(uint256 requestId) external view returns (bool) {
        PaymentRequest memory request = paymentRequests[requestId];

        if (!request.isPaid || request.isRefunded) return false;

        RefundPolicy memory policy = refundPolicies[request.requester];
        if (policy.refundWindow == 0) return false;
        if (block.timestamp > request.deadline + policy.refundWindow) {
            return false;
        }

        return true;
    }

    /// @notice Fallback to receive ETH
    receive() external payable {}
}
