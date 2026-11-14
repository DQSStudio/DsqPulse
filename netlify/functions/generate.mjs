// Genera hook, scene, caption e hashtag con Claude. La chiave resta lato server.
import { readFileSync } from "node:fs";
const KB = { studio: readFileSync(new URL("./brand-studio.txt", import.meta.url), "utf8") };
const MODEL = "claude-sonnet-5-5";
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "chiave mancante" }, { status: 500 });
  let b;
  try { b = await req.json(); } catch { return Response.json({ error: "json non valido" }, { status: 400 }); }
  const { risposte = [], profilo = "", brand = {}, tema = "", social = "", formato = "", note = "" } = b;
  const prompt = `Sei il social media manager di ${brand.name || "Desearq"}.
Profilo: ${brand.lead || ""}
${KB[profilo] ? "CONOSCENZA DEL BRAND (usa solo questi fatti):\n" + KB[profilo] : ""}
Tono: ${brand.tono || ""}
Target: ${brand.target || ""}
Piattaforma: ${social}. Formato: ${formato}.
Tema: ${tema}.
${risposte.length ? "RISPOSTE DEL TITOLARE (hanno la precedenza sul resto):\n" + risposte.map((x) => "- " + String(x.q).slice(0, 200) + " → " + String(x.a).slice(0, 500)).join("\n") : ""}
${note ? "Note dell'utente: " + note : ""}
Scrivi in italiano, concreto, senza cliché e senza inventare numeri o fatti non forniti.
Rispondi SOLO con JSON valido: {"hook":"prima frase che cattura","scene":["3-5 scene brevi, solo se video/reel/storia, altrimenti []"],"cap":"caption pronta","tags":"hashtag separati da spazio, max 8"}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) return Response.json({ error: "anthropic " + r.status, detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const j = await r.json();
  const txt = (j.content || []).map((x) => x.text || "").join("");
  const m = txt.match(/\{[\s\S]*\}/);
  try { return Response.json(JSON.parse(m[0])); }
  catch { return Response.json({ error: "risposta non leggibile", raw: txt.slice(0, 400), stop: j.stop_reason }, { status: 502 }); }
};
