"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "@/app/actions";
import { IconDashboard, IconLogout, IconRadar, IconSearch, IconSettings, IconSparkle, IconStar, IconUsers } from "./icons";
import styles from "./sidebar.module.css";

const NAV = [
  { href: "/", label: "Přehled", icon: IconDashboard },
  { href: "/search", label: "Hledat firmy", icon: IconSearch },
  { href: "/leads", label: "Leady", icon: IconUsers },
  { href: "/leads?favorite=1", label: "Oblíbené", icon: IconStar },
  { href: "/settings", label: "Nastavení", icon: IconSettings },
];

function NavLinks({ hot, favorites }: { hot: number; favorites: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFav = searchParams.get("favorite") === "1";

  return (
    <nav className={styles.nav}>
      {NAV.map(({ href, label, icon: Icon }) => {
        let active = false;
        if (href === "/") {
          active = pathname === "/";
        } else if (href === "/leads?favorite=1") {
          active = pathname === "/leads" && isFav;
        } else if (href === "/leads") {
          active = pathname.startsWith("/leads") && !isFav;
        } else {
          active = pathname.startsWith(href);
        }

        const count = href === "/leads" ? hot : href === "/leads?favorite=1" ? favorites : 0;
        const isFavLink = href === "/leads?favorite=1";

        return (
          <Link
            key={href}
            href={href}
            className={`${styles.link} ${active ? styles.active : ""}`}
            id={`nav-${href.replace(/[^a-z0-9]/gi, "-") || "home"}`}
          >
            <Icon
              size={17}
              style={isFavLink && (active || favorites > 0) ? { color: "#f59e0b" } : undefined}
            />
            <span>{label}</span>
            {count > 0 && (
              <span
                className={styles.count}
                style={
                  isFavLink
                    ? { backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }
                    : undefined
                }
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  hot,
  favorites = 0,
  activeModel,
}: {
  hot: number;
  favorites?: number;
  activeModel?: string;
}) {
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

      <Suspense fallback={<nav className={styles.nav} />}>
        <NavLinks hot={hot} favorites={favorites} />
      </Suspense>

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
