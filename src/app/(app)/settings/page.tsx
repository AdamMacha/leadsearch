import type { Metadata } from "next";
import { connection } from "next/server";
import { IconCheck, IconExternal } from "@/components/icons";
import { config, integrationStatus } from "@/lib/config";
import { repo } from "@/lib/db";

export const metadata: Metadata = { title: "Nastavení" };

const GUIDES = [
  {
    key: "database",
    name: "Supabase (databáze)",
    env: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    required: true,
    steps: [
      "Založ projekt na supabase.com (Free plán, region Frankfurt).",
      "SQL Editor → vlož obsah souboru supabase/schema.sql → Run.",
      "Project Settings → API: zkopíruj Project URL a service_role klíč.",
    ],
    link: "https://supabase.com/dashboard",
  },
  {
    key: "places",
    name: "Google Places API",
    env: ["GOOGLE_PLACES_API_KEY"],
    required: true,
    steps: [
      "V Google Cloud Console založ projekt a přidej billing účet (karta, ale v rámci free kvóty se nic neplatí).",
      "APIs & Services → Library → povol „Places API (New)“ a „PageSpeed Insights API“.",
      "Credentials → Create API key → omez ho jen na tyto 2 API.",
      "Billing → Budgets & alerts → nastav rozpočet např. 1 USD s upozorněním.",
    ],
    link: "https://console.cloud.google.com/apis/library/places.googleapis.com",
  },
  {
    key: "pageSpeed",
    name: "PageSpeed Insights",
    env: ["PAGESPEED_API_KEY (volitelné, jinak se použije Places klíč)"],
    required: true,
    steps: ["Stačí povolit PageSpeed Insights API ve stejném projektu jako Places. Zdarma 25 000 dotazů denně."],
    link: "https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com",
  },
  {
    key: "gemini",
    name: "Gemini AI",
    env: ["GEMINI_API_KEY", "GEMINI_MODEL (volitelné)"],
    required: false,
    steps: ["Na aistudio.google.com → Get API key → Create API key. Free tier stačí. Bez klíče se použijí šablony."],
    link: "https://aistudio.google.com/apikey",
  },
  {
    key: "telegram",
    name: "Telegram notifikace",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    required: false,
    steps: [
      "V Telegramu napiš @BotFather → /newbot → získáš token.",
      "Napiš svému botovi libovolnou zprávu, pak otevři api.telegram.org/bot<TOKEN>/getUpdates a zkopíruj chat.id.",
      "Přijde ti zpráva pokaždé, když klient otevře audit.",
    ],
    link: "https://t.me/BotFather",
  },
  {
    key: "email",
    name: "Odesílání e-mailů na 1 kliknutí (SMTP)",
    env: ["SMTP_USER", "SMTP_PASS", "SMTP_HOST (výchozí: smtp.seznam.cz)", "SMTP_PORT (výchozí: 465)"],
    required: false,
    steps: [
      "Umožňuje odesílat vygenerované e-maily klientům přímo z aplikace stiskem jednoho tlačítka.",
      "Pro Seznam Email Profi (technologio.eu): SMTP_USER je tvůj e-mail, SMTP_PASS je heslo (při 2FA vygeneruj 'Heslo pro aplikace' v Seznam profilu).",
      "Funguje i s Google Workspace, Resend nebo jakýmkoliv jiným SMTP serverem.",
    ],
  },
  {
    key: "password",
    name: "Heslo do aplikace",
    env: ["APP_PASSWORD", "SESSION_SECRET (náhodný řetězec 32+ znaků)"],
    required: true,
    steps: ["Na produkci povinné. Vygeneruj secret např. příkazem: openssl rand -base64 32"],
  },
] as const;

export default async function SettingsPage() {
  await connection();
  const status = integrationStatus();
  const dbKind = repo().kind;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Nastavení</h1>
          <p>Stav integrací. Proměnné nastav v <code>.env.local</code> lokálně a ve Vercel → Settings → Environment Variables na produkci.</p>
        </div>
      </header>

      {dbKind === "local" && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Běžíš s lokální databází (<code>.data/db.json</code>). Na Vercelu je potřeba Supabase.
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
        {GUIDES.map((g) => {
          const ok = status[g.key];
          return (
            <section key={g.key} className="card">
              <div className="card-title">
                <h3>{g.name}</h3>
                {ok ? (
                  <span className="badge badge-good"><IconCheck size={12} /> aktivní</span>
                ) : (
                  <span className={`badge ${g.required ? "badge-warn" : ""}`}>{g.required ? "nenastaveno" : "volitelné"}</span>
                )}
              </div>
              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                {g.env.map((e) => <code key={e} className="badge">{e}</code>)}
              </div>
              <ol className="stack small text-2" style={{ paddingLeft: 18, gap: 6 }}>
                {g.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              {"link" in g && g.link && (
                <a href={g.link} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ marginTop: 14 }}>
                  Otevřít <IconExternal size={12} />
                </a>
              )}
            </section>
          );
        })}

        <section className="card">
          <div className="card-title"><h3>Audit stránky & podpis</h3></div>
          <dl className="stack small">
            <div className="row" style={{ justifyContent: "space-between" }}><dt className="muted">AUDIT_BASE_URL</dt><dd><code>{config.auditBaseUrl}</code></dd></div>
            <div className="row" style={{ justifyContent: "space-between" }}><dt className="muted">AUDIT_HOST</dt><dd><code>{process.env.AUDIT_HOST || "–"}</code></dd></div>
            <div className="row" style={{ justifyContent: "space-between" }}><dt className="muted">Podpis</dt><dd>{config.sender.name}, {config.sender.company}</dd></div>
            <div className="row" style={{ justifyContent: "space-between" }}><dt className="muted">E-mail / telefon</dt><dd>{config.sender.email || "–"} / {config.sender.phone || "–"}</dd></div>
          </dl>
          <p className="small muted" style={{ marginTop: 12 }}>
            Pro <code>audit.technologio.eu</code>: přidej doménu ve Vercel projektu, u DNS nastav CNAME na <code>cname.vercel-dns.com</code>,
            pak AUDIT_HOST=audit.technologio.eu a AUDIT_BASE_URL=https://audit.technologio.eu.
          </p>
        </section>
      </div>
    </div>
  );
}
