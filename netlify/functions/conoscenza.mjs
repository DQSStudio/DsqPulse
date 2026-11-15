// Restituisce la conoscenza del profilo; al primo uso la inizializza dal testo di base.
import { ORG, rpc, userIsMember, KB } from "./_lib.mjs";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return new Response("no", { status: 401 });
  const profilo = new URL(req.url).searchParams.get("profilo");
  if (!["studio", "lab"].includes(profilo)) return new Response("profilo", { status: 400 });
  let t = (await rpc("pulse_fn_conoscenza_get", { p_org: ORG, p_profilo: profilo })) || "";
  if (!t.trim()) { t = KB[profilo]; await rpc("pulse_fn_conoscenza_set", { p_org: ORG, p_profilo: profilo, p_testo: t }); }
  return Response.json({ testo: t });
};
