import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AddonJwt = jwt.JwtPayload & {
  eventName?: string;
  eventArgs?: Record<string, unknown>;
  event?: string;
  account_uuid?: string;
  job_uuid?: string;
  object_uuid?: string;
  object?: string;
  entry?: Record<string, unknown>;
  args?: Record<string, unknown>;
  auth?: { accessToken?: string };
};

export function verifyServiceM8Jwt(rawBody: Buffer | string): AddonJwt {
  const token = (typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")).trim();
  if (!token) throw new Error("empty_jwt");
  if (!env.servicem8AppSecret) throw new Error("SERVICEM8_APP_SECRET not configured");
  return jwt.verify(token, env.servicem8AppSecret, { algorithms: ["HS256"] }) as AddonJwt;
}
