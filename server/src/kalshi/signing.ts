import crypto from "node:crypto";

export type KeyAlgorithm = "rsa" | "ed25519";

export interface SigningKey {
  algorithm: KeyAlgorithm;
  keyObject: crypto.KeyObject;
}

/**
 * Kalshi API keys are either RSA or Ed25519. The PEM header alone isn't a
 * reliable signal, so we parse the key and ask Node what it actually is.
 */
export function loadSigningKey(pem: string): SigningKey {
  const keyObject = crypto.createPrivateKey(pem);
  const type = keyObject.asymmetricKeyType;
  if (type === "rsa" || type === "rsa-pss") {
    return { algorithm: "rsa", keyObject };
  }
  if (type === "ed25519") {
    return { algorithm: "ed25519", keyObject };
  }
  throw new Error(`Unsupported Kalshi private key type: ${type}. Expected RSA or Ed25519.`);
}

/**
 * Message to sign is: timestampMs + method + pathWithoutQuery (path includes
 * the /trade-api/v2 prefix). See Kalshi's authenticated-requests guide.
 */
export function signRequest(
  key: SigningKey,
  timestampMs: string,
  method: string,
  pathWithoutQuery: string
): string {
  const message = Buffer.from(`${timestampMs}${method}${pathWithoutQuery}`, "utf8");

  if (key.algorithm === "ed25519") {
    const signature = crypto.sign(null, message, key.keyObject);
    return signature.toString("base64");
  }

  const signature = crypto.sign("sha256", message, {
    key: key.keyObject,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}
