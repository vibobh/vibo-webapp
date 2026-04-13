import { importPKCS8, importSPKI, SignJWT, jwtVerify, exportJWK } from "jose";
import { getPrivateKeyPem, getPublicKeyPem } from "./keys";

export const COOKIE_NAME = "vibo_auth_token";
const ALG = "RS256";
const KID = "vibo-auth-1";
const TOKEN_TTL = "7d";

function getIssuer(): string {
  return process.env.AUTH_ISSUER_URL ?? "https://joinvibo.com";
}

const AUDIENCE = "convex";

let _privateKey: CryptoKey | null = null;
let _publicKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (!_privateKey) _privateKey = await importPKCS8(getPrivateKeyPem(), ALG);
  return _privateKey;
}

async function getPublicKey(): Promise<CryptoKey> {
  if (!_publicKey) _publicKey = await importSPKI(getPublicKeyPem(), ALG);
  return _publicKey;
}

export interface TokenPayload {
  sub: string;
  email: string;
  username?: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ email: payload.email, username: payload.username })
    .setProtectedHeader({ alg: ALG, kid: KID })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(getIssuer())
    .setAudience(AUDIENCE)
    .setExpirationTime(TOKEN_TTL)
    .sign(key);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: getIssuer(),
      audience: AUDIENCE,
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: (payload.email as string) ?? "",
      username: (payload.username as string) ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function getJwks() {
  const key = await getPublicKey();
  const jwk = await exportJWK(key);
  return {
    keys: [
      {
        ...jwk,
        kid: KID,
        alg: ALG,
        use: "sig",
      },
    ],
  };
}

export function makeAuthCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAge ?? 60 * 60 * 24 * 7,
  };
}
