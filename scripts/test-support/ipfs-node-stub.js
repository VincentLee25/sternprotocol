// Stand-in for a Kubo node + public gateway, so the pin/verify path can be
// exercised without reaching the real network. It computes the same CIDs a
// real node would.
const http = require("node:http");
const Hash = require("ipfs-only-hash");

const store = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Pulls the file part out of a multipart body without a parser: find the
// blank line after the part headers, and cut at the trailing boundary.
function extractFilePart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || "");
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary[1] || boundary[2]}`);
  let start = buffer.indexOf(marker);
  if (start < 0) return null;
  const headerEnd = buffer.indexOf("\r\n\r\n", start);
  if (headerEnd < 0) return null;
  const bodyStart = headerEnd + 4;
  const nextBoundary = buffer.indexOf(marker, bodyStart);
  const bodyEnd = nextBoundary < 0 ? buffer.length : nextBoundary - 2;
  return buffer.subarray(bodyStart, bodyEnd);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/v0/add")) {
    const raw = await readBody(req);
    const file = extractFilePart(raw, req.headers["content-type"]);
    if (!file) {
      res.writeHead(400).end("no file part");
      return;
    }
    const swap = process.env.STUB_SWAP_CONTENT === "1";
    const stored = swap ? Buffer.concat([file, Buffer.from("tampered")]) : file;
    const cid = await Hash.of(file, { cidVersion: 0, rawLeaves: false });
    store.set(cid, stored);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ Name: "upload", Hash: cid, Size: String(file.length) }) + "\n");
    return;
  }

  const match = /^\/ipfs\/([^/?]+)/.exec(req.url);
  if (req.method === "GET" && match) {
    const bytes = store.get(match[1]);
    if (!bytes) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length });
    res.end(bytes);
    return;
  }

  res.writeHead(404).end("no route");
});

server.listen(Number(process.env.STUB_PORT || 5599), () => console.log("ipfs stub on", process.env.STUB_PORT || 5599));
