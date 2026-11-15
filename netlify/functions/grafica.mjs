// Dal contenuto e dall'identità grafica del profilo, l'agente decide la composizione della grafica (layout) in JSON.
import { userIsMember, logUso, pulisci } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { brand = {}, identita = {}, tema = "", hook = "", caption = "", formato = "", piattaforma = "", variante = 0 } = b;
  const imgs = (identita.riferimenti || []).map((r) => r.url).filter((u) => /^https:\/\/qudoygcfphqhhyenpwlr\.supabase\.co\/storage\//.test(u)).slice(0, 2).map((u) => ({ type: "image", source: { type: "url", url: u } }));
  const testo = `Sei un graphic designer professionista che crea grafiche per i social di ${brand.name || "un brand"}.
IDENTITÀ GRAFICA OBBLIGATORIA: font titoli ${identita.font_titoli || "Jost"}, font testo ${identita.font_testo || "Jost"}, colori ${JSON.stringify(identita.colori || {})}, wordmark ${identita.wordmark || ""}. Stile: ${identita.stile || "minimale e pulito"}.
${imgs.length ? "Ti ho allegato grafiche già realizzate come base: mantieni la stessa impostazione (gerarchia, spazi, linee, allineamento) senza copiarle." : ""}
Piattaforma: ${piattaforma}. Formato: ${formato}. Tema: ${tema}. Hook: ${hook}. Caption: ${String(caption).slice(0, 300)}.
${variante ? "Proponi una composizione DIVERSA dalle precedenti (variante " + variante + ")." : ""}
Scegli il template più adatto e scrivi i testi per la grafica: brevi, forti, in italiano, senza inventare dati. Sulla grafica il testo deve essere molto più corto della caption.
Rispondi SOLO con JSON (niente virgolette doppie nei testi): {"template":"titolo|citazione|elenco","titolo":"max 60 caratteri","sottotitolo":"max 90 caratteri o vuoto","punti":["max 4 punti brevi, solo per il template elenco"],"cta":"max 28 caratteri o vuoto","allineamento":"sinistra|centro","foto":true o false se serve una foto di sfondo,"nota":"una riga su perché questa composizione"}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content: [...imgs, { type: "text", text: testo }] }] }) });
  const j = await r.json(); await logUso("grafica", MODEL, j.usage);
  if (!r.ok) return Response.json({ error: "anthropic " + r.status }, { status: 502 });
  const m = (j.content || []).map((x) => x.text || "").join("").match(/\{[\s\S]*\}/);
  try { return Response.json(pulisci(JSON.parse(m[0]))); } catch { return Response.json({ error: "risposta non leggibile" }, { status: 502 }); }
};
