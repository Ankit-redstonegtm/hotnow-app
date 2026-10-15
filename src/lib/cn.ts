import { twMerge } from "tailwind-merge";

export type ClassValue = string | number | null | false | undefined | ClassValue[] | Record<string, boolean>;

function toClasses(input: ClassValue): string {
  if (!input) return "";
  if (typeof input === "string" || typeof input === "number") return String(input);
  if (Array.isArray(input)) return input.map(toClasses).filter(Boolean).join(" ");
  return Object.entries(input)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(" ");
}

/** Merge class names, de-duping conflicting Tailwind utilities (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(inputs.map(toClasses).filter(Boolean).join(" "));
}
