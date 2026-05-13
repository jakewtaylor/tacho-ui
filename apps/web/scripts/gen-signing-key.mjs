#!/usr/bin/env node
// Generates an Ed25519 keypair for signing license JWTs.
// - Prints the private key in PEM (PKCS#8) and a single-line escaped form for env vars.
// - Prints the public key in PEM (SPKI) and as a Go string literal for embedding.
//
// Usage:  node scripts/gen-signing-key.mjs

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString().trim();

const escaped = privatePem.replace(/\n/g, "\\n");

console.log("=== Private key (PEM) ===\n");
console.log(privatePem);
console.log("\n=== Private key (escaped for env var) ===\n");
console.log(`LICENSE_SIGNING_PRIVATE_KEY="${escaped}"`);
console.log("\n=== Public key (PEM) ===\n");
console.log(publicPem);
console.log("\n=== Public key (Go string literal) ===\n");
const goLiteral = publicPem
  .split("\n")
  .map((line) => `\t"${line}\\n" +`)
  .join("\n");
console.log("const LicenseSigningPublicKeyPEM = \"\" +\n" + goLiteral.replace(/ \+$/, ""));
console.log("");
console.log("Add the private key to your env vars (Vercel + .env.local).");
console.log("Paste the Go string literal into apps/desktop/internal/license/public_key.go.");
