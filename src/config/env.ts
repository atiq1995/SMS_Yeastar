import "dotenv/config";

function opt(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function optInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

export const env = {
  appEnv: opt("APP_ENV", "development"),
  port: optInt("PORT", 3000),
  appUrl: opt("APP_URL", "http://localhost:3000"),
  databasePath: opt("DATABASE_PATH", "./data/sms.db"),

  servicem8ApiBaseUrl: opt("SERVICEM8_API_BASE_URL", "https://api.servicem8.com"),
  servicem8AppId: opt("SERVICEM8_APP_ID", ""),
  servicem8AppSecret: opt("SERVICEM8_APP_SECRET", ""),
  servicem8RedirectUri: opt("SERVICEM8_REDIRECT_URI", "http://localhost:3000/oauth/callback"),

  yeastarHost: opt("YEASTAR_HOST", ""),
  yeastarHttpPort: optInt("YEASTAR_HTTP_PORT", 8080),
  yeastarApiPort: optInt("YEASTAR_API_PORT", 5038),
  yeastarUsername: opt("YEASTAR_USERNAME", ""),
  yeastarPassword: opt("YEASTAR_PASSWORD", ""),
  yeastarSimPort: optInt("YEASTAR_SIM_PORT", 1),
  yeastarSendEnabled: opt("YEASTAR_SEND_ENABLED", "false") === "true",
  yeastarReceiveEnabled: opt("YEASTAR_RECEIVE_ENABLED", "true") === "true",
};

export function requireServiceM8OAuth(): void {
  req("SERVICEM8_APP_ID");
  req("SERVICEM8_APP_SECRET");
}

export function requireYeastarSend(): void {
  req("YEASTAR_HOST");
  req("YEASTAR_USERNAME");
  req("YEASTAR_PASSWORD");
}
