// Canned /oracle/evidence responses for the four states the diagnostic must
// tell apart.
const http = require("node:http");
const now = () => Math.floor(Date.now() / 1000);
const CASES = {
  // nothing committed yet
  1: () => ({ simulation: { enabled: false, fault: "none" }, comparison: {
      inspected: { onchainProofSubmitted: false, currentSourcePasses: true },
      shipped: {}, arrived_cleared: {} },
      committedDiscrepancies: [], disputeDemo: { actionable: false, reason: "No committed proof currently conflicts." } }),
  // committed, no fault on
  2: () => ({ simulation: { enabled: false, fault: "none" }, comparison: {
      inspected: { onchainProofSubmitted: true, currentSourcePasses: true, challengeDeadlineUnix: String(now() + 80) },
      shipped: {}, arrived_cleared: {} },
      committedDiscrepancies: [], disputeDemo: { actionable: false, reason: "No committed proof currently conflicts." } }),
  // discrepancy, window OPEN -> actionable
  3: () => ({ simulation: { enabled: true, fault: "ais" }, comparison: {
      inspected: { onchainProofSubmitted: true, currentSourcePasses: true, challengeDeadlineUnix: String(now() - 500) },
      shipped: { onchainProofSubmitted: true, currentSourcePasses: false, challengeDeadlineUnix: String(now() + 65) },
      arrived_cleared: {} },
      committedDiscrepancies: [{ milestone: "shipped", challengeDeadlineUnix: String(now() + 65) }],
      disputeDemo: { actionable: true, reason: "A committed proof conflicts and the window is open." } }),
  // discrepancy, window CLOSED  (their case)
  4: () => ({ simulation: { enabled: true, fault: "ais" }, comparison: {
      inspected: { onchainProofSubmitted: true, currentSourcePasses: true, challengeDeadlineUnix: String(now() - 600) },
      shipped: { onchainProofSubmitted: true, currentSourcePasses: false, challengeDeadlineUnix: String(now() - 120) },
      arrived_cleared: { onchainProofSubmitted: false, currentSourcePasses: true } },
      committedDiscrepancies: [{ milestone: "shipped", challengeDeadlineUnix: String(now() - 120) }],
      disputeDemo: { actionable: false, reason: "the applicable challenge window has closed." } }),
  // committed, fault on the WRONG feed
  5: () => ({ simulation: { enabled: true, fault: "customs" }, comparison: {
      inspected: { onchainProofSubmitted: true, currentSourcePasses: true, challengeDeadlineUnix: String(now() + 70) },
      shipped: {}, arrived_cleared: {} },
      committedDiscrepancies: [], disputeDemo: { actionable: false, reason: "No committed proof currently conflicts." } })
};
http.createServer((req, res) => {
  const m = /^\/oracle\/evidence\/(\d+)/.exec(req.url);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(m && CASES[m[1]] ? CASES[m[1]]() : {}));
}).listen(4791, () => console.log("ev stub 4791"));
