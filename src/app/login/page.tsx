import type { Metadata } from "next";
import { IconRadar } from "@/components/icons";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Přihlášení" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const noPassword = !process.env.APP_PASSWORD?.trim();
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: 32, animation: "fade-up .5s both" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
          <span
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "var(--gradient)",
              boxShadow: "var(--glow)",
              marginBottom: 16,
              color: "white",
            }}
          >
            <IconRadar size={28} />
          </span>
          <h1 style={{ fontSize: 24 }}>LeadRadar</h1>
          <p className="text-2" style={{ marginTop: 6 }}>Najdi firmy, které potřebují nový web.</p>
        </div>
        {noPassword && (
          <div className="alert alert-warn" style={{ marginBottom: 14 }}>
            Dev režim: APP_PASSWORD není nastavené, projde jakékoli heslo.
          </div>
        )}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
