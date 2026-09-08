import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Card, CardTitle, Notice, Tag, TermRow } from "../components/ui.jsx";
import { getOracleStatus, getVerifiers, getHealth, API_BASE, apiConfigured } from "../lib/sternApi.js";
import { CHAIN_ID, particleEnabled, missingCredentials } from "../lib/particle.js";
import { ESCROW_ADDRESS, IDRT_ADDRESS, contractsConfigured, contractsWithoutWallet } from "../lib/sternContract.js";
import { gaslessConfigured } from "../lib/smartAccount.js";
import { sourceIsLive, sourceLabel } from "../lib/escrowSource.js";
import { shortAddress } from "../lib/actors.js";

/*
 * Environment health, DESIGN.md section 11.
 *
 * Read-only and derived: every value on this page comes from build-time config
 * this app already reads, or from the two gateway endpoints it already calls
 * elsewhere. Nothing new is requested, nothing is written, and no secret is
 * rendered — the Particle and Pimlico keys are reported as present or absent,
 * never printed.
 */

const CHAIN_NAMES = { 137: "Polygon mainnet", 80002: "Polygon Amoy testnet", 31337: "Local Hardhat" };

// The four states DESIGN.md requires this page to label explicitly.
const AVAILABILITY = {
  live: { tone: "attested", label: "Live provider" },
  testnet: { tone: "teal", label: "Testnet" },
  simulation: { tone: "pending", label: "Simulation" },
  unavailable: { tone: "disputed", label: "Unavailable" }
};

export default function IntegrationStatus({ walletAddress }) {
  const [gateway, setGateway] = useState({ state: "loading" });
  const [oracle, setOracle] = useState(null);
  const [verifiers, setVerifiers] = useState([]);

  useEffect(() => {
    if (!apiConfigured) {
      setGateway({ state: "unconfigured" });
      return undefined;
    }

    const controller = new AbortController();
    (async () => {
      try {
        const health = await getHealth({ signal: controller.signal });
        setGateway({ state: health?.ok === false ? "down" : "up", detail: health });
      } catch (err) {
        if (err.name !== "AbortError") setGateway({ state: "down", detail: { error: err.message } });
      }
      // Both are optional detail. A gateway that answers /health but not these
      // is still a working gateway, so a failure here narrows the page rather
      // than breaking it.
      getOracleStatus({ signal: controller.signal }).then(setOracle).catch(() => {});
      getVerifiers({ signal: controller.signal })
        .then((r) => setVerifiers(r?.verifiers || []))
        .catch(() => {});
    })();

    return () => controller.abort();
  }, []);

  const chainName = CHAIN_NAMES[CHAIN_ID] || `Chain ${CHAIN_ID}`;
  const isTestnet = CHAIN_ID !== 137;

  const gatewayAvailability =
    gateway.state === "unconfigured"
      ? AVAILABILITY.unavailable
      : gateway.state === "up"
        ? isTestnet
          ? AVAILABILITY.testnet
          : AVAILABILITY.live
        : gateway.state === "loading"
          ? { tone: "neutral", label: "Checking" }
          : AVAILABILITY.unavailable;

  return (
    <div className="space-y-6">
      {/* The single sentence an operator needs before reading anything else. */}
      {!sourceIsLive ? (
        <Notice tone="pending">
          <strong className="font-semibold">Simulation.</strong> No oracle gateway is configured, so
          escrows, evidence and activity all come from local mock state. Set{" "}
          <code className="font-mono text-[12px]">VITE_ORACLE_API</code> to read the real registry.
        </Notice>
      ) : null}

      {contractsWithoutWallet ? (
        <Notice tone="pending">
          Contract addresses are set but the Particle keys are not, so there is no wallet to sign
          with and every action stays read-only.
        </Notice>
      ) : missingCredentials ? (
        <Notice tone="pending">
          Particle credentials are missing from <code className="font-mono text-[12px]">.env</code>,
          so sign-in creates no wallet and the app runs on demo data.
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardTitle
            hint="Where transactions are sent and which contracts they reach."
            action={<Tag tone={isTestnet ? "teal" : "attested"}>{isTestnet ? "Testnet" : "Mainnet"}</Tag>}
          >
            Network and contracts
          </CardTitle>
          <div className="divide-y divide-sky/70">
            <TermRow label="Network" value={chainName} />
            <TermRow label="Chain ID" value={String(CHAIN_ID)} />
            <AddressRow label="Escrow contract" address={ESCROW_ADDRESS} />
            <AddressRow label="IDRT-demo token" address={IDRT_ADDRESS} />
            <TermRow
              label="Contract configuration"
              value={contractsConfigured ? "Both addresses valid" : "Incomplete"}
              tone={contractsConfigured ? "attested" : "pending"}
            />
          </div>
        </Card>

        <Card>
          <CardTitle
            hint="The trusted signer that relays milestone proofs on chain."
            action={<Tag tone={gatewayAvailability.tone} dot>{gatewayAvailability.label}</Tag>}
          >
            Oracle gateway
          </CardTitle>
          <div className="divide-y divide-sky/70">
            <TermRow label="Endpoint" value={API_BASE || "not configured"} truncate />
            <TermRow
              label="Reachability"
              value={
                gateway.state === "loading"
                  ? "Checking…"
                  : gateway.state === "up"
                    ? "Responding"
                    : gateway.state === "unconfigured"
                      ? "No endpoint set"
                      : "Not responding"
              }
              tone={gateway.state === "up" ? "attested" : gateway.state === "loading" ? undefined : "disputed"}
            />
            <TermRow label="Escrow source" value={sourceLabel} />
            {oracle?.chainId != null ? (
              <TermRow label="Gateway chain" value={String(oracle.chainId)} />
            ) : null}
            {oracle?.contractAddress ? (
              <AddressRow label="Gateway contract" address={oracle.contractAddress} />
            ) : null}
          </div>
        </Card>

        <Card>
          <CardTitle hint="How this browser session signs, and who pays for it.">
            Session and signing
          </CardTitle>
          <div className="divide-y divide-sky/70">
            <TermRow
              label="Particle wallet"
              value={particleEnabled ? "Configured" : "Not configured"}
              tone={particleEnabled ? "attested" : "pending"}
            />
            <TermRow
              label="Gas sponsorship"
              value={gaslessConfigured ? "Pimlico paymaster" : "Not configured"}
              tone={gaslessConfigured ? "attested" : "pending"}
            />
            <AddressRow label="Your Smart Account" address={walletAddress} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            Keys are reported as present or absent only. No credential from{" "}
            <code className="font-mono text-[12px]">.env</code> is rendered on this page.
          </p>
        </Card>

        <Card>
          <CardTitle
            hint="Institutions holding a verifier role, and the bond behind each signature."
            action={verifiers.length ? <Tag tone="neutral">{verifiers.length} registered</Tag> : null}
          >
            Verifier institutions
          </CardTitle>

          {gateway.state === "loading" ? (
            <p className="flex items-center gap-2 text-[14px] text-ink-dim">
              <Loader2 size={14} className="animate-spin text-teal" aria-hidden="true" />
              Reading the register…
            </p>
          ) : verifiers.length === 0 ? (
            <p className="text-[14px] leading-relaxed text-ink-dim">
              No verifier register available. The gateway exposes this on{" "}
              <code className="font-mono text-[12px]">/verifiers</code> once it is running against a
              deployed contract.
            </p>
          ) : (
            <ul className="divide-y divide-sky/70">
              {verifiers.map((v, i) => (
                <li key={v.address || v.role || i} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-navy">
                      {v.name || String(v.role || "Verifier").replace(/_/g, " ")}
                    </p>
                    <p className="truncate font-mono text-2xs text-ink-faint">
                      {shortAddress(v.address) || "address not reported"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] tabular-nums text-navy">
                      bond {(Number(v.bond) / 100 || 0).toFixed(2)}
                    </p>
                    <p
                      className={`text-2xs ${
                        Number(v.slashCount) > 0 ? "text-state-disputed" : "text-ink-faint"
                      }`}
                    >
                      {Number(v.slashCount) > 0 ? `${v.slashCount} slashed` : "no slashes"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle hint="What each label on this page means when you read it in a report.">
          Reading these labels
        </CardTitle>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LabelKey tag={AVAILABILITY.live}>
            Answering, and pointed at a production network.
          </LabelKey>
          <LabelKey tag={AVAILABILITY.testnet}>
            Answering, but on a test chain. Values are not real money.
          </LabelKey>
          <LabelKey tag={AVAILABILITY.simulation}>
            No provider behind it. Responses are generated locally for the demo.
          </LabelKey>
          <LabelKey tag={AVAILABILITY.unavailable}>
            Configured but not answering, or not configured at all.
          </LabelKey>
        </dl>
      </Card>
    </div>
  );
}

/* ---------------------------------- parts --------------------------------- */

function LabelKey({ tag, children }) {
  return (
    <div>
      <dt>
        <Tag tone={tag.tone} dot>
          {tag.label}
        </Tag>
      </dt>
      <dd className="mt-2 text-[13px] leading-relaxed text-ink-dim">{children}</dd>
    </div>
  );
}

// Addresses are the one thing an operator copies off this page, so give them a
// real control rather than text they have to select by hand.
function AddressRow({ label, address }) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return <TermRow label={label} value="not set" tone="pending" />;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Blocked on insecure origins; the address is on screen either way.
    }
  }

  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <span className="whitespace-nowrap text-[14px] text-ink-dim">{label}</span>
      <span className="leader h-1 min-w-[16px] flex-1 -translate-y-[3px]" aria-hidden="true" />
      <button
        type="button"
        onClick={copy}
        title={address}
        className="flex min-w-0 shrink cursor-pointer items-center gap-1.5 rounded-panel px-1.5 py-1 transition-colors duration-150 hover:bg-surface-soft"
      >
        <span className="truncate font-mono text-[12px] text-navy">{shortAddress(address)}</span>
        {copied ? (
          <Check size={12} className="shrink-0 text-state-attested" aria-hidden="true" />
        ) : (
          <Copy size={12} className="shrink-0 text-ink-faint" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
