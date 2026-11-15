// Legge profili Instagram pubblici (Business Discovery) e i dati propri; calcola metriche reali.
import { GRAPH, ORG, rpc, logUso, pulisci } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
const FIELDS = "caption,media_type,like_count,comments_count,timestamp,permalink";
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const giorni = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
function riassumi(followers, media) {
  const ok = media.filter((m) => typeof m.like_count === "number");
  const eng = (m) => ((m.like_count || 0) + (m.comments_count || 0)) / Math.max(followers || 1, 1) * 100;
  const perTipo = {};
  for (const m of ok) (perTipo[m.media_type] ||= []).push(eng(m));
  const tipi = Object.entries(perTipo).map(([t, v]) => ({ tipo: t, n: v.length, engagement: +avg(v).toFixed(2) })).sort((a, b) => b.engagement - a.engagement);
  const perGiorno = {};
  for (const m of ok) { const g = giorni[new Date(m.timestamp).getUTCDay()]; (perGiorno[g] ||= []).push(eng(m)); }
  const gg = Object.entries(perGiorno).map(([g, v]) => ({ giorno: g, n: v.length, engagement: +avg(v).toFixed(2) })).sort((a, b) => b.engagement - a.engagement);
  const ts = media.map((m) => +new Date(m.timestamp)).sort((a, b) => a - b);
  const settimane = ts.length > 1 ? Math.max((ts[ts.length - 1] - ts[0]) / 6048e5, 1) : 1;
  const top = [...ok].sort((a, b) => eng(b) - eng(a)).slice(0, 5).map((m) => ({ tipo: m.media_type, caption: (m.caption || "").slice(0, 220), like: m.like_count, commenti: m.comments_count, url: m.permalink, data: m.timestamp, engagement: +eng(m).toFixed(2) }));
  return { followers, post_analizzati: ok.length, engagement_medio: +avg(ok.map(eng)).toFixed(2), post_a_settimana: +(media.length / settimane).toFixed(1), per_tipo: tipi, per_giorno: gg, top };
}
async function g(u) { const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error?.message || "errore Meta"); return j; }
async function claude(prompt, max = 1500) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: max, messages: [{ role: "user", content: prompt }] }) });
  const j = await r.json(); await logUso("monitor", MODEL, j.usage); return pulisci((j.content || []).map((x) => x.text || "").join(""));
}
// Legge da Instagram i post più popolari degli hashtag indicati (Hashtag Search) e ne ricava un quadro con dati reali.
export async function analisiHashtag(profilo, tags) {
  const acc = ((await rpc("pulse_fn_account", { p_profilo: profilo })) || [])[0];
  if (!acc) throw new Error("Instagram non collegato");
  const F = "caption,media_type,like_count,comments_count,permalink,timestamp";
  const out = [];
  for (const t of tags.slice(0, 6)) {
    const q = String(t).replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
    if (!q) continue;
    try {
      const id = (await g(`${GRAPH}/ig_hashtag_search?user_id=${acc.ig_user_id}&q=${encodeURIComponent(q)}&access_token=${acc.token}`)).data?.[0]?.id;
      if (!id) continue;
      const m = (await g(`${GRAPH}/${id}/top_media?user_id=${acc.ig_user_id}&fields=${F}&limit=25&access_token=${acc.token}`)).data || [];
      const lk = m.filter((x) => typeof x.like_count === "number");
      const tipi = {}; for (const x of m) tipi[x.media_type] = (tipi[x.media_type] || 0) + 1;
      out.push({ tag: q, n: m.length, like_medio: Math.round(avg(lk.map((x) => x.like_count))), commenti_medi: Math.round(avg(lk.map((x) => x.comments_count || 0))), tipi,
        top: [...lk].sort((a, b) => b.like_count - a.like_count).slice(0, 3).map((x) => ({ tipo: x.media_type, caption: (x.caption || "").slice(0, 200), like: x.like_count, commenti: x.comments_count, url: x.permalink })) });
    } catch (e) { if (!out.length) throw e; }
  }
  if (!out.length) throw new Error("Nessun hashtag letto");
  const letture = (await claude(`Sono i post più popolari su Instagram per alcuni hashtag del settore (dati reali):\n${JSON.stringify(out.map((o) => ({ tag: o.tag, tipi: o.tipi, like_medio: o.like_medio, top: o.top })))}\n\nScrivi in italiano, in 4-6 righe, cosa emerge: quali hashtag hanno post con più interazione, che tipo di contenuto (foto, video, reel, carosello) domina e che temi o hook ricorrono nelle caption. Solo in base a questi dati; se sono pochi dillo. Non inventare numeri e non copiare le caption.`)).trim();
  return { hashtag: out, letture };
}

// Verifica su Instagram i profili proposti: scarta quelli inesistenti/non professionali, salva metriche reali degli altri.
export async function verificaProposti(profilo) {
  const acc = ((await rpc("pulse_fn_account", { p_profilo: profilo })) || [])[0];
  if (!acc) return { verificati: 0, scartati: 0, nota: "Instagram non collegato" };
  const list = (await rpc("pulse_fn_seguiti_proposti", { p_profilo: profilo })) || [];
  let ok = 0, no = 0;
  for (const s of list) {
    try {
      const r = await g(`${GRAPH}/${acc.ig_user_id}?fields=business_discovery.username(${encodeURIComponent(s.handle)}){username,followers_count,media_count,media.limit(40){${FIELDS}}}&access_token=${acc.token}`);
      const bd = r.business_discovery;
      const m = riassumi(bd.followers_count, bd.media?.data || []);
      await rpc("pulse_fn_seguiti_verifica", { p_id: s.id, p_metriche: m, p_errore: null });
      ok++;
    } catch (e) {
      await rpc("pulse_fn_seguiti_verifica", { p_id: s.id, p_metriche: null, p_errore: "Non leggibile su Instagram: " + String(e.message).slice(0, 150) });
      no++;
    }
  }
  return { verificati: ok, scartati: no };
}
export async function runMonitor(profilo) {
  await verificaProposti(profilo);
  const acc = ((await rpc("pulse_fn_account", { p_profilo: profilo })) || [])[0];
  if (!acc) { await rpc("pulse_fn_analisi_set", { p_org: ORG, p_profilo: profilo, p_tipo: "top", p_stato: "errore", p_dati: null, p_errore: "Instagram non collegato" }); return; }
  // dati propri
  try {
    const me = await g(`${GRAPH}/${acc.ig_user_id}?fields=username,followers_count,media_count,media.limit(40){${FIELDS}}&access_token=${acc.token}`);
    const s = riassumi(me.followers_count, me.media?.data || []);
    await rpc("pulse_fn_analisi_set", { p_org: ORG, p_profilo: profilo, p_tipo: "miei", p_stato: "pronta", p_dati: { username: me.username, media_count: me.media_count, ...s }, p_errore: null });
  } catch (e) { await rpc("pulse_fn_analisi_set", { p_org: ORG, p_profilo: profilo, p_tipo: "miei", p_stato: "errore", p_dati: null, p_errore: String(e.message).slice(0, 300) }); }
  // profili approvati
  const list = (await rpc("pulse_fn_seguiti_list", { p_profilo: profilo })) || [];
  const tutti = [];
  for (const s of list) {
    try {
      const r = await g(`${GRAPH}/${acc.ig_user_id}?fields=business_discovery.username(${encodeURIComponent(s.handle)}){followers_count,media_count,media.limit(40){${FIELDS}}}&access_token=${acc.token}`);
      const bd = r.business_discovery;
      const m = riassumi(bd.followers_count, bd.media?.data || []);
      tutti.push({ handle: s.handle, ...m });
      await rpc("pulse_fn_seguiti_metriche", { p_id: s.id, p_metriche: m, p_errore: null });
    } catch (e) {
      await rpc("pulse_fn_seguiti_metriche", { p_id: s.id, p_metriche: null, p_errore: String(e.message).slice(0, 250) });
    }
  }
  const top = tutti.flatMap((t) => t.top.map((p) => ({ handle: t.handle, ...p }))).sort((a, b) => b.engagement - a.engagement).slice(0, 12);
  let letture = "";
  if (top.length) {
    letture = (await claude(`Questi sono i post con più engagement (like+commenti / follower) di profili del settore, letti da Instagram. Dati reali:\n${JSON.stringify(top)}\n\nScrivi in italiano, in 5-7 righe, cosa hanno in comune (tipo di contenuto, hook, tema, lunghezza della caption) SOLO in base a questi dati. Se i dati sono pochi dillo. Non inventare numeri. Non copiare le caption.`)).trim();
  }
  await rpc("pulse_fn_analisi_set", { p_org: ORG, p_profilo: profilo, p_tipo: "top", p_stato: tutti.length ? "pronta" : "errore", p_dati: { profili: tutti, top, letture }, p_errore: tutti.length ? null : "Nessun profilo approvato leggibile" });
}
