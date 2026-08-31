// Placeholder for real photography of Belawan / Tanjung Priok at dusk,
// duotoned to navy shadows and teal midtones. See docs/07_DESIGN_SYSTEM.md §5.6.
export default function PortPlate() {
  return (
    <svg
      viewBox="0 0 420 560"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Container terminal silhouetted at dusk"
      className="block h-full w-full"
    >
      <defs>
        <linearGradient id="pp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#131C28" />
          <stop offset="34%" stopColor="#24384E" />
          <stop offset="66%" stopColor="#3E6C7D" />
          <stop offset="88%" stopColor="#6E9EAE" />
          <stop offset="100%" stopColor="#8CB4C0" />
        </linearGradient>
        <radialGradient id="pp-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E7D9C4" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#C9B99F" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#C9B99F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pp-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3A5D6C" />
          <stop offset="22%" stopColor="#22394A" />
          <stop offset="100%" stopColor="#0A1017" />
        </linearGradient>
      </defs>

      <rect width="420" height="560" fill="url(#pp-sky)" />
      <circle cx="292" cy="352" r="132" fill="url(#pp-sun)" />
      <circle cx="292" cy="356" r="26" fill="#EFE3D1" opacity="0.34" />

      <g fill="none" stroke="#0D141C" strokeWidth="5.5" opacity="0.97">
        <path d="M46 418 V206 M94 418 V206 M32 206 H108 M70 206 V172 M24 172 H200" />
        <path d="M206 418 V226 M254 418 V226 M192 226 H268 M230 226 V194 M186 194 H358" />
        <path d="M336 418 V214 M384 418 V214 M322 214 H398 M360 214 V182 M316 182 H436" />
      </g>

      <g>
        <rect x="8" y="386" width="60" height="15" fill="#1B2B3C" />
        <rect x="8" y="402" width="60" height="15" fill="#12202E" />
        <rect x="72" y="370" width="60" height="15" fill="#2E5265" />
        <rect x="72" y="386" width="60" height="15" fill="#12202E" />
        <rect x="72" y="402" width="60" height="15" fill="#1B2B3C" />
        <rect x="136" y="386" width="60" height="15" fill="#12202E" />
        <rect x="136" y="402" width="60" height="15" fill="#24384E" />
        <rect x="200" y="354" width="60" height="15" fill="#1B2B3C" />
        <rect x="200" y="370" width="60" height="15" fill="#12202E" />
        <rect x="200" y="386" width="60" height="15" fill="#2E5265" />
        <rect x="200" y="402" width="60" height="15" fill="#12202E" />
        <rect x="264" y="370" width="60" height="15" fill="#24384E" />
        <rect x="264" y="386" width="60" height="15" fill="#12202E" />
        <rect x="264" y="402" width="60" height="15" fill="#1B2B3C" />
        <rect x="328" y="386" width="60" height="15" fill="#12202E" />
        <rect x="328" y="402" width="60" height="15" fill="#2E5265" />
        <rect x="392" y="370" width="60" height="15" fill="#1B2B3C" />
        <rect x="392" y="386" width="60" height="15" fill="#24384E" />
        <rect x="392" y="402" width="60" height="15" fill="#12202E" />
      </g>

      <rect y="419" width="420" height="141" fill="url(#pp-water)" />
      <rect y="417" width="420" height="2.5" fill="#0A1017" />
      <g fill="#8CB4C0" opacity="0.13">
        <rect x="252" y="432" width="80" height="2" />
        <rect x="268" y="444" width="52" height="2" />
        <rect x="240" y="458" width="106" height="2" />
        <rect x="276" y="472" width="40" height="2" />
      </g>
      <g fill="#6E9EAE" opacity="0.09">
        <rect x="34" y="438" width="120" height="2" />
        <rect x="86" y="466" width="168" height="2" />
      </g>
    </svg>
  );
}
