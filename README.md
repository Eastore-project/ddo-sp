# DDO Storage Provider Event Listener

A Node.js server that listens to `AllocationCreated` smart contract events and filters them based on a configured provider ID.

## Features

- ✅ Listens to `AllocationCreated` events from a specified smart contract
- 🎯 Filters events by configured provider ID
- 📚 Can fetch and process past events from a specified block
- 🔄 Graceful shutdown handling
- 🛡️ Error handling and connection validation
- 📝 Comprehensive logging

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Blockchain RPC URL
# For WebSocket (recommended for real-time events): wss://your-websocket-endpoint
# For HTTP RPC: https://your-rpc-endpoint-here
RPC_URL=wss://your-websocket-endpoint

# Contract address to listen for events
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890

# Configured provider ID to filter events
PROVIDER_ID=123

# Size limits for allocations (in bytes)
MIN_SIZE=1048576
MAX_SIZE=107374182400

# Filecoin client address for boostd command
FIL_CLIENT_ADDRESS=t3tejq3lb3szsq7spvttqohsfpsju2jof2dbive2qujgz2idqaj2etuolzgbmro3owsmpuebmoghwxgt6ricvq

# Start epoch offset for boostd command (optional)
# If specified, start-epoch will be calculated as: block_number + START_EPOCH_OFFSET
# If not specified, the boostd command will run without --start-epoch flag
# START_EPOCH_OFFSET=807

# Download directory for temporary files
DOWNLOAD_DIR=./downloads

# Optional: Starting block number to listen from (leave empty for latest)
START_BLOCK=

# Optional: Network name for logging
NETWORK_NAME=filecoin
```

### 3. Required Configuration

Make sure to set these required environment variables:

- `RPC_URL`: Your blockchain endpoint (WebSocket `wss://` recommended for real-time events, or HTTP `https://`)
- `CONTRACT_ADDRESS`: The smart contract address to listen to
- `PROVIDER_ID`: Your provider ID to filter events
- `MIN_SIZE`: Minimum allocation size in bytes (e.g., 1048576 for 1MB)
- `MAX_SIZE`: Maximum allocation size in bytes (e.g., 107374182400 for 100GB)
- `FIL_CLIENT_ADDRESS`: Your Filecoin client address for boostd commands
- `DOWNLOAD_DIR`: Directory for temporary file downloads (e.g., ./downloads)

### Optional Configuration

- `START_EPOCH_OFFSET`: Number of blocks to add to the current block number for start-epoch calculation (e.g., 807). If not specified, boostd commands will run without the --start-epoch flag
- `START_BLOCK`: Starting block number to fetch past events from (leave empty for latest)
- `NETWORK_NAME`: Network name for logging purposes

### 4. Provider Types

**WebSocket (Recommended):**

- Use `wss://` URLs for real-time event listening
- Maintains persistent connection for instant event delivery
- More efficient for continuous event monitoring

**HTTP RPC (Alternative):**

- Use `https://` URLs for standard RPC connections
- Uses polling mechanism which may have slight delays
- Good for testing or when WebSocket is not available

## Usage

### Start the Server

```bash
npm start
```

### Development Mode (with auto-restart)

```bash
npm run dev
```

## How It Works

1. **Initialization**: The server connects to the blockchain using the provided RPC URL
2. **Contract Setup**: Initializes the smart contract interface with the AllocationCreated event ABI
3. **Event Listening**: Starts listening for new `AllocationCreated` events
4. **Filtering**: Only processes events where the `provider` matches your configured `PROVIDER_ID`
5. **Processing**: Calls the `processAllocation()` method for matching events (ready for your business logic)

## Event Structure

The server listens for events with this structure:

```solidity
event AllocationCreated(
    address indexed client,
    uint64 indexed allocationId,
    uint64 indexed provider,
    bytes data,
    uint64 size,
    int64 termMin,
    int64 termMax,
    int64 expiration,
    string downloadURL
);
```

## Allocation Processing

When an allocation matches your provider ID, the server automatically:

1. **Size Validation**: Checks if the allocation size is within your configured MIN_SIZE and MAX_SIZE limits
2. **CID Conversion**: Converts the data field (hex bytes) back to a Piece CID
3. **File Download**: Downloads the file from the provided URL to your configured download directory
4. **Start Epoch Calculation**: If START_EPOCH_OFFSET is configured, calculates start-epoch as block number + offset for better timing control
5. **Boost Integration**: Executes the `boostd import-direct` command with the correct parameters and proper error handling
6. **Cleanup**: Removes the downloaded file if the boostd command succeeds (keeps it for debugging if it fails)

## Start Epoch Configuration

The `START_EPOCH_OFFSET` environment variable allows you to control when your storage deals become active:

- **When configured**: The start-epoch is calculated as `block_number + START_EPOCH_OFFSET`
  - Example: If an allocation event occurs at block 1000 and `START_EPOCH_OFFSET=807`, the boostd command will use `--start-epoch=1807`
- **When not configured**: The boostd command runs without the `--start-epoch` flag, allowing immediate activation
- **Block number unavailable**: If the block number cannot be determined from the event, the command runs without start-epoch and logs a warning

This feature provides better control over deal timing and helps ensure deals activate at the appropriate blockchain epoch.

## Prerequisites

Make sure you have:

- `boostd` installed and accessible in your PATH
- Proper Filecoin node setup and configuration
- Network access to download files from the provided URLs
- Sufficient disk space in your download directory

## Stopping the Server

The server handles graceful shutdown with `Ctrl+C` (SIGINT) or `SIGTERM` signals.

## Troubleshooting

- **Connection Issues**: Verify your `RPC_URL` is correct and accessible
- **No Events**: Check that the `CONTRACT_ADDRESS` is correct and has the AllocationCreated event
- **Provider Filtering**: Ensure your `PROVIDER_ID` matches the expected format (uint64)
- **Block Number Issues**: If you see warnings about missing block numbers with START_EPOCH_OFFSET configured, check your RPC provider supports full event metadata
- **Boostd Command Failures**: Check that boostd is properly installed and configured, and verify your FIL_CLIENT_ADDRESS is correct
- **File Download Issues**: Ensure network access to download URLs and sufficient disk space in your download directory
