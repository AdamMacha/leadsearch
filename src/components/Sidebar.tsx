"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { IconDashboard, IconLogout, IconRadar, IconSearch, IconSettings, IconUsers } from "./icons";
import styles from "./sidebar.module.css";

const NAV = [
  { href: "/", label: "Přehled", icon: IconDashboard },
  { href: "/search", label: "Hledat firmy", icon: IconSearch },
  { href: "/leads", label: "Leady", icon: IconUsers },
  { href: "/settings", label: "Nastavení", icon: IconSettings },
];

export function Sidebar({ hot }: { hot: number }) {
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

      <form action={logout} className={styles.footer}>
        <button className={`btn btn-ghost ${styles.logout}`} id="logout-btn">
          <IconLogout size={16} /> Odhlásit
        </button>
      </form>
    </aside>
  );
}
