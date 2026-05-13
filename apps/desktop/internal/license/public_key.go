package license

// LicenseSigningPublicKeyPEM is the Ed25519 SPKI public key (PEM-encoded) used
// to verify license JWTs handed out by the activation server. The matching
// private key lives in Vercel as the LICENSE_SIGNING_PRIVATE_KEY env var.
//
// Generate a fresh keypair locally with:
//
//	cd apps/web && npm run keys:gen
//
// Paste the printed "Go string literal" block here.
const LicenseSigningPublicKeyPEM = "" +
	"-----BEGIN PUBLIC KEY-----\n" +
	"MCowBQYDK2VwAyEAVj18eqimel+cRyepCC5QQc6+1K5TITGNiJSQIdqM7f4=\n" +
	"-----END PUBLIC KEY-----\n"
