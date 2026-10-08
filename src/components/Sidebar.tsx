"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { IconDashboard, IconLogout, IconRadar, IconSearch, IconSettings, IconSparkle, IconUsers } from "./icons";
import styles from "./sidebar.module.css";

const NAV = [
  { href: "/", label: "Přehled", icon: IconDashboard },
  { href: "/search", label: "Hledat firmy", icon: IconSearch },
  { href: "/leads", label: "Leady", icon: IconUsers },
  { href: "/settings", label: "Nastavení", icon: IconSettings },
];

export function Sidebar({ hot, activeModel }: { hot: number; activeModel?: string }) {
  const pathname = usePathname();
  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}>
        <span className={styles.logo}>
          <IconRadar size={18} />
        </span>
        <span>
          <strong>LeadRadar</strong>
          <small>by Technologio</small>
        </span>
      </Link>

      <nav className={styles.nav}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ""}`} id={`nav-${href.slice(1) || "home"}`}>
              <Icon size={17} />
              <span>{label}</span>
              {href === "/leads" && hot > 0 && <span className={styles.count}>{hot}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        {activeModel && (
          <Link
            href="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderRadius: "var(--radius)",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              marginBottom: 8,
              textDecoration: "none",
              fontSize: "0.78rem",
            }}
            title="Klikni pro změnu AI modelu v Nastavení"
          >
            <span className="row" style={{ gap: 5 }}>
              <IconSparkle size={13} style={{ color: "var(--accent)" }} />
              <span>AI:</span>
            </span>
            <span className="mono" style={{ color: "var(--fg)", fontSize: "0.74rem" }}>
              {activeModel.replace("gemini-", "").replace("-preview", "")}
            </span>
          </Link>
        )}
        <form action={logout}>
          <button className={`btn btn-ghost ${styles.logout}`} id="logout-btn">
            <IconLogout size={16} /> Odhlásit
          </button>
        </form>
      </div>
    </aside>
  );
}
