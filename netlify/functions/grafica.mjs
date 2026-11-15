// Dal contenuto e dall'identità grafica del profilo, l'agente decide la composizione della grafica (layout) in JSON.
import { userIsMember, logUso, pulisci } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { brand = {}, identita = {}, tema = "", hook = "", caption = "", formato = "", piattaforma = "", variante = 0, esempio = "" } = b;
  const imgs = [...(/^https:\/\/qudoygcfphqhhyenpwlr\.supabase\.co\/storage\//.test(esempio) ? [esempio] : []), ...(identita.riferimenti || []).map((r) => r.url)].filter((u) => /^https:\/\/qudoygcfphqhhyenpwlr\.supabase\.co\/storage\//.test(u)).slice(0, 3).map((u) => ({ type: "image", source: { type: "url", url: u } }));
  const testo = `Sei un graphic designer professionista che crea grafiche per i social di ${brand.name || "un brand"}.
IDENTITÀ GRAFICA OBBLIGATORIA: font titoli ${identita.font_titoli || "Jost"}, font testo ${identita.font_testo || "Jost"}, colori ${JSON.stringify(identita.colori || {})}, wordmark ${identita.wordmark || ""}. Stile: ${identita.stile || "minimale e pulito"}.
${/^https:\/\/qudoygcfphqhhyenpwlr/.test(esempio) ? "La PRIMA immagine allegata è il POST DI ESEMPIO scelto dal titolare: segui la sua impostazione (gerarchia, posizione degli elementi, allineamento, quantità di testo, uso delle linee) il più fedelmente possibile. " : ""}${imgs.length ? "Ti ho allegato grafiche già realizzate come base: mantieni la stessa impostazione (gerarchia, spazi, linee, allineamento) senza copiarle." : ""}
${identita.layout === "editoriale" ? "LAYOUT EDITORIALE (obbligatorio): ogni slide è UNA frase forte e completa, fino a 80 caratteri, che occupa molto spazio; puoi andare a capo con \\n tra due frasi brevi. Niente sottotitolo, niente elenchi: usa sempre il template titolo. Il numero 01 / 04 e la freccia sono automatici. L'ultima slide ha un invito all'azione (cta)." : ""}
Piattaforma: ${piattaforma}. Formato: ${formato}. Tema: ${tema}. Hook: ${hook}. Caption: ${String(caption).slice(0, 300)}.
${variante ? "Proponi una composizione DIVERSA dalle precedenti (variante " + variante + ")." : ""}
Scegli il template più adatto e scrivi i testi per la grafica: brevi, forti, in italiano, senza inventare dati. Sulla grafica il testo deve essere molto più corto della caption.
Rispondi SOLO con JSON (niente virgolette doppie nei testi): {"template":"titolo|citazione|elenco","titolo":"max 60 caratteri","sottotitolo":"max 90 caratteri o vuoto","punti":["max 4 punti brevi, solo per il template elenco"],"cta":"max 28 caratteri o vuoto","allineamento":"sinistra|centro","foto":true o false se serve una foto di sfondo,"layout":"classico oppure editoriale (editoriale = marchio con tre linee e nome spaziato in alto, contatore 01 / 04, titolone leggero molto grande, freccia in un cerchio in basso a destra); se c'è un post di esempio copia il suo, altrimenti usa ${identita.layout || 'classico'}","peso_titoli":"300|400|500|700 come nei titoli dell'esempio o ${identita.peso_titoli || '700'}","nota":"una riga su perché questa composizione"}`;
  const car = /carosel|carousel/i.test(formato);
  const istr = car
    ? `Questo è un CAROSELLO Instagram di 5-7 slide che racconta una cosa sola, con una storia chiara: slide 1 copertina che ferma lo scroll (titolo forte), slide centrali con un'idea ciascuna, ultima slide con invito all'azione. Ogni slide ha testi brevissimi. Per le slide scegli il template: titolo, citazione o elenco.\nRispondi SOLO con JSON (niente virgolette doppie nei testi): {"slides":[{"template":"titolo|citazione|elenco","titolo":"max 55 caratteri","sottotitolo":"max 90 caratteri o vuoto","punti":["max 3 punti brevi, solo per elenco"],"cta":"solo nell'ultima slide, max 28 caratteri"}],"allineamento":"sinistra|centro","layout":"classico oppure editoriale (editoriale = marchio con tre linee e nome spaziato in alto, contatore 01 / 04, titolone leggero molto grande, freccia in un cerchio in basso a destra); se c'è un post di esempio copia il suo, altrimenti usa ${identita.layout || 'classico'}","peso_titoli":"300|400|500|700 come nei titoli dell'esempio o ${identita.peso_titoli || '700'}","nota":"una riga su come hai costruito il carosello"}`
    : null;
  const testoFinale = istr ? testo.replace(/Rispondi SOLO con JSON[\s\S]*$/, istr) : testo;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: [{ role: "user", content: [...imgs, { type: "text", text: testoFinale }] }] }) });
  const j = await r.json(); await logUso("grafica", MODEL, j.usage);
  if (!r.ok) return Response.json({ error: "anthropic " + r.status }, { status: 502 });
  const m = (j.content || []).filter((x) => x.type === "text").map((x) => x.text || "").join("").match(/\{[\s\S]*\}/);
  try { return Response.json(pulisci(JSON.parse(m[0]))); } catch { return Response.json({ error: "risposta non leggibile" }, { status: 502 }); }
};
