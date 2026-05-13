import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { loadSigningKey } from "./keys";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, no I/L/O/U
const KEY_PREFIX = "TLX";
const JWT_ISSUER = "tacholens.com";
const JWT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function pickChar(byte: number): string {
  return ALPHABET[byte % ALPHABET.length]!;
}

export function generateLicenseKey(): string {
  const bytes = randomBytes(16);
  const chars: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    chars.push(pickChar(bytes[i]!));
  }
  const groups = [
    chars.slice(0, 4).join(""),
    chars.slice(4, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
  ];
  return `${KEY_PREFIX}-${groups.join("-")}`;
}

const KEY_PATTERN = /^TLX-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function isValidLicenseKeyShape(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export type LicenseJWTPayload = {
  licenseKey: string;
  machineId: string;
  email: string;
  updateWindowExpiresAt: number;
};

export async function signLicenseJWT(payload: LicenseJWTPayload): Promise<string> {
  const key = await loadSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    license_key: payload.licenseKey,
    machine_id: payload.machineId,
    update_window_expires_at: payload.updateWindowExpiresAt,
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setSubject(payload.email)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(key);
}

export const LICENSE_JWT_ISSUER = JWT_ISSUER;
export const LICENSE_JWT_TTL_SECONDS = JWT_TTL_SECONDS;
export const MAX_ACTIVATIONS_PER_LICENSE = 3;
export const UPDATE_WINDOW_DAYS = 365;
