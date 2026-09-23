import { useLanguage } from "../lib/language.jsx";

export default function LanguageToggle({ compact = false }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className={`stern-language-toggle inline-flex items-center rounded-full border border-sky bg-white p-0.5 text-[11px] font-semibold tracking-[.04em] ${compact ? "h-8" : "h-9"}`} role="group" aria-label="Language">
      {["en", "id"].map((option) => (
        <button key={option} type="button" onClick={() => setLanguage(option)} aria-label={option === "en" ? "English" : "Bahasa Indonesia"} aria-pressed={language === option} className={`flex h-full min-w-9 cursor-pointer items-center justify-center rounded-full px-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${language === option ? "bg-navy text-white" : "text-navy hover:bg-sky/40"}`}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
