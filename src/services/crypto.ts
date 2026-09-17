import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

function getKey(): Buffer {
  const hex = process.env.PAPER_ENC_KEY;
  if (!hex) {
    throw new Error("PAPER_ENC_KEY environment variable is not set");
  }

  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `PAPER_ENC_KEY must decode to ${KEY_LENGTH_BYTES} bytes (${KEY_LENGTH_BYTES * 2} hex characters)`
    );
  }

  return key;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptPaper(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptPaper(
  ciphertext: string,
  iv: string,
  authTag: string
): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
