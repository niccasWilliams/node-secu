import crypto from "crypto";

/**
 * Generates a unique workflow ID with format: WF_<timestamp>_<hash>
 *
 * Example: WF_1732800000_a3b5c7d9
 *
 * @param workflowType - Optional workflow type to include in hash generation
 * @returns Unique workflow ID string
 */
export function generateWorkflowId(workflowType?: string): string {
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

  // Generate a random hash using crypto
  const randomBytes = crypto.randomBytes(4);
  const hash = randomBytes.toString("hex");

  // Optionally mix in workflow type for better uniqueness
  let finalHash = hash;
  if (workflowType) {
    const typeHash = crypto
      .createHash("sha256")
      .update(`${workflowType}-${timestamp}-${hash}`)
      .digest("hex")
      .substring(0, 8);
    finalHash = typeHash;
  }

  return `WF_${timestamp}_${finalHash}`;
}

/**
 * Validates if a string is a valid workflow ID format
 *
 * @param id - String to validate
 * @returns true if valid workflow ID format
 */
export function isValidWorkflowId(id: string): boolean {
  const pattern = /^WF_\d+_[a-f0-9]{8}$/;
  return pattern.test(id);
}

/**
 * Extracts the timestamp from a workflow ID
 *
 * @param workflowId - Workflow ID to extract from
 * @returns Unix timestamp in seconds, or null if invalid
 */
export function extractTimestampFromWorkflowId(workflowId: string): number | null {
  if (!isValidWorkflowId(workflowId)) {
    return null;
  }

  const parts = workflowId.split("_");
  if (parts.length !== 3) {
    return null;
  }

  const timestamp = parseInt(parts[1], 10);
  return isNaN(timestamp) ? null : timestamp;
}

/**
 * Gets the creation date from a workflow ID
 *
 * @param workflowId - Workflow ID to extract from
 * @returns Date object, or null if invalid
 */
export function getWorkflowCreationDate(workflowId: string): Date | null {
  const timestamp = extractTimestampFromWorkflowId(workflowId);
  return timestamp ? new Date(timestamp * 1000) : null;
}
