"use client";

export default function AdminError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div role="alert" className="card p-6">
      <h1 className="text-lg font-semibold">Admin data could not be loaded</h1>
      <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{error.message || "Try again in a moment."}</p>
    </div>
  );
}
