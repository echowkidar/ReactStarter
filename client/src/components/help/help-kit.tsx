// Help kit — one look for every user guide in the app (department and admin / section guides).
// Content is plain data in two languages (English and easy Hindi); the reader picks the language
// (remembered in this browser). Inline **bold** is supported in every text.
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BookOpen, ChevronRight, HelpCircle, Info, Lightbulb, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Lang = "en" | "hi";
/** A text in both languages */
export type Bi = { en: string; hi: string };

export type HelpBlock =
  | { kind: "para"; text: Bi }
  | { kind: "steps"; items: Bi[] }              // numbered steps
  | { kind: "list"; items: Bi[] }               // bullet points
  | { kind: "tip"; text: Bi }                   // green box
  | { kind: "note"; text: Bi }                  // blue box
  | { kind: "warn"; text: Bi }                  // amber box
  | { kind: "terms"; items: { term: Bi; text: Bi }[] } // label → meaning (e.g. statuses)
  | { kind: "faq"; items: { q: Bi; a: Bi }[] };

export type HelpTopic = {
  id: string;                 // anchor, unique on the page
  icon: LucideIcon;
  title: Bi;
  summary: Bi;                // one line under the title
  group?: Bi;                 // optional group heading in the contents list
  blocks: HelpBlock[];
};

const LANG_KEY = "helpLang";
const UI: Record<string, Bi> = {
  search: { en: "Search the guide…", hi: "गाइड में खोजें…" },
  contents: { en: "Contents", hi: "विषय-सूची" },
  quick: { en: "Quick start", hi: "शुरुआत कैसे करें" },
  none: { en: "Nothing found. Try another word.", hi: "कुछ नहीं मिला। कोई और शब्द लिखकर देखें।" },
  faq: { en: "Questions", hi: "सवाल-जवाब" },
  tip: { en: "Tip", hi: "सुझाव" },
  note: { en: "Note", hi: "ध्यान दें" },
  warn: { en: "Careful", hi: "सावधान" },
  jump: { en: "Go to topic", hi: "विषय चुनें" },
  top: { en: "Back to top", hi: "ऊपर जाएँ" },
};

/** The reader's language, remembered in this browser */
export function useHelpLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem(LANG_KEY) === "hi" ? "hi" : "en"; } catch { return "en"; }
  });
  const set = (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ } };
  return [lang, set];
}

/** Text with **bold** parts */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**")
    ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
    : <span key={i}>{p}</span>))}</>;
}

const textOf = (b: HelpBlock, l: Lang): string => {
  switch (b.kind) {
    case "para": case "tip": case "note": case "warn": return b.text[l];
    case "steps": case "list": return b.items.map((i) => i[l]).join(" ");
    case "terms": return b.items.map((i) => `${i.term[l]} ${i.text[l]}`).join(" ");
    case "faq": return b.items.map((i) => `${i.q[l]} ${i.a[l]}`).join(" ");
  }
};

function Callout({ kind, text, lang }: { kind: "tip" | "note" | "warn"; text: Bi; lang: Lang }) {
  const s = {
    tip: { Icon: Lightbulb, box: "border-emerald-200 bg-emerald-50", icon: "text-emerald-600", label: "text-emerald-800" },
    note: { Icon: Info, box: "border-blue-200 bg-blue-50", icon: "text-blue-600", label: "text-blue-800" },
    warn: { Icon: AlertTriangle, box: "border-amber-200 bg-amber-50", icon: "text-amber-600", label: "text-amber-800" },
  }[kind];
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-[14px] leading-relaxed text-slate-700", s.box)}>
      <s.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.icon)} />
      <div><span className={cn("mr-1 font-semibold", s.label)}>{UI[kind][lang]}:</span><Rich text={text[lang]} /></div>
    </div>
  );
}

function Block({ b, lang }: { b: HelpBlock; lang: Lang }) {
  switch (b.kind) {
    case "para":
      return <p className="text-[14.5px] leading-relaxed text-slate-700"><Rich text={b.text[lang]} /></p>;
    case "steps":
      return (
        <ol className="space-y-2.5">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-slate-700">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
              <span className="pt-0.5"><Rich text={it[lang]} /></span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="space-y-1.5">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-[14.5px] leading-relaxed text-slate-700">
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-blue-500" /><span><Rich text={it[lang]} /></span>
            </li>
          ))}
        </ul>
      );
    case "tip": case "note": case "warn":
      return <Callout kind={b.kind} text={b.text} lang={lang} />;
    case "terms":
      return (
        <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {b.items.map((it, i) => (
            <div key={i} className="grid gap-1 bg-white px-4 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-[13.5px] font-semibold text-slate-900"><Rich text={it.term[lang]} /></dt>
              <dd className="text-[14px] leading-relaxed text-slate-700"><Rich text={it.text[lang]} /></dd>
            </div>
          ))}
        </dl>
      );
    case "faq":
      return (
        <div className="space-y-2">
          {b.items.map((it, i) => (
            <details key={i} className="group rounded-lg border border-slate-200 bg-white px-4 py-2.5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-start gap-2 text-[14.5px] font-medium text-slate-900">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span className="flex-1"><Rich text={it.q[lang]} /></span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 pl-6 text-[14px] leading-relaxed text-slate-700"><Rich text={it.a[lang]} /></p>
            </details>
          ))}
        </div>
      );
  }
}

export function LanguageSwitch({ lang, setLang, className }: { lang: Lang; setLang: (l: Lang) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm", className)} role="radiogroup" aria-label="Language / भाषा">
      {([["en", "English"], ["hi", "हिंदी"]] as const).map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={lang === k} onClick={() => setLang(k)}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            lang === k ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * A complete guide page body: title, language switch, search, quick start, contents and topics.
 * `badge` is a small label next to the title (e.g. the section the guide is for).
 */
export function HelpGuide({ title, intro, badge, quickStart, topics, className }: {
  title: Bi; intro: Bi; badge?: Bi; quickStart?: Bi[]; topics: HelpTopic[]; className?: string;
}) {
  const [lang, setLang] = useHelpLang();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(topics[0]?.id ?? "");
  const topRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q
    ? topics.filter((t) => [t.title[lang], t.summary[lang], ...t.blocks.map((b) => textOf(b, lang)), t.title.en, t.summary.en]
      .join(" ").toLowerCase().includes(q))
    : topics), [q, lang, topics]);

  // Highlight the topic being read in the contents list
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id.replace(/^help-/, ""));
    }, { rootMargin: "-90px 0px -60% 0px" });
    shown.forEach((t) => { const el = document.getElementById(`help-${t.id}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [shown]);

  const go = (id: string) => {
    document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  // Contents list, with optional group headings
  const groups: { label?: string; items: HelpTopic[] }[] = [];
  for (const t of shown) {
    const g = t.group?.[lang];
    const last = groups[groups.length - 1];
    if (last && last.label === g) last.items.push(t); else groups.push({ label: g, items: [t] });
  }

  return (
    <div ref={topRef} className={cn("mx-auto w-full max-w-6xl", className)}>
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2a5f] via-[#1e3a8a] to-[#1d4ed8] px-5 py-6 text-white shadow-sm sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:radial-gradient(circle_at_90%_-10%,#fff_0,transparent_45%)]" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15"><BookOpen className="h-6 w-6" /></div>
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title[lang]}</h1>
              {badge && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{badge[lang]}</span>}
            </div>
            <p className="mt-1.5 max-w-3xl text-[14.5px] leading-relaxed text-blue-100"><Rich text={intro[lang]} /></p>
          </div>
          <LanguageSwitch lang={lang} setLang={setLang} className="border-white/20 bg-white/10 [&_button:not([aria-checked=true])]:text-blue-50 [&_button:not([aria-checked=true]):hover]:bg-white/10 [&_button[aria-checked=true]]:bg-white [&_button[aria-checked=true]]:text-blue-800" />
        </div>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={UI.search[lang]} aria-label={UI.search[lang]}
            className="h-11 w-full rounded-xl border-0 bg-white pl-9 pr-9 text-[15px] text-slate-900 shadow-sm outline-none ring-2 ring-transparent placeholder:text-slate-400 focus:ring-blue-300" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick start */}
      {quickStart?.length && !q ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{UI.quick[lang]}</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickStart.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[14px] leading-relaxed text-slate-700">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{i + 1}</span>
                <span><Rich text={s[lang]} /></span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[250px_1fr]">
        {/* Contents */}
        <nav className="hidden lg:block" aria-label={UI.contents[lang]}>
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{UI.contents[lang]}</p>
            {groups.map((g, gi) => (
              <div key={gi} className={gi ? "mt-3" : undefined}>
                {g.label && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>}
                {g.items.map((t) => (
                  <button key={t.id} type="button" onClick={() => go(t.id)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13.5px] transition-colors",
                      active === t.id ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}>
                    <t.icon className="h-4 w-4 shrink-0" /><span className="truncate">{t.title[lang]}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          {/* Contents on phones / tablets */}
          <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 lg:hidden"
            value="" onChange={(e) => e.target.value && go(e.target.value)} aria-label={UI.jump[lang]}>
            <option value="">{UI.jump[lang]}…</option>
            {shown.map((t) => <option key={t.id} value={t.id}>{t.title[lang]}</option>)}
          </select>

          {shown.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{UI.none[lang]}</div>
          )}

          {shown.map((t) => (
            <section key={t.id} id={`help-${t.id}`} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><t.icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-slate-900">{t.title[lang]}</h2>
                  <p className="text-[13.5px] text-slate-500"><Rich text={t.summary[lang]} /></p>
                </div>
              </header>
              <div className="space-y-4 px-5 py-5 sm:px-6">
                {t.blocks.map((b, i) => <Block key={i} b={b} lang={lang} />)}
              </div>
            </section>
          ))}

          {shown.length > 2 && (
            <div className="flex justify-end">
              <button type="button" onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">↑ {UI.top[lang]}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
