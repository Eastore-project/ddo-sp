import { ethers } from "ethers";
import dotenv from "dotenv";
import { AllocationProcessor } from "./allocationProcessor.js";

// Load environment variables
dotenv.config();

// Configuration constants
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CONFIGURED_PROVIDER_ID = process.env.PROVIDER_ID;
const START_BLOCK = process.env.START_BLOCK;
const NETWORK_NAME = process.env.NETWORK_NAME || "Unknown";

// Configuration for allocation processor
const PROCESSOR_CONFIG = {
  MIN_SIZE: process.env.MIN_SIZE,
  MAX_SIZE: process.env.MAX_SIZE,
  FIL_CLIENT_ADDRESS: process.env.FIL_CLIENT_ADDRESS,
  DOWNLOAD_DIR: process.env.DOWNLOAD_DIR,
  START_EPOCH_OFFSET: process.env.START_EPOCH_OFFSET,
  DELAYED_CLEANUP_HOURS: process.env.DELAYED_CLEANUP_HOURS,
};

// Contract ABI for the AllocationCreated event
const CONTRACT_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "client",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint64",
        name: "allocationId",
        type: "uint64",
      },
      {
        indexed: true,
        internalType: "uint64",
        name: "provider",
        type: "uint64",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "uint64",
        name: "size",
        type: "uint64",
      },
      {
        internalType: "int64",
        name: "termMin",
        type: "int64",
      },
      {
        internalType: "int64",
        name: "termMax",
        type: "int64",
      },
      {
        internalType: "int64",
        name: "expiration",
        type: "int64",
      },
      {
        internalType: "string",
        name: "downloadURL",
        type: "string",
      },
    ],
    name: "AllocationCreated",
    type: "event",
  },
];

class EventListener {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.isListening = false;
    this.allocationProcessor = null;
  }

  async initialize() {
    try {
      // Validate required environment variables
      if (!RPC_URL) {
        throw new Error("RPC_URL is required in environment variables");
      }
      if (!CONTRACT_ADDRESS) {
        throw new Error(
          "CONTRACT_ADDRESS is required in environment variables"
        );
      }
      if (!CONFIGURED_PROVIDER_ID) {
        throw new Error("PROVIDER_ID is required in environment variables");
      }

      // Initialize provider based on URL type
      if (RPC_URL.startsWith("wss://") || RPC_URL.startsWith("ws://")) {
        this.provider = new ethers.WebSocketProvider(RPC_URL);
        console.log(`🔌 Using WebSocket provider for real-time events`);
      } else {
        this.provider = new ethers.JsonRpcProvider(RPC_URL);
        console.log(`📡 Using JSON-RPC provider`);
      }

      // Test connection
      const network = await this.provider.getNetwork();
      console.log(
        `✅ Connected to ${NETWORK_NAME} (Chain ID: ${network.chainId})`
      );

      // Initialize contract
      this.contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        this.provider
      );
      console.log(`📋 Contract initialized at: ${CONTRACT_ADDRESS}`);
      console.log(
        `🎯 Configured to listen for provider ID: ${CONFIGURED_PROVIDER_ID}`
      );

      // Initialize allocation processor
      this.allocationProcessor = new AllocationProcessor(PROCESSOR_CONFIG);
      const processorInitialized = await this.allocationProcessor.initialize();
      if (!processorInitialized) {
        throw new Error("Failed to initialize allocation processor");
      }

      return true;
    } catch (error) {
      console.error("❌ Initialization failed:", error.message);
      return false;
    }
  }

  async startListening() {
    if (!this.contract || !this.provider) {
      console.error("❌ Contract not initialized. Call initialize() first.");
      return;
    }

    try {
      this.isListening = true;
      console.log("\n🎧 Starting to listen for AllocationCreated events...");

      // Set up event filter for AllocationCreated events
      const filter = this.contract.filters.AllocationCreated();

      // Listen for new events
      this.contract.on(filter, async (eventPayload) => {
        try {
          // Extract event data from ContractEventPayload
          const eventArgs = eventPayload.args;
          const event = eventPayload.log;

          // Debug: Log received arguments
          console.log(
            `📥 Received ${eventArgs.length} event arguments:`,
            eventArgs.map((arg, i) => `[${i}]: ${arg}`)
          );

          // Extract arguments with proper error handling
          const [
            client,
            allocationId,
            provider,
            data,
            size,
            termMin,
            termMax,
            expiration,
            downloadURL,
          ] = eventArgs;

          await this.handleAllocationCreated({
            client,
            allocationId,
            provider,
            data,
            size,
            termMin,
            termMax,
            expiration,
            downloadURL,
            event,
          });
        } catch (error) {
          console.error("❌ Error processing event:", error);
          console.error("❌ Event payload received:", eventPayload);
        }
      });

      // Also listen for past events if START_BLOCK is specified
      if (START_BLOCK) {
        console.log(`📚 Fetching past events from block ${START_BLOCK}...`);
        const pastEvents = await this.contract.queryFilter(
          filter,
          parseInt(START_BLOCK)
        );

        for (const event of pastEvents) {
          const [
            client,
            allocationId,
            provider,
            data,
            size,
            termMin,
            termMax,
            expiration,
            downloadURL,
          ] = event.args;
          await this.handleAllocationCreated({
            client,
            allocationId,
            provider,
            data,
            size,
            termMin,
            termMax,
            expiration,
            downloadURL,
            event,
            isPastEvent: true,
          });
        }
      }

      console.log(
        "✅ Event listener is now active and waiting for events...\n"
      );
    } catch (error) {
      console.error("❌ Error starting event listener:", error.message);
      this.isListening = false;
    }
  }

  async handleAllocationCreated(eventData) {
    try {
      const {
        client,
        allocationId,
        provider,
        data,
        size,
        termMin,
        termMax,
        expiration,
        downloadURL,
        event,
        isPastEvent = false,
      } = eventData;

      // Validate that we have all required data
      if (!event) {
        console.error("❌ Missing event object");
        return;
      }

      const eventType = isPastEvent ? "[PAST EVENT]" : "[NEW EVENT]";

      console.log(`\n📨 ${eventType} AllocationCreated detected:`);
      console.log(`   Block: ${event.blockNumber || "N/A"}`);
      console.log(`   Transaction: ${event.transactionHash || "N/A"}`);

      // Safely convert values to strings with null checks
      const clientAddr = client ? client.toString() : "N/A";
      const allocId = allocationId ? allocationId.toString() : "N/A";
      const providerId = provider ? provider.toString() : "N/A";
      const sizeValue = size ? size.toString() : "N/A";
      const termMinValue = termMin ? termMin.toString() : "N/A";
      const termMaxValue = termMax ? termMax.toString() : "N/A";
      const expirationValue = expiration ? expiration.toString() : "N/A";
      const downloadUrl = downloadURL ? downloadURL.toString() : "N/A";

      console.log(`   Client: ${clientAddr}`);
      console.log(`   Allocation ID: ${allocId}`);
      console.log(`   Provider: ${providerId}`);
      console.log(`   Size: ${sizeValue}`);
      console.log(`   Term Min: ${termMinValue}`);
      console.log(`   Term Max: ${termMaxValue}`);
      console.log(`   Expiration: ${expirationValue}`);
      console.log(`   Download URL: ${downloadUrl}`);

      // Check if provider ID is valid before comparing
      if (!provider) {
        console.log(`⚠️  Provider ID is undefined/null. Skipping event.`);
        return;
      }

      // Check if this event is for our configured provider
      if (providerId === CONFIGURED_PROVIDER_ID) {
        console.log(
          `✅ Provider matches configured provider (${CONFIGURED_PROVIDER_ID})`
        );
        console.log(`🎯 Processing allocation for our provider...`);

        // TODO: Add your business logic here
        await this.processAllocation(eventData);
      } else {
        console.log(
          `⏭️  Provider ${providerId} does not match configured provider ${CONFIGURED_PROVIDER_ID}. Ignoring event.`
        );
      }
    } catch (error) {
      console.error("❌ Error in handleAllocationCreated:", error);
      console.error("❌ Event data received:", eventData);
    }
  }

  async processAllocation(eventData) {
    if (!this.allocationProcessor) {
      console.error("❌ Allocation processor not initialized");
      return;
    }

    try {
      const success = await this.allocationProcessor.processAllocation(
        eventData
      );
      if (success) {
        console.log(
          `🎉 Allocation ${eventData.allocationId.toString()} processed successfully!`
        );
      } else {
        console.log(
          `⚠️ Allocation ${eventData.allocationId.toString()} processing failed or was skipped`
        );
      }
    } catch (error) {
      console.error(`❌ Error in processAllocation:`, error.message);
    }
  }

  async stop() {
    if (this.contract && this.isListening) {
      this.contract.removeAllListeners();
      this.isListening = false;
      console.log("🛑 Event listener stopped");
    }

    // Close WebSocket connection if using WebSocketProvider
    if (this.provider && this.provider.websocket) {
      await this.provider.destroy();
      console.log("🔌 WebSocket connection closed");
    }
  }
}

// Main execution
async function main() {
  console.log("🚀 DDO Storage Provider Event Listener");
  console.log("=====================================\n");

  const listener = new EventListener();

  // Initialize the listener
  const initialized = await listener.initialize();
  if (!initialized) {
    console.error("❌ Failed to initialize event listener. Exiting...");
    process.exit(1);
  }

  // Start listening for events
  await listener.startListening();

  // Graceful shutdown handling
  process.on("SIGINT", async () => {
    console.log("\n🔄 Received SIGINT. Gracefully shutting down...");
    await listener.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🔄 Received SIGTERM. Gracefully shutting down...");
    await listener.stop();
    process.exit(0);
  });

  // Keep the process running
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  });
}

// Start the application
main().catch((error) => {
  console.error("❌ Application failed to start:", error);
  process.exit(1);
});
