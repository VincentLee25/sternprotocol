// Real document hashing for the shipment contract document: the file is
// hashed locally with the browser-native Web Crypto API (SHA-256 —
// efficient for large files, no dependency). The final combination with
// containerRef + commodity uses keccak256 to match how Solidity would hash
// the same fields (keccak256(abi.encodePacked(...))).
import { ethers } from "ethers";

/**
 * @param {string} containerRef
 * @param {string} commodity
 * @param {ArrayBuffer} fileBuffer  e.g. from `await file.arrayBuffer()`
 * @returns {Promise<string>} bytes32 hex string
 */
export async function generateShipmentHash(containerRef, commodity, fileBuffer) {
  if (!containerRef?.trim()) throw new Error("containerRef is required");
  if (!commodity?.trim()) throw new Error("commodity is required");
  if (!(fileBuffer instanceof ArrayBuffer)) {
    throw new Error("fileBuffer must be an ArrayBuffer (e.g. from file.arrayBuffer())");
  }

  const fileDigest = await crypto.subtle.digest("SHA-256", fileBuffer);
  const fileHashHex = ethers.hexlify(new Uint8Array(fileDigest));

  return ethers.solidityPackedKeccak256(
    ["string", "string", "bytes32"],
    [containerRef.trim(), commodity.trim(), fileHashHex]
  );
}

/**
 * Convenience wrapper for <input type="file"> — reads the File, returns the
 * same shape as generateShipmentHash plus display metadata.
 */
export async function hashShipmentDocument(containerRef, commodity, file) {
  const fileBuffer = await file.arrayBuffer();
  const documentHash = await generateShipmentHash(containerRef, commodity, fileBuffer);
  return { documentHash, fileName: file.name, size: file.size };
}
