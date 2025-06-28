#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function cleanupOldFiles() {
  const downloadDir = process.env.DOWNLOAD_DIR || "./downloads";
  const maxAge = parseInt(process.env.CLEANUP_MAX_AGE_HOURS || "24"); // Default: 24 hours

  try {
    console.log(
      `🧹 Starting cleanup of files older than ${maxAge} hours in ${downloadDir}`
    );

    const files = await fs.readdir(downloadDir);
    const carFiles = files.filter((file) => file.endsWith(".car"));

    let deletedCount = 0;
    let skippedCount = 0;

    for (const file of carFiles) {
      const filePath = path.join(downloadDir, file);
      const stats = await fs.stat(filePath);
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

      if (ageHours > maxAge) {
        try {
          await fs.unlink(filePath);
          console.log(`🗑️ Deleted: ${file} (${ageHours.toFixed(1)} hours old)`);
          deletedCount++;
        } catch (error) {
          console.error(`❌ Failed to delete ${file}:`, error.message);
        }
      } else {
        console.log(`⏭️ Skipped: ${file} (${ageHours.toFixed(1)} hours old)`);
        skippedCount++;
      }
    }

    console.log(
      `✅ Cleanup complete: ${deletedCount} deleted, ${skippedCount} skipped`
    );
  } catch (error) {
    console.error("❌ Cleanup failed:", error.message);
    process.exit(1);
  }
}

cleanupOldFiles();
