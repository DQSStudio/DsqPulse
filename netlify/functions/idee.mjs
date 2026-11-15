// L'agente propone idee e spunti di contenuto, con dati reali: conoscenza del brand, analisi di mercato, hashtag e risultati dei propri post.
import { ORG, rpc, userIsMember, logUso, pulisci, getConoscenza } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  const { profilo, brand = {}, contesto = {} } = await req.json().catch(() => ({}));
  if (!["studio", "lab"].includes(profilo)) return Response.json({ error: "profilo" }, { status: 400 });
  const kn = await getConoscenza(profilo);
  const prompt = `Sei il social media manager e art director di ${brand.name}. ${brand.lead || ""}
CONOSCENZA DEL BRAND (usa solo questi fatti):\n${kn.slice(0, 3500)}
DATI REALI DISPONIBILI (possono mancare):\n${JSON.stringify(contesto).slice(0, 4000)}
Proponi 8 idee di contenuto diverse tra loro per i prossimi giorni, per Instagram (e se ha senso TikTok, Pinterest, YouTube). Mescola formati: almeno 3 caroselli, almeno 2 reel, il resto post singoli o storie. Ogni idea deve essere concreta e realizzabile, con un gancio forte, e nascere dai dati: spiega in una riga perché funziona (che dato o trend la sostiene). Non inventare numeri, clienti o risultati. Evita idee già in elenco "gia_fatte".
Per ogni idea indica anche che materiale visivo serve: "grafica" (testo e colori, la crea l'app), "foto" (foto che hai già), "immagine_ai" (immagine generata) o "video" (clip).
Dentro i testi non usare virgolette doppie. Rispondi SOLO con JSON: {"idee":[{"titolo":"","piattaforma":"IG|TT|PN|YT","formato":"Carousel|Reel|Post|Storia|Video breve|Pin|Short","gancio":"prima frase che cattura","perche":"","visual":"grafica|foto|immagine_ai|video"}]}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }) });
  const j = await r.json(); await logUso("idee", MODEL, j.usage);
  if (!r.ok) return Response.json({ error: "anthropic " + r.status }, { status: 502 });
  const m = (j.content || []).map((x) => x.text || "").join("").match(/\{[\s\S]*\}/);
  try {
    const out = pulisci(JSON.parse(m[0]));
    await rpc("pulse_fn_analisi_set", { p_org: ORG, p_profilo: profilo, p_tipo: "idee", p_stato: "pronta", p_dati: out, p_errore: null });
    return Response.json(out);
  } catch { return Response.json({ error: "risposta non leggibile" }, { status: 502 }); }
};
