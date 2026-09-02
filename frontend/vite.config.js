import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import particleWasmPlugin from "@particle-network/vite-plugin-wasm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // REQUIRED by the Particle SDK. Its MPC-TSS module ships as WebAssembly
    // (@particle-network/thresh-sig), and Vite's esbuild dep pre-bundling
    // mangles the wasm-bindgen glue. Without this the app builds and the login
    // modal opens, then signing dies on
    // "Cannot read properties of undefined (reading '__wbindgen_add_to_stack_pointer')".
    particleWasmPlugin(),
    // @particle-network/auth-core pulls in @aws-sdk/credential-providers, which
    // imports node:os / node:fs / node:crypto. That code never runs in a
    // browser, but Rollup still has to resolve it, and without polyfills the
    // build dies on `homedir` from node:os.
    // `protocolImports` matters: the AWS SDK writes `node:os`, not `os`, and the
    // plugin ignores the prefixed form unless this is on.
    nodePolyfills({
      include: ["buffer", "crypto", "fs", "os", "path", "stream", "util"],
      protocolImports: true
    })
  ],
  resolve: {
    // @particle-network/authkit ships its own nested react-dom@19 while this app
    // runs React 18. Two copies of react-dom in one bundle throw "Invalid hook
    // call" at the first Particle hook, so force a single copy of each.
    dedupe: ["react", "react-dom"],
    alias: Object.fromEntries(
      // The Node-only providers in the AWS credential chain, all reached through
      // lazy imports Particle never takes in a browser. See the stub for why.
      [
        "@aws-sdk/credential-provider-ini",
        "@aws-sdk/credential-provider-process",
        "@aws-sdk/credential-provider-sso",
        "@aws-sdk/credential-provider-node",
        "@aws-sdk/credential-provider-login",
        "@aws-sdk/token-providers",
        "@aws-sdk/credential-provider-web-identity"
      ].map((pkg) => [pkg, path.resolve(__dirname, "src/lib/aws-node-providers-stub.js")])
    )
  },
  define: {
    // Several Web3 deps read `global`, which exists in Node but not the browser.
    global: "globalThis"
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
