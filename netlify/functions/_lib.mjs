import { createHmac, timingSafeEqual } from "node:crypto";
export const SB = "https://qudoygcfphqhhyenpwlr.supabase.co";
export const SBK = "sb_publishable_JuOo4pGtRT_C0Wq7dYOE8Q_XpIRFOEX";
export const ORG = "d0000000-0000-4000-8000-0000000000d5";
export const GRAPH = "https://graph.facebook.com/v23.0";
export const APP_ID = "1024699217341860";
export const SITE = "https://dsqpulse.netlify.app";
export const REDIRECT = SITE + "/.netlify/functions/ig-callback";
export const sign = (s) => createHmac("sha256", process.env.META_APP_SECRET).update(s).digest("hex");
export function makeState(o) { const b = Buffer.from(JSON.stringify(o)).toString("base64url"); return b + "." + sign(b); }
export function readState(st) {
  const [b, sig] = String(st || "").split(".");
  if (!b || !sig) return null;
  const ok = sig.length === sign(b).length && timingSafeEqual(Buffer.from(sig), Buffer.from(sign(b)));
  if (!ok) return null;
  const o = JSON.parse(Buffer.from(b, "base64url").toString());
  return o.exp > Date.now() ? o : null;
}
export async function rpc(name, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: SBK, "content-type": "application/json" },
    body: JSON.stringify({ p_secret: process.env.PULSE_FN_SECRET, ...args }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error("rpc " + name + " " + r.status + " " + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
export async function userIsMember(jwt) {
  const r = await fetch(`${SB}/rest/v1/pulse_profili?select=slug&limit=1`, { headers: { apikey: SBK, Authorization: "Bearer " + jwt } });
  if (!r.ok) return false;
  const j = await r.json();
  return Array.isArray(j) && j.length > 0;
}

// Registra il consumo di una chiamata Anthropic (prezzi Sonnet 5.5: $2/M input, $10/M output, $10 ogni 1000 ricerche web).
export async function logUso(funzione, modello, usage) {
  try {
    const i = usage?.input_tokens || 0, o = usage?.output_tokens || 0, r = usage?.server_tool_use?.web_search_requests || 0;
    const costo = (i * 2 + o * 10) / 1e6 + r * 0.01;
    await rpc("pulse_fn_consumo", { p_org: ORG, p_funzione: funzione, p_modello: modello, p_in: i, p_out: o, p_ricerche: r, p_costo: costo });
  } catch {}
}
