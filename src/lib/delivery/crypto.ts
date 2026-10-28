import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DeliveryError } from "./errors";

function keyBytes(): Buffer {
  const raw = process.env.DELIVERY_TOKEN_KEY;
  if (!raw || raw.length < 16) {
    throw new DeliveryError("Delivery encryption is not configured on this server.", 503);
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptJson<T>(ciphertext: string): T {
  const buf = Buffer.from(ciphertext, "base64url");
  if (buf.length < 29) throw new DeliveryError("Stored delivery credentials could not be read.", 500);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
