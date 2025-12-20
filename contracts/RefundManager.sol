// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISLAStreamFactory {
    function getStream(uint256 streamId) external view returns (
        address sender,
        address recipient,
        address token,
        uint256 deposit,
        uint256 startTime,
        uint256 stopTime,
        uint256 ratePerSecond,
        uint256 remainingBalance,
        bool isActive
    );
    
    function reportSLABreach(
        uint256 streamId,
        string calldata breachType,
        uint256 breachValue
    ) external;
    
    function calculateTieredRefund(
        uint256 streamId,
        uint256 breachValue,
        string calldata breachType
    ) external view returns (uint256 refundAmount, uint8 tier);
}

/**
 * @title RefundManager
 * @notice Manages refund execution for SLA breaches
 * @dev Can be called by recipient, AI agent oracle, or stream owner
 */
contract RefundManager {
    /// @notice Reference to SLAStreamFactory
    address public streamFactory;

    /// @notice Authorized agents who can trigger refunds
    mapping(address => bool) public authorizedAgents;

    /// @notice Owner of the contract
    address public owner;

    /// @notice Refund execution record
    struct RefundExecution {
        uint256 streamId;
        uint256 amount;
        string reason;
        address executor;
        uint256 timestamp;
    }

    /// @notice Mapping from execution ID to RefundExecution
    mapping(uint256 => RefundExecution) public refundExecutions;
    uint256 public nextExecutionId;

    /// @notice Events
    event PartialRefundExecuted(
        uint256 indexed streamId,
        address indexed executor,
        uint256 amount,
        string reason
    );

    event TieredRefundExecuted(
        uint256 indexed streamId,
        uint8 tier,
        uint256 amount,
        string breachType,
        uint256 breachValue
    );

    event FullRefundExecuted(
        uint256 indexed streamId,
        address indexed executor,
        uint256 amount,
        string reason
    );

    event StreamCancelledByRefund(
        uint256 indexed streamId,
        address indexed executor,
        string reason
    );

    event AgentAuthorized(address indexed agent, bool authorized);

    /// @notice Errors
    error Unauthorized();
    error InvalidStreamFactory();
    error InvalidAmount();
    error ExecutionFailed();
    error ArrayLengthMismatch();

    /// @notice Modifier to check authorization
    modifier onlyAuthorized() {
        // Allow authorized agents or contract owner
        if (!authorizedAgents[msg.sender] && msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _streamFactory) {
        if (_streamFactory == address(0)) revert InvalidStreamFactory();
        streamFactory = _streamFactory;
        owner = msg.sender;
        
        // Authorize deployer as agent
        authorizedAgents[msg.sender] = true;
        emit AgentAuthorized(msg.sender, true);
    }

    /**
     * @notice Authorize or revoke agent access
     * @param agent Agent address
     * @param authorized Authorization status
     */
    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    /**
     * @notice Execute a partial refund for SLA breach
     * @param streamId The stream ID
     * @param breachType Type of breach
     * @param breachValue Measured value that breached
     */
    function executePartialRefund(
        uint256 streamId,
        string calldata breachType,
        uint256 breachValue
    ) external onlyAuthorized {
        // Call the stream factory to report breach and trigger refund
        ISLAStreamFactory(streamFactory).reportSLABreach(
            streamId,
            breachType,
            breachValue
        );

        uint256 executionId = nextExecutionId++;
        refundExecutions[executionId] = RefundExecution({
            streamId: streamId,
            amount: 0, // Amount is handled by factory
            reason: breachType,
            executor: msg.sender,
            timestamp: block.timestamp
        });

        emit PartialRefundExecuted(streamId, msg.sender, 0, breachType);
    }

    /**
     * @notice Execute a partial refund with tier information
     * @param streamId The stream ID
     * @param breachType Type of breach
     * @param breachValue Measured value that breached
     * @return tier The tier that was applied
     * @return refundAmount The refund amount that will be executed
     */
    function executePartialRefundWithTier(
        uint256 streamId,
        string calldata breachType,
        uint256 breachValue
    ) external onlyAuthorized returns (uint8 tier, uint256 refundAmount) {
        // Calculate tier before execution
        (refundAmount, tier) = ISLAStreamFactory(streamFactory).calculateTieredRefund(
            streamId,
            breachValue,
            breachType
        );
        
        // Call the stream factory to report breach and trigger refund
        ISLAStreamFactory(streamFactory).reportSLABreach(
            streamId,
            breachType,
            breachValue
        );

        uint256 executionId = nextExecutionId++;
        refundExecutions[executionId] = RefundExecution({
            streamId: streamId,
            amount: refundAmount,
            reason: breachType,
            executor: msg.sender,
            timestamp: block.timestamp
        });

        emit PartialRefundExecuted(streamId, msg.sender, refundAmount, breachType);
        emit TieredRefundExecuted(streamId, tier, refundAmount, breachType, breachValue);
    }

    /**
     * @notice Execute a full refund by reporting severe breach
     * @param streamId The stream ID
     * @param reason Reason for full refund
     */
    function executeFullRefund(
        uint256 streamId,
        string calldata reason
    ) external onlyAuthorized {
        // Report multiple breaches to trigger full refund
        ISLAStreamFactory(streamFactory).reportSLABreach(
            streamId,
            reason,
            type(uint256).max // Severe breach value
        );
        
        // Report again to trigger auto-stop if configured
        ISLAStreamFactory(streamFactory).reportSLABreach(
            streamId,
            reason,
            type(uint256).max
        );
        
        ISLAStreamFactory(streamFactory).reportSLABreach(
            streamId,
            reason,
            type(uint256).max
        );

        uint256 executionId = nextExecutionId++;
        refundExecutions[executionId] = RefundExecution({
            streamId: streamId,
            amount: 0,
            reason: reason,
            executor: msg.sender,
            timestamp: block.timestamp
        });

        emit FullRefundExecuted(streamId, msg.sender, 0, reason);
    }

    /**
     * @notice Cancel stream due to SLA breach
     * @param streamId The stream ID
     * @param reason Cancellation reason
     */
    function cancelStreamDueToSLA(
        uint256 streamId,
        string calldata reason
    ) external onlyAuthorized {
        // Report severe breaches to force cancellation
        for (uint i = 0; i < 5; i++) {
            ISLAStreamFactory(streamFactory).reportSLABreach(
                streamId,
                reason,
                type(uint256).max
            );
        }

        emit StreamCancelledByRefund(streamId, msg.sender, reason);
    }

    /**
     * @notice Batch execute partial refunds for multiple streams
     * @param streamIds Array of stream IDs
     * @param breachTypes Array of breach types
     * @param breachValues Array of breach values
     */
    function batchExecutePartialRefunds(
        uint256[] calldata streamIds,
        string[] calldata breachTypes,
        uint256[] calldata breachValues
    ) external onlyAuthorized {
        uint256 length = streamIds.length;
        if (
            length != breachTypes.length ||
            length != breachValues.length
        ) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < length; i++) {
            ISLAStreamFactory(streamFactory).reportSLABreach(
                streamIds[i],
                breachTypes[i],
                breachValues[i]
            );

            emit PartialRefundExecuted(streamIds[i], msg.sender, 0, breachTypes[i]);
        }
    }

    /**
     * @notice Get refund execution details
     * @param executionId The execution ID
     * @return RefundExecution details
     */
    function getRefundExecution(uint256 executionId)
        external
        view
        returns (RefundExecution memory)
    {
        return refundExecutions[executionId];
    }
}
