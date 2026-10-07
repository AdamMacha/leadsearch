# LeadRadar · Technologio

Interní aplikace pro vyhledávání firem, které nutně potřebují nový web (nebo žádný nemají), jejich automatickou technickou analýzu, scoring potřeby nového webu, generování personalizovaných auditů a e-mailových/telefonních nabídek na míru.

---

## 🚀 Rychlý start lokálně

Aplikace funguje i **bez jakýchkoliv klíčů** v lokálním dev režimu (má lokální JSON databázi v `.data/db.json` a šablonový fallback pro audity).

1. **Instalace závislostí:**
   ```bash
   npm install
   ```

2. **Příprava proměnných prostředí:**
   ```bash
   cp .env.example .env.local
   ```
   *(Pokud `APP_PASSWORD` necháš prázdné, v dev režimu se přihlásíš jakýmkoliv heslem).*

3. **Spuštění vývojového serveru:**
   ```bash
   npm run dev
   ```
   Aplikace běží na [http://localhost:3000](http://localhost:3000).

---

## 🔑 Nastavení integrací (přechod na plný provoz)

Všechny integrace využívají **bezplatné úrovně (Free Tier)**. V aplikaci na stránce `/settings` najdeš přehledný stav všech služeb s přímými odkazy.

### 1. Databáze (Supabase) – *Povinné pro produkci / Vercel*
Vercel má read-only souborový systém, proto je pro produkční běh 24/7 nutná Postgres databáze:
1. Založ projekt zdarma na [supabase.com](https://supabase.com) (region např. Frankfurt).
2. V Supabase otevři **SQL Editor** → vlož obsah souboru [`supabase/schema.sql`](file:///Users/adammacha/Projekty%20pr%C3%A1ce%20-%20programov%C3%A1n%C3%AD/ziskani_klientu/supabase/schema.sql) → klikni **Run**.
3. V **Project Settings → API** zkopíruj:
   - `Project URL` → `SUPABASE_URL`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY` *(používá se pouze serverově, RLS chrání anonymní přístup).*

### 2. Hledání firem (Google Places API New)
1. V [Google Cloud Console](https://console.cloud.google.com/) vytvoř projekt a přiřaď platební profil (karta je vyžadována pro aktivaci, ale v rámci měsíčního bezplatného kreditu se nic neúčtuje).
2. Povol **Places API (New)** a **PageSpeed Insights API**.
3. Vygeneruj API klíč a omez ho na tyto dvě služby.
4. Nastav rozpočtový alert (např. 1 USD) pro klid na duši.
5. Ulož do `.env.local` jako `GOOGLE_PLACES_API_KEY`.

### 3. AI generování auditů a zpráv (Google Gemini Flash)
1. Na [aistudio.google.com/apikey](https://aistudio.google.com/apikey) vygeneruj bezplatný API klíč.
2. Ulož do `.env.local` jako `GEMINI_API_KEY`.
3. Model je přednastaven na rychlý a úsporný `gemini-2.5-flash`.

### 4. Notifikace do Telegramu (Volitelné)
Když klient otevře svůj audit, aplikace ti okamžitě pošle zprávu na mobil:
1. V Telegramu napiš [@BotFather](https://t.me/BotFather) → `/newbot` → získej token.
2. Pošli svému novému botovi zprávu (např. "Ahoj").
3. V prohlížeči otevři `https://api.telegram.org/bot<TVUJ_TOKEN>/getUpdates` a zkopíruj `message.chat.id`.
4. Ulož do `TELEGRAM_BOT_TOKEN` a `TELEGRAM_CHAT_ID`.

---

## 🌐 Nasazení na Vercel & Subdoména `audit.technologio.eu`

1. Nahraj projekt do svého GitHubu a naimportuj do Vercelu.
2. Ve Vercel projektu v **Settings → Environment Variables** vyplň proměnné z `.env.example`.
3. Nastav silné `APP_PASSWORD` a vygeneruj `SESSION_SECRET` (např. pomocí `openssl rand -base64 32`).

### Nastavení subdomény pro klienty:
Aplikace má inteligentní Proxy router:
- Na hlavní doméně Vercelu (např. `leadradar.vercel.app`) běží zaheslovaný interní CRM dashboard.
- Pokud nastavíš `AUDIT_HOST=audit.technologio.eu`:
  - Ve Vercelu přidej doménu `audit.technologio.eu`.
  - U svého registrátora domény (kde spravuješ technologio.eu) přidej DNS záznam typu **CNAME**:
    - Hostitel: `audit`
    - Hodnota: `cname.vercel-dns.com`
  - Na této subdoméně se pak veřejnosti servírují pouze čisté audity (např. `audit.technologio.eu/kadernictvi-brno-x8f2`). Pokus o přístup do administrace z této subdomény je zablokován a přesměrovává zpět na hlavní web `technologio.eu`.

---

## 🎯 Jak s nástrojem získat zakázky (Doporučený workflow)

1. **Hledání:** V sekci *Hledat firmy* zvol obor (kadeřnictví, autoservisy, stavební firmy, zubaři...) a město (Brno, Praha, Olomouc...).
2. **Dávková analýza:** Klikni na *Analyzovat vše*. Během chvilky aplikace zkontroluje:
   - Zda má firma vůbec vlastní web
   - Zabezpečení HTTPS
   - Mobilní přizpůsobení (viewport)
   - Rychlost a metriky Core Web Vitals (PageSpeed)
   - Zastaralý copyright letopočet v patičce
   - Použité technologie (např. prehistorické šablony, staré verze jQuery)
   - E-maily a kontakty z webu
3. **Výběr horkých kandidátů:** V *Leadech* seřaď podle priority. Nejlepší jsou firmy s vysokým hodnocením a mnoha recenzemi na Google Mapách, ale s tragickým nebo chybějícím webem.
4. **1-Click Audit & Oslovení:**
   - Otevři detail firmy.
   - Klikni na *Vytvořit audit* a *Navrhnout oslovení*.
   - Získáš unikátní odkaz na prémiovou stránku auditu (s náhledem webu na mobilu, skóre a konkrétními doporučeními v lidské řeči).
   - Získáš připravený e-mail, scénář pro telefonát a zprávu na LinkedIn.
5. **Odeslání:** Klikni na *Otevřít v e-mailu* (předvyplní se v poštovním klientovi).
6. **Záchyt zájmu:** Jakmile si majitel firmy audit otevře, vidíš to v dashboardu a přijde ti notifikace na Telegram. V tu chvíli je ideální čas zavolat a domluvit 15min schůzku!
