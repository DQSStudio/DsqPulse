// L'agente propone l'identità grafica (font, colori, stile) guardando le immagini di riferimento e, se richiesto, cercando ispirazione sul web.
import { ORG, rpc, userIsMember, logUso, pulisci, getConoscenza } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
export const FONTS = ["Jost", "Montserrat", "Poppins", "Raleway", "DM Sans", "Inter", "Playfair Display", "Cormorant Garamond", "Lora", "Bebas Neue", "Oswald", "Archivo Black"];
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return new Response("no", { status: 401 });
  const { profilo, brand = {}, riferimenti = [], web = false, attuale = {} } = await req.json().catch(() => ({}));
  if (!["studio", "lab"].includes(profilo)) return new Response("profilo", { status: 400 });
  const set = (o) => rpc("pulse_fn_identita_merge", { p_org: ORG, p_profilo: profilo, p_dati: o });
  await set({ proposta_stato: "in_corso" });
  try {
    const imgs = riferimenti.filter((u) => /^https:\/\/qudoygcfphqhhyenpwlr\.supabase\.co\/storage\//.test(u)).slice(0, 4).map((u) => ({ type: "image", source: { type: "url", url: u } }));
    const kn = await getConoscenza(profilo);
    const testo = `Sei un graphic designer e art director per social media. Brand: ${brand.name}. ${brand.lead || ""}\nCONOSCENZA DEL BRAND:\n${kn.slice(0, 3000)}\nIDENTITÀ GRAFICA ATTUALE (se presente): ${JSON.stringify(attuale).slice(0, 800)}\n${imgs.length ? `Ti ho allegato ${imgs.length} immagini di riferimento (grafiche già realizzate o ispirazioni): analizza font, colori, composizione, uso dello spazio, linee e wordmark.` : "Non ci sono immagini di riferimento."}\n${web ? "Usa la ricerca web per vedere come comunicano graficamente su Instagram brand e studi simili di successo nello stesso settore, e prendi spunto (senza copiare nessuno)." : ""}\nProponi un'identità grafica coerente per i post social del brand. Il font va scelto SOLO da questo elenco (Google Fonts): ${FONTS.join(", ")}. I colori in esadecimale (#RRGGBB).\nNon usare virgolette doppie nei testi. Rispondi SOLO con JSON: {"font_titoli":"","font_testo":"","colori":{"sfondo":"","testo":"","primario":"","secondario":""},"stile":"3-5 righe: composizione, uso di linee e spazi, tono visivo, cosa evitare","nota":"cosa hai visto nei riferimenti o trovato sul web, con eventuali fonti"}`;
    let messages = [{ role: "user", content: [...imgs, { type: "text", text: testo }] }], text = "";
    for (let i = 0; i < 4; i++) {
      const body = { model: MODEL, max_tokens: 3000, messages };
      if (web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); await logUso("identita", MODEL, j.usage);
      if (!r.ok) throw new Error("Anthropic " + r.status + " " + JSON.stringify(j).slice(0, 160));
      text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      if (j.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: j.content }]; continue; }
      break;
    }
    const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("risposta non leggibile");
    const p = pulisci(JSON.parse(m[0]));
    const hex = (c, d) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : d);
    const c = p.colori || {};
    const out = { font_titoli: FONTS.includes(p.font_titoli) ? p.font_titoli : "Jost", font_testo: FONTS.includes(p.font_testo) ? p.font_testo : "Jost",
      colori: { sfondo: hex(c.sfondo, "#F4EFE6"), testo: hex(c.testo, "#111111"), primario: hex(c.primario, "#C8B79A"), secondario: hex(c.secondario, "#6E2635") }, stile: p.stile || "", nota: p.nota || "" };
    await set({ proposta: out, proposta_stato: "pronta" });
  } catch (e) { await set({ proposta_stato: "errore", proposta_errore: String(e.message).slice(0, 200) }).catch(() => {}); }
  return new Response("ok");
};
