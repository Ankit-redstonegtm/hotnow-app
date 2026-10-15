"use client";

// Company identity: a real logo when we can load one, over a deterministic monogram fallback.
// The monogram always renders underneath at the fixed size, so there is never a blank box or
// layout shift; the logo fades in on successful load and is dropped silently on error.
// No paid logo provider — uses the free public favicon endpoint, and degrades to the monogram.

import { useState } from "react";

const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#eef1f6", fg: "#3b4a63" },
  { bg: "#fdeceb", fg: "#b23b32" },
  { bg: "#eaf2ec", fg: "#2f6b45" },
  { bg: "#f0edf7", fg: "#5a4a86" },
  { bg: "#fbf0e5", fg: "#9a5a22" },
  { bg: "#e9f1f5", fg: "#2c5d74" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string, domain?: string | null): string {
  const base = (name || domain || "").trim();
  if (!base) return "·";
  const words = base.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\s.]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function cleanDomain(domain?: string | null): string | null {
  if (!domain) return null;
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export function CompanyAvatar({
  name,
  domain,
  size = 36,
  logo = false,
}: {
  name: string;
  domain?: string | null;
  size?: number;
  /** opt in to a real logo over the monogram (default: monogram only, to keep current screens stable) */
  logo?: boolean;
}) {
  const [logoOk, setLogoOk] = useState(true);
  const key = (domain || name || "").toLowerCase();
  const { bg, fg } = PALETTE[hash(key) % PALETTE.length];
  const radius = Math.round(size * 0.26);
  const d = logo ? cleanDomain(domain) : null;

  return (
    <span
      aria-hidden
      className="relative inline-grid place-items-center shrink-0 overflow-hidden select-none font-semibold"
      style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, fontSize: Math.round(size * 0.38), letterSpacing: "-0.02em" }}
    >
      {initials(name, domain)}
      {d && logoOk && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setLogoOk(false)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ background: "#fff", borderRadius: radius }}
        />
      )}
    </span>
  );
}
