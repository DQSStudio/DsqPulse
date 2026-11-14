// Analisi di mercato con ricerca web reale (Claude + web search). Salva risultato e profili proposti.
import { readFileSync } from "node:fs";
import { ORG, rpc, userIsMember } from "./_lib.mjs";
const KB = { studio: readFileSync(new URL("./brand-studio.txt", import.meta.url), "utf8") };
const MODEL = "claude-sonnet-5-5";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return new Response("no", { status: 401 });
  const { profilo, brand = {} } = await req.json().catch(() => ({}));
  if (!["studio", "lab"].includes(profilo)) return new Response("profilo", { status: 400 });
  const set = (stato, dati, errore) => rpc("pulse_fn_analisi_set", { p_org: ORG, p_profilo: profilo, p_tipo: "mercato", p_stato: stato, p_dati: dati, p_errore: errore || null });
  await set("in_corso", null, null);
  try {
    const prompt = `Sei un analista di social media. Brand: ${brand.name}. ${brand.lead || ""}
Target: ${brand.target || ""}. Tono: ${brand.tono || ""}.
${KB[profilo] ? "Conoscenza del brand:\n" + KB[profilo] : ""}
Usa la ricerca web per analizzare, oggi, il settore di questo brand sui social (Instagram prima di tutto, poi TikTok, Pinterest, YouTube) in Italia. Trova: quali formati e temi stanno funzionando, trend e hashtag attuali, e 8-10 profili Instagram reali e pubblici (studi, designer, creator del settore, italiani o internazionali con pubblico ampio) che vale la pena osservare.
Regole: usa SOLO ciò che trovi nelle fonti; se non sei sicuro che un account esista o sia attivo non includerlo; non inventare numeri di follower o statistiche; ogni trend e ogni profilo devono avere l'URL della fonte. Scrivi in italiano.
Rispondi SOLO con JSON valido: {"sintesi":"4-6 righe","formati":[{"nome":"","perche":""}],"trend":[{"titolo":"","dettaglio":"","fonte":"url"}],"hashtag":["#..."],"idee":[{"titolo":"","piattaforma":"IG|TT|PN|YT","formato":"","perche":""}],"profili":[{"handle":"senza @","perche":"","fonte":"url"}]}`;
    let messages = [{ role: "user", content: prompt }], text = "";
    for (let i = 0; i < 4; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }], messages }) });
      const j = await r.json();
      if (!r.ok) throw new Error("Anthropic " + r.status + " " + JSON.stringify(j).slice(0, 200));
      text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      if (j.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: j.content }]; continue; }
      break;
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("risposta non leggibile");
    const dati = JSON.parse(m[0]);
    await set("pronta", dati, null);
    for (const p of dati.profili || []) if (p.handle) await rpc("pulse_fn_seguiti_add", { p_org: ORG, p_profilo: profilo, p_handle: p.handle, p_perche: p.perche || null, p_fonte: p.fonte || null });
  } catch (e) { await set("errore", null, String(e.message).slice(0, 300)); }
  return new Response("ok");
};
