export class DeliveryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DeliveryError";
    this.status = status;
  }
}

/** Provider errors sometimes echo tokens. Keep those out of API responses. */
export function safeProviderMessage(text: string, fallback = "The provider rejected the request.") {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || /bot\d+:|api\.telegram\.org\/bot|Bearer |ya29\.|xox[baprs]-|refresh_token|access_token/i.test(cleaned)) {
    return fallback;
  }
  return cleaned.slice(0, 180);
}
