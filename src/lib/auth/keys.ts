import fs from "fs";
import path from "path";

function loadKey(envVar: string, fileName: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv.replace(/\\n/g, "\n");
  try {
    return fs.readFileSync(path.join(process.cwd(), fileName), "utf8");
  } catch {
    throw new Error(
      `Missing ${envVar} env var and ${fileName} file. Set ${envVar} in your environment or add ${fileName} to the project root.`,
    );
  }
}

let _privateKey: string | null = null;
let _publicKey: string | null = null;

export function getPrivateKeyPem(): string {
  if (!_privateKey) _privateKey = loadKey("AUTH_PRIVATE_KEY", "auth-private.pem");
  return _privateKey;
}

export function getPublicKeyPem(): string {
  if (!_publicKey) _publicKey = loadKey("AUTH_PUBLIC_KEY", "auth-public.pem");
  return _publicKey;
}
