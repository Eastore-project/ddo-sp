import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import CID from "cids";

const execAsync = promisify(exec);

export class AllocationProcessor {
  constructor(config) {
    this.minSize = parseInt(config.MIN_SIZE);
    this.maxSize = parseInt(config.MAX_SIZE);
    this.filClientAddress = config.FIL_CLIENT_ADDRESS;
    this.downloadDir = config.DOWNLOAD_DIR || "./downloads";
    this.startEpochOffset = config.START_EPOCH_OFFSET
      ? parseInt(config.START_EPOCH_OFFSET)
      : null;

    // Validate configuration
    if (!this.filClientAddress) {
      throw new Error(
        "FIL_CLIENT_ADDRESS is required in environment variables"
      );
    }
    if (isNaN(this.minSize) || isNaN(this.maxSize)) {
      throw new Error("MIN_SIZE and MAX_SIZE must be valid numbers");
    }
    if (this.minSize >= this.maxSize) {
      throw new Error("MIN_SIZE must be less than MAX_SIZE");
    }
    if (this.startEpochOffset !== null && isNaN(this.startEpochOffset)) {
      throw new Error("START_EPOCH_OFFSET must be a valid number if provided");
    }
  }

  async initialize() {
    try {
      // Create download directory if it doesn't exist
      await fs.mkdir(this.downloadDir, { recursive: true });
      console.log(`📁 Download directory ready: ${this.downloadDir}`);

      console.log(
        `📏 Size limits: ${this.formatBytes(this.minSize)} - ${this.formatBytes(
          this.maxSize
        )}`
      );
      console.log(`📋 Filecoin client address: ${this.filClientAddress}`);
      if (this.startEpochOffset !== null) {
        console.log(`⏰ Start epoch offset: ${this.startEpochOffset} blocks`);
      } else {
        console.log(
          `⏰ Start epoch: Not configured (will run without start-epoch)`
        );
      }

      return true;
    } catch (error) {
      console.error(
        "❌ Failed to initialize AllocationProcessor:",
        error.message
      );
      return false;
    }
  }

  async processAllocation(eventData) {
    const { allocationId, size, downloadURL, data } = eventData;
    const allocIdStr = allocationId.toString();

    console.log(`\n🔄 Processing allocation ${allocIdStr}...`);

    try {
      // Step 1: Validate size constraints
      const sizeNum = parseInt(size.toString());
      if (!this.validateSize(sizeNum)) {
        console.log(
          `❌ Size ${this.formatBytes(sizeNum)} is outside allowed range`
        );
        return false;
      }

      console.log(
        `✅ Size ${this.formatBytes(sizeNum)} is within allowed range`
      );

      // Step 2: Convert data bytes to CID
      const pieceCid = this.bytesToCid(data);
      if (!pieceCid) {
        console.log(`❌ Failed to convert data to CID`);
        return false;
      }

      console.log(`🔗 Piece CID: ${pieceCid}`);

      // Step 3: Download the file
      const downloadedFile = await this.downloadFile(downloadURL, allocIdStr);
      if (!downloadedFile) {
        console.log(`❌ Failed to download file from ${downloadURL}`);
        return false;
      }

      console.log(`📥 File downloaded: ${downloadedFile}`);

      // Step 4: Execute boostd command
      const blockNumber = eventData.event?.blockNumber;
      if (this.startEpochOffset !== null && !blockNumber) {
        console.log(
          `⚠️ START_EPOCH_OFFSET is configured but block number is not available from event`
        );
        console.log(
          `🔍 Event object:`,
          JSON.stringify(eventData.event, null, 2)
        );
      }
      const success = await this.executeBoostdCommand(
        allocIdStr,
        pieceCid,
        downloadedFile,
        blockNumber
      );

      // Step 5: Clean up file if command succeeded
      if (success) {
        await this.cleanupFile(downloadedFile);
        console.log(`✅ Allocation ${allocIdStr} processed successfully`);
        return true;
      } else {
        console.log(`❌ Allocation ${allocIdStr} processing failed`);
        // Keep file for debugging if command failed
        console.log(`🔍 File kept for debugging: ${downloadedFile}`);
        return false;
      }
    } catch (error) {
      console.error(
        `❌ Error processing allocation ${allocIdStr}:`,
        error.message
      );
      return false;
    }
  }

  validateSize(size) {
    return size >= this.minSize && size <= this.maxSize;
  }

  bytesToCid(dataHex) {
    try {
      // Remove '0x' prefix if present
      const cleanHex = dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex;

      // Convert hex string to buffer
      const bytes = Buffer.from(cleanHex, "hex");

      // Create CID from bytes
      const cid = new CID(bytes);

      return cid.toString();
    } catch (error) {
      console.error("❌ Error converting bytes to CID:", error.message);
      return null;
    }
  }

  async downloadFile(url, allocationId) {
    try {
      console.log(`📡 Downloading file from: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Create filename with allocation ID
      const filename = `allocation_${allocationId}.car`;
      const filepath = path.join(this.downloadDir, filename);

      // Save file
      const buffer = await response.buffer();
      await fs.writeFile(filepath, buffer);

      // Verify file was written
      const stats = await fs.stat(filepath);
      console.log(
        `📁 File saved: ${filepath} (${this.formatBytes(stats.size)})`
      );

      return filepath;
    } catch (error) {
      console.error("❌ Download failed:", error.message);
      return null;
    }
  }

  async executeBoostdCommand(
    allocationId,
    pieceCid,
    filePath,
    blockNumber = null
  ) {
    try {
      let command = `boostd import-direct --client-addr=${this.filClientAddress}`;

      // Add start-epoch if configured and block number is available
      if (this.startEpochOffset !== null && blockNumber) {
        const startEpoch = parseInt(blockNumber) + this.startEpochOffset;
        command += ` --start-epoch=${startEpoch}`;
        console.log(
          `⏰ Calculated start epoch: ${startEpoch} (block ${blockNumber} + ${this.startEpochOffset})`
        );
      } else if (this.startEpochOffset !== null && !blockNumber) {
        console.log(
          `⚠️ START_EPOCH_OFFSET configured (${this.startEpochOffset}) but block number unavailable - running without start-epoch`
        );
      }

      command += ` --allocation-id=${allocationId} ${pieceCid} ${filePath}`;

      console.log(`🚀 Executing command: ${command}`);

      const { stdout, stderr } = await execAsync(command);

      if (stdout) {
        console.log(`📋 Command output:\n${stdout}`);
      }

      if (stderr) {
        console.log(`⚠️ Command stderr:\n${stderr}`);
        throw new Error(`boostd command failed with stderr: ${stderr}`);
      }

      console.log(`✅ boostd command executed successfully`);
      return true;
    } catch (error) {
      console.error("❌ boostd command failed:", error.message);
      if (error.stdout) {
        console.log(`📋 Command stdout:\n${error.stdout}`);
      }
      if (error.stderr) {
        console.log(`⚠️ Command stderr:\n${error.stderr}`);
      }
      return false;
    }
  }

  async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`🗑️ Cleaned up file: ${filePath}`);
    } catch (error) {
      console.error(`⚠️ Failed to cleanup file ${filePath}:`, error.message);
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
