import { env, requireServiceM8OAuth } from "../config/env.js";
import { saveOAuthTokens, getOAuthTokens, getSingleOAuthTokens } from "../db/repository.js";
import { getVendorUuid } from "./api.js";

const AUTH_URL = "https://go.servicem8.com/oauth/authorize";
const TOKEN_URL = "https://go.servicem8.com/oauth/access_token";

export function authorizeUrl(state?: string): string {
  requireServiceM8OAuth();
  const u = new URL(AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.servicem8AppId);
  u.searchParams.set("redirect_uri", env.servicem8RedirectUri);
  u.searchParams.set("scope", "vendor read_jobs read_customers manage_customers read_customer_contacts");
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) throw new Error(json.error || `token exchange failed ${res.status}`);
  return json;
}

export async function exchangeCode(code: string, account_uuid: string): Promise<void> {
  requireServiceM8OAuth();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.servicem8AppId,
    client_secret: env.servicem8AppSecret,
    redirect_uri: env.servicem8RedirectUri,
    code,
  });
  const tok = await postToken(body);
  const expires_at = Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600);
  const vendorUuid = await getVendorUuid(tok.access_token);
  const key = vendorUuid || account_uuid || "default";
  saveOAuthTokens(key, tok.access_token, tok.refresh_token ?? null, expires_at);
  if (key === "default" && !vendorUuid) {
    console.warn("oauth saved as default — vendor scope missing or vendor.json failed; reconnect after adding vendor scope");
  } else {
    console.log("oauth saved for", key);
  }
}

export async function refreshAccessToken(account_uuid: string): Promise<string> {
  const row = getOAuthTokens(account_uuid);
  if (!row?.refresh_token) throw new Error("no_refresh_token");
  requireServiceM8OAuth();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.servicem8AppId,
    client_secret: env.servicem8AppSecret,
    refresh_token: row.refresh_token,
  });
  const tok = await postToken(body);
  const expires_at = Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600);
  saveOAuthTokens(account_uuid, tok.access_token, tok.refresh_token ?? row.refresh_token, expires_at);
  return tok.access_token;
}

export async function getAccessToken(account_uuid: string): Promise<string | undefined> {
  const row =
    (account_uuid ? getOAuthTokens(account_uuid) : undefined) ||
    getOAuthTokens("default") ||
    getSingleOAuthTokens();
  if (!row) return undefined;
  const key =
    ("account_uuid" in row && typeof row.account_uuid === "string" ? row.account_uuid : "") ||
    account_uuid ||
    "default";
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 60) return row.access_token;
  try {
    return await refreshAccessToken(key);
  } catch {
    return row.access_token;
  }
}

/** JWT may include a short-lived token; else fall back to stored OAuth */
export async function resolveAccessToken(
  accountHint: string,
  jwtAuth?: { accessToken?: string }
): Promise<string | undefined> {
  if (jwtAuth?.accessToken) return jwtAuth.accessToken;
  return getAccessToken(accountHint);
}
