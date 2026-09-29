/**
 * Client-side Kalshi request signing using the Web Crypto API. The private
 * key is imported as a non-extractable CryptoKey, so once it's loaded, no
 * JavaScript on this page — including ours — can ever read the raw key
 * bytes back out. Only crypto.subtle.sign() can use it.
 *
 * Kalshi keys are RSA (2048-bit, signed with RSA-PSS/SHA-256) or Ed25519.
 * This app supports RSA fully; Ed25519 is attempted but depends on browser
 * support (widely available in current Chrome/Firefox/Safari, but not
 * universal on older browsers).
 */

export type KeyAlgorithm = "rsa" | "ed25519";

export interface LoadedKey {
  algorithm: KeyAlgorithm;
  cryptoKey: CryptoKey;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToDer(pem: string): { der: Uint8Array; header: string } {
  const match = pem.match(/-----BEGIN ([^-]+)-----([\s\S]+?)-----END \1-----/);
  if (!match) throw new Error("That doesn't look like a PEM-encoded key (missing BEGIN/END lines).");
  const header = match[1].trim();
  const base64 = match[2].replace(/\s+/g, "");
  return { der: base64ToBytes(base64), header };
}

/** Minimal DER length encoder (short or long form), for the fixed ASN.1 shapes we build below. */
function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function derSequence(contentChunks: number[][]): number[] {
  const content = contentChunks.flat();
  return [0x30, ...derLength(content.length), ...content];
}

// rsaEncryption OID: 1.2.840.113549.1.1.1
const RSA_ENCRYPTION_ALGORITHM_ID = [
  0x30, 0x0d, // SEQUENCE, length 13
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID
  0x05, 0x00, // NULL
];

/**
 * Wraps a PKCS#1 RSAPrivateKey DER blob into a PKCS#8 PrivateKeyInfo DER blob,
 * which is the only format SubtleCrypto.importKey("pkcs8", ...) accepts.
 * PrivateKeyInfo ::= SEQUENCE { version INTEGER(0), algorithm AlgorithmIdentifier, privateKey OCTET STRING }
 */
function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00]; // INTEGER 0
  const octetString = [0x04, ...derLength(pkcs1Der.length), ...Array.from(pkcs1Der)];
  const sequence = derSequence([version, RSA_ENCRYPTION_ALGORITHM_ID, octetString]);
  return new Uint8Array(sequence);
}

/** Copies a Uint8Array's bytes into a plain ArrayBuffer, since WebCrypto's BufferSource type rejects the generic ArrayBufferLike a TypedArray view carries. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importRsaPssKey(pkcs8Der: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pkcs8Der),
    { name: "RSA-PSS", hash: "SHA-256" },
    false, // non-extractable
    ["sign"]
  );
}

async function importEd25519Key(pkcs8Der: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", toArrayBuffer(pkcs8Der), { name: "Ed25519" }, false, ["sign"]);
}

/**
 * Loads a pasted PEM private key. Throws a descriptive error if the format
 * isn't recognized/supported rather than failing silently.
 */
export async function loadSigningKey(pem: string): Promise<LoadedKey> {
  const { der, header } = pemToDer(pem);

  if (header.includes("RSA PRIVATE KEY")) {
    // PKCS#1 — needs wrapping before SubtleCrypto will import it.
    const pkcs8 = pkcs1ToPkcs8(der);
    const cryptoKey = await importRsaPssKey(pkcs8);
    return { algorithm: "rsa", cryptoKey };
  }

  if (header.includes("PRIVATE KEY")) {
    // PKCS#8 — could be RSA or Ed25519. Try RSA first (Kalshi's more common key type), then Ed25519.
    try {
      const cryptoKey = await importRsaPssKey(der);
      return { algorithm: "rsa", cryptoKey };
    } catch {
      try {
        const cryptoKey = await importEd25519Key(der);
        return { algorithm: "ed25519", cryptoKey };
      } catch {
        throw new Error(
          "Couldn't import this key as RSA or Ed25519. If it's Ed25519, your browser may not support it yet — try an RSA key instead."
        );
      }
    }
  }

  throw new Error(`Unrecognized key type "${header}". Expected an RSA or Ed25519 private key.`);
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Message to sign is: timestampMs + method + pathWithoutQuery (path includes
 * the /trade-api/v2 prefix). See Kalshi's authenticated-requests guide.
 */
export async function signRequest(key: LoadedKey, timestampMs: string, method: string, pathWithoutQuery: string): Promise<string> {
  const message = new TextEncoder().encode(`${timestampMs}${method}${pathWithoutQuery}`);

  const signature =
    key.algorithm === "ed25519"
      ? await crypto.subtle.sign("Ed25519", key.cryptoKey, message)
      : await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, key.cryptoKey, message);

  return bytesToBase64(signature);
}
