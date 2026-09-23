// A deliberately quiet transition between secure sign-in and the operating
// workspace. The wordmark is the existing STERN asset, revealed left-to-right;
// there is no spinner, percentage, or infrastructure branding for the user to
// interpret.
export default function SessionBoot({ label = "Opening workspace", detail }) {
  return (
    <main className="stern-boot grid min-h-dvh place-items-center px-6" aria-busy="true">
      <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
        <span className="stern-boot-mark" aria-hidden="true" />
        <div className="stern-boot-copy mt-7">
          <p className="text-[13px] font-medium text-navy">{label}</p>
          {detail ? <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-ink-dim">{detail}</p> : null}
        </div>
      </div>
    </main>
  );
}
