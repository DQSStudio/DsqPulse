// Riceve il ritorno da Meta, scambia il codice, salva il token della Pagina e l'account Instagram.
import { GRAPH, APP_ID, REDIRECT, ORG, readState, rpc } from "./_lib.mjs";
const page = (t, ok) => new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#f7f3ec;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="background:#fff;border-radius:20px;padding:28px;max-width:380px;text-align:center;box-shadow:0 20px 50px -20px rgba(0,0,0,.3)"><div style="font-size:42px">${ok ? "✅" : "⚠️"}</div><p style="font-size:17px;color:#3d1119">${t}</p><a href="/" style="display:inline-block;margin-top:10px;background:#6e2635;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none">Torna a DSQ Pulse</a></div>`, { headers: { "content-type": "text/html; charset=utf-8" } });
const j = async (u) => { const r = await fetch(u); const x = await r.json(); if (!r.ok || x.error) throw new Error(x.error?.message || "errore Meta"); return x; };
export default async (req) => {
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return page("Collegamento annullato.", false);
  const st = readState(q.get("state"));
  if (!st) return page("Sessione scaduta o non valida. Riprova dall'app.", false);
  try {
    const secret = process.env.META_APP_SECRET;
    const short = await j(`${GRAPH}/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_secret=${secret}&code=${q.get("code")}`);
    const long = await j(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${secret}&fb_exchange_token=${short.access_token}`);
    const pages = await j(`${GRAPH}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&limit=50&access_token=${long.access_token}`);
    const cand = (pages.data || []).filter((p) => p.instagram_business_account);
    if (!cand.length) return page("Non ho trovato nessun account Instagram professionale collegato a una Pagina Facebook.", false);
    const pick = cand.find((p) => (p.instagram_business_account.username || "").toLowerCase().includes(st.profilo)) || cand[0];
    const ig = pick.instagram_business_account;
    await rpc("pulse_fn_salva_account", { p_org: ORG, p_profilo: st.profilo, p_ig_user_id: ig.id, p_ig_username: ig.username || null, p_page_id: pick.id, p_token: pick.access_token, p_scade: null });
    const altri = cand.length > 1 ? ` (trovati ${cand.length} account: ho scelto @${ig.username})` : "";
    return page(`Collegato <b>@${ig.username}</b> a Desearq ${st.profilo === "lab" ? "Lab" : "Studio"}.${altri}`, true);
  } catch (e) {
    return page("Errore nel collegamento: " + String(e.message).slice(0, 200), false);
  }
};
