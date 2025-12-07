// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ParallelPay
 * @notice Micro-payment streaming protocol optimized for Monad's parallel EVM
 * @dev Uses isolated storage slots per stream to enable massive parallel execution
 */
contract ParallelPay {
    /// @notice Stream structure with isolated storage
    struct Stream {
        address sender;
        address recipient;
        uint256 deposit;
        uint256 startTime;
        uint256 stopTime;
        uint256 ratePerSecond;
        uint256 remainingBalance;
        bool isActive;
    }

    /// @notice Mapping from stream ID to Stream (each slot is independent for parallelism)
    mapping(uint256 => Stream) public streams;

    /// @notice Current stream ID counter
    uint256 public nextStreamId;

    /// @notice Events for tracking stream lifecycle
    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 deposit,
        uint256 startTime,
        uint256 stopTime,
        uint256 ratePerSecond
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

    /// @notice Errors for better gas efficiency
    error InvalidTimeRange();
    error InvalidDeposit();
    error Unauthorized();
    error StreamNotActive();
    error InsufficientBalance();
    error TransferFailed();

    /**
     * @notice Create a new payment stream
     * @param recipient The address receiving the stream
     * @param startTime When the stream starts
     * @param stopTime When the stream stops
     * @return streamId The ID of the created stream
     */
    function createStream(
        address recipient,
        uint256 startTime,
        uint256 stopTime
    ) external payable returns (uint256 streamId) {
        if (startTime >= stopTime) revert InvalidTimeRange();
        if (msg.value == 0) revert InvalidDeposit();
        if (recipient == address(0)) revert Unauthorized();

        uint256 duration = stopTime - startTime;
        uint256 ratePerSecond = msg.value / duration;
        
        // Ensure rate is not zero due to integer division (min 1 wei/sec)
        if (ratePerSecond == 0) revert InvalidDeposit();

        streamId = nextStreamId++;

        // Store in isolated slot for parallel execution
        streams[streamId] = Stream({
            sender: msg.sender,
            recipient: recipient,
            deposit: msg.value,
            startTime: startTime,
            stopTime: stopTime,
            ratePerSecond: ratePerSecond,
            remainingBalance: msg.value,
            isActive: true
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
    }

    /**
     * @notice Calculate available balance for withdrawal
     * @param streamId The ID of the stream
     * @return The amount available to withdraw
     */
    function balanceOf(uint256 streamId) public view returns (uint256) {
        Stream storage stream = streams[streamId];
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
        Stream storage stream = streams[streamId];

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
        Stream storage stream = streams[streamId];

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
     * @notice Get stream details
     * @param streamId The ID of the stream
     * @return Stream details
     */
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return streams[streamId];
    }

    /**
     * @notice Batch create multiple streams for parallel execution
     * @param recipients Array of recipient addresses
     * @param startTimes Array of start times
     * @param stopTimes Array of stop times
     * @param amounts Array of deposit amounts
     * @return streamIds Array of created stream IDs
     */
    function batchCreateStreams(
        address[] calldata recipients,
        uint256[] calldata startTimes,
        uint256[] calldata stopTimes,
        uint256[] calldata amounts
    ) external payable returns (uint256[] memory streamIds) {
        uint256 length = recipients.length;
        if (
            length != startTimes.length ||
            length != stopTimes.length ||
            length != amounts.length
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

            uint256 streamId = nextStreamId++;
            streamIds[i] = streamId;

            // Calculate outside struct to avoid stack too deep
            uint256 duration = stopTimes[i] - startTimes[i];
            uint256 rate = amounts[i] / duration;
            
            // Ensure rate is not zero due to integer division
            if (rate == 0) revert InvalidDeposit();

            // Each stream in isolated storage slot
            Stream storage newStream = streams[streamId];
            newStream.sender = msg.sender;
            newStream.recipient = recipients[i];
            newStream.deposit = amounts[i];
            newStream.startTime = startTimes[i];
            newStream.stopTime = stopTimes[i];
            newStream.ratePerSecond = rate;
            newStream.remainingBalance = amounts[i];
            newStream.isActive = true;

            emit StreamCreated(
                streamId,
                msg.sender,
                recipients[i],
                amounts[i],
                startTimes[i],
                stopTimes[i],
                rate
            );
        }
    }
}
