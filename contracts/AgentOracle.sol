// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentOracle
 * @notice Oracle receiving signed metric reports from AI agents
 * @dev Validates signatures and emits events for off-chain monitoring
 */
contract AgentOracle {
    /// @notice Metric report structure
    struct MetricReport {
        uint256 streamId;
        uint256 latencyMs;
        uint256 uptimePercent;    // 0-10000 for 0.00%-100.00%
        uint256 errorRate;        // 0-10000 for 0.00%-100.00%
        uint256 jitterMs;
        uint256 timestamp;
        address reporter;
    }

    /// @notice Mapping from report ID to MetricReport
    mapping(uint256 => MetricReport) public metricReports;
    uint256 public nextReportId;

    /// @notice Authorized AI agents
    mapping(address => bool) public authorizedAgents;

    /// @notice Contract owner
    address public owner;

    /// @notice Reference to SLAStreamFactory
    address public streamFactory;

    /// @notice Events
    event MetricReported(
        uint256 indexed reportId,
        uint256 indexed streamId,
        address indexed reporter,
        uint256 latencyMs,
        uint256 uptimePercent,
        uint256 errorRate,
        uint256 jitterMs,
        uint256 timestamp
    );

    event SLABreached(
        uint256 indexed streamId,
        string breachType,
        uint256 expectedValue,
        uint256 actualValue,
        uint256 timestamp
    );

    event RefundTriggered(
        uint256 indexed streamId,
        string reason,
        uint256 timestamp
    );

    event AgentAuthorized(address indexed agent, bool authorized);

    /// @notice Errors
    error Unauthorized();
    error InvalidSignature();
    error InvalidMetrics();
    error InvalidStreamFactory();
    error TimestampTooOld();
    error TimestampInFuture();
    error ArrayLengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(address _streamFactory) {
        owner = msg.sender;
        streamFactory = _streamFactory;
        
        // Authorize deployer as agent
        authorizedAgents[msg.sender] = true;
        emit AgentAuthorized(msg.sender, true);
    }

    /**
     * @notice Set stream factory address
     * @param _streamFactory New stream factory address
     */
    function setStreamFactory(address _streamFactory) external onlyOwner {
        if (_streamFactory == address(0)) revert InvalidStreamFactory();
        streamFactory = _streamFactory;
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
     * @notice Submit a metric report (called by authorized AI agents)
     * @param streamId The stream ID being monitored
     * @param latencyMs Current latency in milliseconds
     * @param uptimePercent Current uptime percentage (0-10000)
     * @param errorRate Current error rate (0-10000)
     * @param jitterMs Current jitter in milliseconds
     */
    function submitMetricReport(
        uint256 streamId,
        uint256 latencyMs,
        uint256 uptimePercent,
        uint256 errorRate,
        uint256 jitterMs
    ) external onlyAuthorizedAgent returns (uint256 reportId) {
        // Validate metrics
        if (uptimePercent > 10000 || errorRate > 10000) revert InvalidMetrics();

        reportId = nextReportId++;

        metricReports[reportId] = MetricReport({
            streamId: streamId,
            latencyMs: latencyMs,
            uptimePercent: uptimePercent,
            errorRate: errorRate,
            jitterMs: jitterMs,
            timestamp: block.timestamp,
            reporter: msg.sender
        });

        emit MetricReported(
            reportId,
            streamId,
            msg.sender,
            latencyMs,
            uptimePercent,
            errorRate,
            jitterMs,
            block.timestamp
        );

        // Check for SLA breaches (simplified - actual breach checking done off-chain)
        // Emit breach events for monitoring
        _checkAndEmitBreaches(streamId, latencyMs, uptimePercent, errorRate, jitterMs);
    }

    /**
     * @notice Submit signed metric report with signature verification
     * @param streamId The stream ID
     * @param latencyMs Latency measurement
     * @param uptimePercent Uptime measurement
     * @param errorRate Error rate measurement
     * @param jitterMs Jitter measurement
     * @param timestamp Timestamp of the measurement (for signature)
     * @param signature ECDSA signature from authorized agent
     */
    function submitSignedMetricReport(
        uint256 streamId,
        uint256 latencyMs,
        uint256 uptimePercent,
        uint256 errorRate,
        uint256 jitterMs,
        uint256 timestamp,
        bytes calldata signature
    ) external returns (uint256 reportId) {
        // Validate timestamp is recent (within 5 minutes)
        if (block.timestamp > timestamp + 300) revert TimestampTooOld();
        if (timestamp > block.timestamp + 60) revert TimestampInFuture();
        
        // Create message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                streamId,
                latencyMs,
                uptimePercent,
                errorRate,
                jitterMs,
                timestamp
            )
        );

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Recover signer
        address signer = _recoverSigner(ethSignedMessageHash, signature);

        // Verify signer is authorized
        if (!authorizedAgents[signer]) revert InvalidSignature();

        // Validate metrics
        if (uptimePercent > 10000 || errorRate > 10000) revert InvalidMetrics();

        reportId = nextReportId++;

        metricReports[reportId] = MetricReport({
            streamId: streamId,
            latencyMs: latencyMs,
            uptimePercent: uptimePercent,
            errorRate: errorRate,
            jitterMs: jitterMs,
            timestamp: timestamp,
            reporter: signer
        });

        emit MetricReported(
            reportId,
            streamId,
            signer,
            latencyMs,
            uptimePercent,
            errorRate,
            jitterMs,
            timestamp
        );

        _checkAndEmitBreaches(streamId, latencyMs, uptimePercent, errorRate, jitterMs);
    }

    /**
     * @notice Batch submit multiple metric reports for parallel processing
     * @param streamIds Array of stream IDs
     * @param latencies Array of latency measurements
     * @param uptimes Array of uptime measurements
     * @param errorRates Array of error rate measurements
     * @param jitters Array of jitter measurements
     */
    function batchSubmitMetricReports(
        uint256[] calldata streamIds,
        uint256[] calldata latencies,
        uint256[] calldata uptimes,
        uint256[] calldata errorRates,
        uint256[] calldata jitters
    ) external onlyAuthorizedAgent returns (uint256[] memory reportIds) {
        uint256 length = streamIds.length;
        if (
            length != latencies.length ||
            length != uptimes.length ||
            length != errorRates.length ||
            length != jitters.length
        ) revert ArrayLengthMismatch();

        reportIds = new uint256[](length);
        uint256 currentTime = block.timestamp;

        for (uint256 i = 0; i < length; i++) {
            reportIds[i] = _submitSingleReport(
                streamIds[i],
                latencies[i],
                uptimes[i],
                errorRates[i],
                jitters[i],
                currentTime
            );
        }
    }

    /**
     * @notice Internal helper to submit a single report
     */
    function _submitSingleReport(
        uint256 streamId,
        uint256 latencyMs,
        uint256 uptimePercent,
        uint256 errorRate,
        uint256 jitterMs,
        uint256 timestamp
    ) internal returns (uint256 reportId) {
        if (uptimePercent > 10000 || errorRate > 10000) revert InvalidMetrics();

        reportId = nextReportId++;

        metricReports[reportId] = MetricReport({
            streamId: streamId,
            latencyMs: latencyMs,
            uptimePercent: uptimePercent,
            errorRate: errorRate,
            jitterMs: jitterMs,
            timestamp: timestamp,
            reporter: msg.sender
        });

        emit MetricReported(
            reportId,
            streamId,
            msg.sender,
            latencyMs,
            uptimePercent,
            errorRate,
            jitterMs,
            timestamp
        );

        _checkAndEmitBreaches(streamId, latencyMs, uptimePercent, errorRate, jitterMs);
    }

    /**
     * @notice Get metric report details
     * @param reportId The report ID
     * @return MetricReport details
     */
    function getMetricReport(uint256 reportId)
        external
        view
        returns (MetricReport memory)
    {
        return metricReports[reportId];
    }

    /**
     * @notice Internal function to check and emit breach events
     */
    function _checkAndEmitBreaches(
        uint256 streamId,
        uint256 latencyMs,
        uint256 uptimePercent,
        uint256 errorRate,
        uint256 jitterMs
    ) internal {
        // These are informational events - actual breach logic is in SLAStreamFactory
        // Off-chain systems can listen to these events and trigger refunds via RefundManager
        
        // Example thresholds (would be fetched from stream in production)
        if (latencyMs > 1000) {
            emit SLABreached(streamId, "latency", 1000, latencyMs, block.timestamp);
        }
        if (uptimePercent < 9900) { // < 99%
            emit SLABreached(streamId, "uptime", 9900, uptimePercent, block.timestamp);
        }
        if (errorRate > 100) { // > 1%
            emit SLABreached(streamId, "error_rate", 100, errorRate, block.timestamp);
        }
        if (jitterMs > 100) {
            emit SLABreached(streamId, "jitter", 100, jitterMs, block.timestamp);
        }
    }

    /**
     * @notice Recover signer from signature
     */
    function _recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        (bytes32 r, bytes32 s, uint8 v) = _splitSignature(signature);
        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    /**
     * @notice Split signature into r, s, v
     */
    function _splitSignature(bytes memory sig)
        internal
        pure
        returns (bytes32 r, bytes32 s, uint8 v)
    {
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        
        if (sig.length != 65) revert InvalidSignature();
    }
}
