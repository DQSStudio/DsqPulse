// Avvia il collegamento Instagram: restituisce l'URL di accesso Meta (solo per utenti autorizzati).
import { APP_ID, REDIRECT, makeState, userIsMember } from "./_lib.mjs";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  const { profilo } = await req.json().catch(() => ({}));
  if (!["studio", "lab"].includes(profilo)) return Response.json({ error: "profilo non valido" }, { status: 400 });
  const state = makeState({ profilo, exp: Date.now() + 10 * 60 * 1000 });
  const scope = "instagram_basic,instagram_content_publishing,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management";
  const url = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&state=${state}&scope=${scope}&response_type=code`;
  return Response.json({ url });
};
