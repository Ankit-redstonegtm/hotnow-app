"use client";

// A tab keeps its own workspace. Capture it when a request starts so an in-flight
// request cannot change workspace if the user switches companies elsewhere.
export function selectWorkspace(id: string) {
  sessionStorage.setItem("hotnow_workspace", id);
}

export function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const id = sessionStorage.getItem("hotnow_workspace");
  if (id) headers.set("x-hotnow-workspace", id);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

export async function apiJson<T = Record<string, any>>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(input, init);
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null || data.error) {
    throw new Error(data?.error || `Request failed (${response.status}). Please retry.`);
  }
  return data as T;
}
