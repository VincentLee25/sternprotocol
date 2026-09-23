import { useLanguage } from "../lib/language.jsx";

export default function LanguageToggle({ compact = false }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className={`relative inline-grid grid-cols-2 rounded-full border border-navy/10 bg-surface p-1 text-[11px] font-semibold tracking-[.04em] ${compact ? "h-8 w-[74px]" : "h-9 w-[84px]"}`} role="group" aria-label="Language">
      <span aria-hidden="true" className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-navy transition-transform duration-200 ${language === "id" ? "translate-x-full" : "translate-x-0"}`} />
      <button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"} className={`relative z-10 flex cursor-pointer items-center justify-center transition-colors ${language === "en" ? "text-white" : "text-ink-dim hover:text-navy"}`}>EN</button>
      <button type="button" onClick={() => setLanguage("id")} aria-pressed={language === "id"} className={`relative z-10 cursor-pointer transition-colors ${language === "id" ? "text-white" : "text-ink-dim hover:text-navy"}`}>ID</button>
    </div>
  );
}
