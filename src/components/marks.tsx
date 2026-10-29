export function FlameMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2.2c.4 2.6-.3 4.2-1.5 5.6C8.8 9.8 7.5 11.4 7.5 14.2c0 3.1 2.3 5.3 5.1 5.3 2.9 0 5.2-2.3 5.2-5.4 0-2-1-3.4-2-4.7-.2 1.6-.9 2.7-1.8 3.4.4-1.9-.3-3.5-1.5-4.9-.8-1-1.2-2.2-.5-5.7Z" />
      <path fill="#ffc14d" d="M12.2 13.4c.4 1.1 0 2-.6 2.7-.6.6-1.1 1.1-1.1 2.1 0 1.2.9 2.1 2.1 2.1s2.1-.9 2.1-2.2c0-.8-.4-1.4-.8-1.9-.1.7-.4 1.1-.8 1.4.2-.9-.1-1.6-.7-2.2-.4-.4-.5-.9 0-2Z" />
    </svg>
  );
}

export function BrandWordmark({ tile = false, className = "" }: { tile?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span
        className={tile ? "inline-grid place-items-center h-7 w-7 rounded-lg" : "inline-flex"}
        style={{ color: "var(--accent)", background: tile ? "var(--accent-soft)" : undefined }}
      >
        <FlameMark size={tile ? 16 : 18} />
      </span>
      <span>Hot<span style={{ color: "var(--accent)" }}>Now</span></span>
    </span>
  );
}

export function SlackMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" aria-hidden="true">
      <path fill="#E01E5A" d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" />
      <path fill="#36C5F0" d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" />
      <path fill="#2EB67D" d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" />
      <path fill="#ECB22E" d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" />
    </svg>
  );
}
