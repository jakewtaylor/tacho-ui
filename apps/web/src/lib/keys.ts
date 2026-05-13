import { importPKCS8 } from "jose";

let cachedKey: CryptoKey | undefined;

export async function loadSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  if (!raw) {
    throw new Error("LICENSE_SIGNING_PRIVATE_KEY is not set");
  }
  const pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  cachedKey = (await importPKCS8(pem, "EdDSA", { extractable: false })) as CryptoKey;
  return cachedKey;
}
