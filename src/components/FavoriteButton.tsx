"use client";

import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/actions";
import { IconStar, IconStarOutline } from "./icons";

export function FavoriteButton({
  leadId,
  initialFavorite = false,
  showText = false,
  size = 16,
  className = "",
}: {
  leadId: string;
  initialFavorite?: boolean;
  showText?: boolean;
  size?: number;
  className?: string;
}) {
  const [fav, setFav] = useState(initialFavorite);
  const [pending, startTransition] = useTransition();

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const next = !fav;
    setFav(next); // optimistic update

    startTransition(async () => {
      try {
        const res = await toggleFavoriteAction(leadId);
        if (res.ok) {
          setFav(res.isFavorite);
        } else {
          setFav(!next);
        }
      } catch {
        setFav(!next); // revert on error
      }
    });
  };

  if (showText) {
    return (
      <button
        type="button"
        className={`btn btn-sm ${fav ? "btn-warn" : ""} ${className}`}
        onClick={handleToggle}
        disabled={pending}
        title={fav ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          borderColor: fav ? "#f59e0b" : undefined,
          backgroundColor: fav ? "rgba(245, 158, 11, 0.12)" : undefined,
          color: fav ? "#f59e0b" : undefined,
        }}
      >
        {fav ? (
          <IconStar size={size} style={{ color: "#f59e0b" }} />
        ) : (
          <IconStarOutline size={size} />
        )}
        <span>{fav ? "V oblíbených" : "Do oblíbených"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`btn-ghost ${className}`}
      onClick={handleToggle}
      disabled={pending}
      title={fav ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
      aria-label={fav ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: fav ? "#f59e0b" : "var(--muted)",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!fav) e.currentTarget.style.color = "#f59e0b";
      }}
      onMouseLeave={(e) => {
        if (!fav) e.currentTarget.style.color = "var(--muted)";
      }}
    >
      {fav ? (
        <IconStar size={size} style={{ color: "#f59e0b" }} />
      ) : (
        <IconStarOutline size={size} />
      )}
    </button>
  );
}
