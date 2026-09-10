import { ExternalLink } from "lucide-react";
import { addressUrl, blockUrl, explorerName, linkable, shortHash, txUrl } from "../lib/explorer.js";

/**
 * A transaction hash, as a link to the explorer when there is a real one behind
 * it and as plain text when there is not.
 *
 * Degrading to text rather than hiding is deliberate: on the mock path the hash
 * is still worth showing as a stand-in, it just must not pretend to be
 * checkable. Linking an invented hash lands the visitor on "transaction not
 * found", which reads as a chain that lost our transaction rather than as a
 * demo.
 */
export default function TxLink({ hash, label, className = "" }) {
  if (!hash) return null;
  const href = txUrl(hash);
  const text = label || shortHash(hash);

  if (!href) {
    return (
      <span
        className={`font-mono text-2xs text-ink-faint ${className}`}
        title={linkable(hash) ? hash : `${hash} — demo data, not on chain`}
      >
        {text}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={`${hash} — open on ${explorerName}`}
      className={`inline-flex items-center gap-1 font-mono text-2xs text-teal underline decoration-teal/30 underline-offset-2 transition-colors duration-150 hover:decoration-teal ${className}`}
    >
      {text}
      <ExternalLink size={10} aria-hidden="true" />
      <span className="sr-only">View on {explorerName}</span>
    </a>
  );
}

/** The block a committed proof landed in — see blockUrl for why not a hash. */
export function BlockLink({ blockNumber, className = "" }) {
  if (blockNumber == null) return null;
  const href = blockUrl(blockNumber);
  const text = `#${blockNumber}`;

  if (!href) {
    return <span className={`font-mono text-2xs text-ink-faint ${className}`}>{text}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={`Block ${blockNumber} — open on ${explorerName}`}
      className={`inline-flex items-center gap-1 font-mono text-2xs text-teal underline decoration-teal/30 underline-offset-2 transition-colors duration-150 hover:decoration-teal ${className}`}
    >
      {text}
      <ExternalLink size={10} aria-hidden="true" />
      <span className="sr-only">View on {explorerName}</span>
    </a>
  );
}

/** Same idea for a wallet. Verifier addresses are the ones worth checking. */
export function AddressLink({ address, label, className = "" }) {
  if (!address) return null;
  const href = addressUrl(address);
  const text = label || shortHash(address, 8, 6);

  if (!href) {
    return <span className={`font-mono text-2xs text-ink-faint ${className}`}>{text}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={`${address} — open on ${explorerName}`}
      className={`inline-flex items-center gap-1 font-mono text-2xs text-teal underline decoration-teal/30 underline-offset-2 transition-colors duration-150 hover:decoration-teal ${className}`}
    >
      {text}
      <ExternalLink size={10} aria-hidden="true" />
      <span className="sr-only">View on {explorerName}</span>
    </a>
  );
}
