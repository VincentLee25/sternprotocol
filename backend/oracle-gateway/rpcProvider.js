const { ethers } = require("ethers");

const RPC_REQUEST_TIMEOUT_MS = 5000;

function createJsonRpcProvider(url, chainId) {
  const request = new ethers.FetchRequest(url);
  request.timeout = RPC_REQUEST_TIMEOUT_MS;
  if (chainId == null) return new ethers.JsonRpcProvider(request);
  return new ethers.JsonRpcProvider(request, chainId, {
    staticNetwork: true,
    batchMaxCount: 1
  });
}

function createRpcProvider(urls, chainId = 80002) {
  const uniqueUrls = [...new Set((urls || []).filter(Boolean))];
  if (!uniqueUrls.length) throw new Error("At least one RPC URL is required.");
  if (uniqueUrls.length === 1) return createJsonRpcProvider(uniqueUrls[0]);

  const providers = uniqueUrls.map((url) => createJsonRpcProvider(url, chainId));
  // Query the configured endpoint first, then start the next endpoint after a
  // short stall. A single healthy Amoy RPC can answer; one slow provider must
  // not hold escrow reads until its own gateway timeout (often several minutes).
  return new ethers.FallbackProvider(
    providers.map((provider, index) => ({
      provider,
      priority: index + 1,
      weight: 1,
      stallTimeout: 600
    })),
    chainId,
    { quorum: 1 }
  );
}

module.exports = { createRpcProvider, RPC_REQUEST_TIMEOUT_MS };
