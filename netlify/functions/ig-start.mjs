// Avvia il collegamento Instagram: restituisce l'URL di accesso Meta (solo per utenti autorizzati).
import { APP_ID, REDIRECT, makeState, userIsMember } from "./_lib.mjs";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  const { profilo } = await req.json().catch(() => ({}));
  if (!["studio", "lab"].includes(profilo)) return Response.json({ error: "profilo non valido" }, { status: 400 });
  const state = makeState({ profilo, exp: Date.now() + 10 * 60 * 1000 });
  const cfg = process.env.META_CONFIG_ID || "889606190889875";
  const url = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&state=${state}&config_id=${cfg}&response_type=code&override_default_response_type=true`;
  return Response.json({ url });
};
