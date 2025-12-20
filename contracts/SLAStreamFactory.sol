// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SLAStreamFactory
 * @notice Creates SLA-enforced payment streams with automatic refund triggers
 * @dev Extends streaming functionality with SLA monitoring and conditional refunds
 */
contract SLAStreamFactory {
    /// @notice Graduated refund tiers configuration
    struct RefundTiers {
        uint16 tier1RefundPercent;  // Minor breach refund (basis points 0-10000)
        uint16 tier2RefundPercent;  // Moderate breach refund (basis points 0-10000)
        uint16 tier3RefundPercent;  // Severe breach refund (basis points 0-10000)
        uint16 tier1Threshold;      // Breach value threshold for tier 1
        uint16 tier2Threshold;      // Breach value threshold for tier 2
    }

    /// @notice SLA threshold configuration
    struct SLA {
        uint16 maxLatencyMs;          // Maximum acceptable latency in milliseconds
        uint16 minUptimePercent;      // Minimum uptime percentage (0-10000 for 0.00%-100.00%)
        uint16 maxErrorRate;          // Maximum error rate (0-10000 for 0.00%-100.00%)
        uint16 maxJitterMs;           // Maximum jitter in milliseconds
        uint16 refundPercentOnBreach; // Refund percentage on breach (0-10000) - for backward compatibility
        bool autoStopOnSevereBreach;  // Automatically stop stream on severe breach
    }

    /// @notice Stream with SLA enforcement
    struct SLAStream {
        address sender;
        address recipient;
        address token;               // address(0) for ETH
        uint256 deposit;
        uint256 startTime;
        uint256 stopTime;
        uint256 ratePerSecond;
        uint256 remainingBalance;
        bool isActive;
        SLA slaConfig;
        RefundTiers refundTiers;     // Graduated refund tiers (optional, zero values mean use legacy)
        uint256 breachCount;
        uint256 totalRefunded;
    }

    /// @notice Mapping from stream ID to SLAStream (isolated storage for parallelism)
    mapping(uint256 => SLAStream) public streams;

    /// @notice Current stream ID counter
    uint256 public nextStreamId;

    /// @notice Authorized oracle addresses for metric reporting
    mapping(address => bool) public authorizedOracles;

    /// @notice Events
    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 deposit,
        uint256 startTime,
        uint256 stopTime,
        uint256 ratePerSecond
    );

    event SLAConfigured(
        uint256 indexed streamId,
        uint16 maxLatencyMs,
        uint16 minUptimePercent,
        uint16 maxErrorRate,
        uint16 maxJitterMs,
        uint16 refundPercentOnBreach
    );

    event SLABreached(
        uint256 indexed streamId,
        string breachType,
        uint256 breachValue,
        uint256 timestamp
    );

    event RefundTriggered(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 refundAmount,
        string reason
    );

    event TieredRefundExecuted(
        uint256 indexed streamId,
        uint8 tier,
        uint256 amount,
        string breachType,
        uint256 breachValue
    );

    event WithdrawalMade(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );

    event StreamCancelled(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 senderBalance,
        uint256 recipientBalance
    );

    event OracleAuthorized(address indexed oracle, bool authorized);

    /// @notice Errors
    error InvalidTimeRange();
    error InvalidDeposit();
    error Unauthorized();
    error StreamNotActive();
    error InsufficientBalance();
    error TransferFailed();
    error InvalidSLAConfig();
    error OracleNotAuthorized();

    /// @notice Modifier to check oracle authorization
    modifier onlyAuthorizedOracle() {
        if (!authorizedOracles[msg.sender]) revert OracleNotAuthorized();
        _;
    }

    constructor() {
        // Authorize deployer as oracle initially
        authorizedOracles[msg.sender] = true;
        emit OracleAuthorized(msg.sender, true);
    }

    /**
     * @notice Authorize or revoke oracle access
     * @param oracle Oracle address
     * @param authorized Authorization status
     */
    function setOracleAuthorization(address oracle, bool authorized) external {
        // Only authorized oracles can authorize others (including deployer initially)
        if (!authorizedOracles[msg.sender]) revert OracleNotAuthorized();
        authorizedOracles[oracle] = authorized;
        emit OracleAuthorized(oracle, authorized);
    }

    /**
     * @notice Create a new SLA-enforced payment stream
     * @param recipient The address receiving the stream
     * @param token Token address (address(0) for ETH)
     * @param startTime When the stream starts
     * @param stopTime When the stream stops
     * @param slaConfig SLA configuration
     * @return streamId The ID of the created stream
     */
    function createStream(
        address recipient,
        address token,
        uint256 startTime,
        uint256 stopTime,
        SLA calldata slaConfig
    ) external payable returns (uint256 streamId) {
        if (startTime >= stopTime) revert InvalidTimeRange();
        if (msg.value == 0) revert InvalidDeposit();
        if (recipient == address(0)) revert Unauthorized();
        if (token != address(0)) revert InvalidDeposit(); // Only ETH for now

        // Validate SLA config
        if (slaConfig.minUptimePercent > 10000) revert InvalidSLAConfig();
        if (slaConfig.maxErrorRate > 10000) revert InvalidSLAConfig();
        if (slaConfig.refundPercentOnBreach > 10000) revert InvalidSLAConfig();

        uint256 duration = stopTime - startTime;
        uint256 ratePerSecond = msg.value / duration;
        
        if (ratePerSecond == 0) revert InvalidDeposit();

        streamId = nextStreamId++;

        // Store in isolated slot for parallel execution
        streams[streamId] = SLAStream({
            sender: msg.sender,
            recipient: recipient,
            token: token,
            deposit: msg.value,
            startTime: startTime,
            stopTime: stopTime,
            ratePerSecond: ratePerSecond,
            remainingBalance: msg.value,
            isActive: true,
            slaConfig: slaConfig,
            refundTiers: RefundTiers(0, 0, 0, 0, 0), // Empty tiers - use legacy refundPercentOnBreach
            breachCount: 0,
            totalRefunded: 0
        });

        emit StreamCreated(
            streamId,
            msg.sender,
            recipient,
            msg.value,
            startTime,
            stopTime,
            ratePerSecond
        );

        emit SLAConfigured(
            streamId,
            slaConfig.maxLatencyMs,
            slaConfig.minUptimePercent,
            slaConfig.maxErrorRate,
            slaConfig.maxJitterMs,
            slaConfig.refundPercentOnBreach
        );
    }

    /**
     * @notice Create a new SLA-enforced payment stream with graduated refund tiers
     * @param recipient The address receiving the stream
     * @param token Token address (address(0) for ETH)
     * @param startTime When the stream starts
     * @param stopTime When the stream stops
     * @param slaConfig SLA configuration
     * @param refundTiers Graduated refund tier configuration
     * @return streamId The ID of the created stream
     */
    function createStreamWithTiers(
        address recipient,
        address token,
        uint256 startTime,
        uint256 stopTime,
        SLA calldata slaConfig,
        RefundTiers calldata refundTiers
    ) external payable returns (uint256 streamId) {
        if (startTime >= stopTime) revert InvalidTimeRange();
        if (msg.value == 0) revert InvalidDeposit();
        if (recipient == address(0)) revert Unauthorized();
        if (token != address(0)) revert InvalidDeposit(); // Only ETH for now

        // Validate SLA config
        if (slaConfig.minUptimePercent > 10000) revert InvalidSLAConfig();
        if (slaConfig.maxErrorRate > 10000) revert InvalidSLAConfig();
        if (slaConfig.refundPercentOnBreach > 10000) revert InvalidSLAConfig();
        
        // Validate refund tiers
        if (refundTiers.tier1RefundPercent > 10000) revert InvalidSLAConfig();
        if (refundTiers.tier2RefundPercent > 10000) revert InvalidSLAConfig();
        if (refundTiers.tier3RefundPercent > 10000) revert InvalidSLAConfig();
        // Ensure thresholds are positive and properly ordered
        if (refundTiers.tier1Threshold == 0) revert InvalidSLAConfig();
        if (refundTiers.tier2Threshold == 0) revert InvalidSLAConfig();
        if (refundTiers.tier1Threshold >= refundTiers.tier2Threshold) revert InvalidSLAConfig();

        uint256 duration = stopTime - startTime;
        uint256 ratePerSecond = msg.value / duration;
        
        if (ratePerSecond == 0) revert InvalidDeposit();

        streamId = nextStreamId++;

        // Store in isolated slot for parallel execution
        streams[streamId] = SLAStream({
            sender: msg.sender,
            recipient: recipient,
            token: token,
            deposit: msg.value,
            startTime: startTime,
            stopTime: stopTime,
            ratePerSecond: ratePerSecond,
            remainingBalance: msg.value,
            isActive: true,
            slaConfig: slaConfig,
            refundTiers: refundTiers,
            breachCount: 0,
            totalRefunded: 0
        });

        emit StreamCreated(
            streamId,
            msg.sender,
            recipient,
            msg.value,
            startTime,
            stopTime,
            ratePerSecond
        );

        emit SLAConfigured(
            streamId,
            slaConfig.maxLatencyMs,
            slaConfig.minUptimePercent,
            slaConfig.maxErrorRate,
            slaConfig.maxJitterMs,
            slaConfig.refundPercentOnBreach
        );
    }

    /**
     * @notice Calculate tiered refund amount based on breach severity
     * @param streamId The ID of the stream
     * @param breachValue The measured value that breached the SLA
     * @param breachType Type of breach (for context)
     * @return refundAmount The calculated refund amount
     * @return tier The tier that was applied (0 for legacy, 1-3 for tiered)
     */
    function calculateTieredRefund(
        uint256 streamId,
        uint256 breachValue,
        string calldata breachType
    ) public view returns (uint256 refundAmount, uint8 tier) {
        // Validate stream exists (deposit > 0 means stream was created)
        SLAStream storage stream = streams[streamId];
        if (stream.deposit == 0) revert StreamNotActive();
        
        // Check if using tiered refunds (all thresholds > 0 means tiers configured)
        bool usingTiers = stream.refundTiers.tier1Threshold > 0 && 
                         stream.refundTiers.tier2Threshold > 0;
        
        if (!usingTiers) {
            // Use legacy fixed percentage
            refundAmount = (stream.deposit * stream.slaConfig.refundPercentOnBreach) / 10000;
            tier = 0; // Legacy mode
        } else {
            // Determine tier based on breach value
            uint16 refundPercent;
            
            if (breachValue >= stream.refundTiers.tier2Threshold) {
                // Tier 3: Severe breach
                refundPercent = stream.refundTiers.tier3RefundPercent;
                tier = 3;
            } else if (breachValue >= stream.refundTiers.tier1Threshold) {
                // Tier 2: Moderate breach
                refundPercent = stream.refundTiers.tier2RefundPercent;
                tier = 2;
            } else {
                // Tier 1: Minor breach
                refundPercent = stream.refundTiers.tier1RefundPercent;
                tier = 1;
            }
            
            refundAmount = (stream.deposit * refundPercent) / 10000;
        }
        
        // Ensure we don't refund more than remaining balance
        if (refundAmount > stream.remainingBalance) {
            refundAmount = stream.remainingBalance;
        }
    }

    /**
     * @notice Calculate available balance for withdrawal
     * @param streamId The ID of the stream
     * @return The amount available to withdraw
     */
    function balanceOf(uint256 streamId) public view returns (uint256) {
        SLAStream storage stream = streams[streamId];
        if (!stream.isActive) return 0;

        uint256 currentTime = block.timestamp;
        if (currentTime <= stream.startTime) return 0;
        if (currentTime >= stream.stopTime) {
            return stream.remainingBalance;
        }

        uint256 elapsedTime = currentTime - stream.startTime;
        uint256 earned = elapsedTime * stream.ratePerSecond;
        uint256 alreadyWithdrawn = stream.deposit - stream.remainingBalance;

        return earned > alreadyWithdrawn ? earned - alreadyWithdrawn : 0;
    }

    /**
     * @notice Withdraw available funds from a stream
     * @param streamId The ID of the stream
     * @param amount The amount to withdraw
     */
    function withdrawFromStream(uint256 streamId, uint256 amount) external {
        SLAStream storage stream = streams[streamId];

        if (!stream.isActive) revert StreamNotActive();
        if (msg.sender != stream.recipient) revert Unauthorized();

        uint256 available = balanceOf(streamId);
        if (amount > available) revert InsufficientBalance();

        stream.remainingBalance -= amount;

        emit WithdrawalMade(streamId, stream.recipient, amount);

        (bool success, ) = stream.recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Cancel a stream and distribute remaining funds
     * @param streamId The ID of the stream to cancel
     */
    function cancelStream(uint256 streamId) external {
        SLAStream storage stream = streams[streamId];

        if (!stream.isActive) revert StreamNotActive();
        if (msg.sender != stream.sender && msg.sender != stream.recipient) {
            revert Unauthorized();
        }

        uint256 recipientBalance = balanceOf(streamId);
        uint256 senderBalance = stream.remainingBalance - recipientBalance;

        stream.isActive = false;
        stream.remainingBalance = 0;

        emit StreamCancelled(
            streamId,
            stream.sender,
            stream.recipient,
            senderBalance,
            recipientBalance
        );

        // Transfer to recipient
        if (recipientBalance > 0) {
            (bool success1, ) = stream.recipient.call{value: recipientBalance}("");
            if (!success1) revert TransferFailed();
        }

        // Return remaining to sender
        if (senderBalance > 0) {
            (bool success2, ) = stream.sender.call{value: senderBalance}("");
            if (!success2) revert TransferFailed();
        }
    }

    /**
     * @notice Report SLA breach and trigger refund (called by authorized oracle)
     * @param streamId The stream ID
     * @param breachType Type of breach (latency, uptime, error_rate, jitter)
     * @param breachValue The measured value that breached the SLA
     */
    function reportSLABreach(
        uint256 streamId,
        string calldata breachType,
        uint256 breachValue
    ) external onlyAuthorizedOracle {
        SLAStream storage stream = streams[streamId];

        if (!stream.isActive) revert StreamNotActive();

        stream.breachCount++;

        emit SLABreached(streamId, breachType, breachValue, block.timestamp);

        // Calculate refund amount using tiered logic
        (uint256 refundAmount, uint8 tier) = calculateTieredRefund(streamId, breachValue, breachType);

        if (refundAmount > 0) {
            stream.remainingBalance -= refundAmount;
            stream.totalRefunded += refundAmount;

            emit RefundTriggered(streamId, stream.sender, refundAmount, breachType);
            
            // Emit tiered refund event if using tiers
            if (tier > 0) {
                emit TieredRefundExecuted(streamId, tier, refundAmount, breachType, breachValue);
            }

            // Transfer refund to sender
            (bool success, ) = stream.sender.call{value: refundAmount}("");
            if (!success) revert TransferFailed();
        }

        // Auto-stop on severe breach if configured
        if (stream.slaConfig.autoStopOnSevereBreach && stream.breachCount >= 3) {
            stream.isActive = false;
            
            // Return all remaining balance to sender
            if (stream.remainingBalance > 0) {
                uint256 remaining = stream.remainingBalance;
                stream.remainingBalance = 0;
                
                (bool success, ) = stream.sender.call{value: remaining}("");
                if (!success) revert TransferFailed();
            }
        }
    }

    /**
     * @notice Get stream details
     * @param streamId The ID of the stream
     * @return Stream details
     */
    function getStream(uint256 streamId) external view returns (SLAStream memory) {
        return streams[streamId];
    }

    /**
     * @notice Batch create multiple SLA streams for parallel execution
     * @param recipients Array of recipient addresses
     * @param tokens Array of token addresses
     * @param startTimes Array of start times
     * @param stopTimes Array of stop times
     * @param amounts Array of deposit amounts
     * @param slaConfigs Array of SLA configurations
     * @return streamIds Array of created stream IDs
     */
    function batchCreateStreams(
        address[] calldata recipients,
        address[] calldata tokens,
        uint256[] calldata startTimes,
        uint256[] calldata stopTimes,
        uint256[] calldata amounts,
        SLA[] calldata slaConfigs
    ) external payable returns (uint256[] memory streamIds) {
        uint256 length = recipients.length;
        if (
            length != tokens.length ||
            length != startTimes.length ||
            length != stopTimes.length ||
            length != amounts.length ||
            length != slaConfigs.length
        ) revert InvalidDeposit();

        uint256 totalRequired = 0;
        for (uint256 i = 0; i < length; i++) {
            totalRequired += amounts[i];
        }
        if (msg.value != totalRequired) revert InvalidDeposit();

        streamIds = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            if (startTimes[i] >= stopTimes[i]) revert InvalidTimeRange();
            if (amounts[i] == 0) revert InvalidDeposit();
            if (recipients[i] == address(0)) revert Unauthorized();
            if (tokens[i] != address(0)) revert InvalidDeposit(); // Only ETH for now

            // Validate SLA config
            if (slaConfigs[i].minUptimePercent > 10000) revert InvalidSLAConfig();
            if (slaConfigs[i].maxErrorRate > 10000) revert InvalidSLAConfig();
            if (slaConfigs[i].refundPercentOnBreach > 10000) revert InvalidSLAConfig();

            uint256 streamId = nextStreamId++;
            streamIds[i] = streamId;

            uint256 duration = stopTimes[i] - startTimes[i];
            uint256 rate = amounts[i] / duration;
            
            if (rate == 0) revert InvalidDeposit();

            // Each stream in isolated storage slot
            SLAStream storage newStream = streams[streamId];
            newStream.sender = msg.sender;
            newStream.recipient = recipients[i];
            newStream.token = tokens[i];
            newStream.deposit = amounts[i];
            newStream.startTime = startTimes[i];
            newStream.stopTime = stopTimes[i];
            newStream.ratePerSecond = rate;
            newStream.remainingBalance = amounts[i];
            newStream.isActive = true;
            newStream.slaConfig = slaConfigs[i];
            newStream.refundTiers = RefundTiers(0, 0, 0, 0, 0); // Empty tiers - use legacy
            newStream.breachCount = 0;
            newStream.totalRefunded = 0;

            emit StreamCreated(
                streamId,
                msg.sender,
                recipients[i],
                amounts[i],
                startTimes[i],
                stopTimes[i],
                rate
            );

            emit SLAConfigured(
                streamId,
                slaConfigs[i].maxLatencyMs,
                slaConfigs[i].minUptimePercent,
                slaConfigs[i].maxErrorRate,
                slaConfigs[i].maxJitterMs,
                slaConfigs[i].refundPercentOnBreach
            );
        }
    }
}
