const CID_PREFIX = "bafybeistern";

function mockUpload(fileName = "electronic-bill-of-lading.pdf") {
  const normalized = fileName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 22);
  return { fileName, cid: `${CID_PREFIX}${normalized || "ebldocument"}`, valid: true };
}

function validateCid(cid, options = {}) {
  const fault = String(options.fault || "none").toLowerCase();
  const forcedFault = fault === "quality" || fault === "ipfs";
  const actualCid = forcedFault ? (cid || `${CID_PREFIX}invalid`) + "-invalid" : cid;
  return {
    fileName: "electronic-bill-of-lading.pdf",
    cid: actualCid,
    valid: typeof actualCid === "string" && actualCid.startsWith(CID_PREFIX) && !forcedFault,
    simulatedFault: forcedFault
  };
}
module.exports = { mockUpload, validateCid };
