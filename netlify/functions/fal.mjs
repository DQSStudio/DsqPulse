// Immagini e video AI su richiesta (fal.ai). Azioni: immagine, video, stato.
import { userIsMember, logUso, rpc, ORG, SB, SBK, getConoscenza } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
const IMG = "fal-ai/nano-banana-pro", IMG_EDIT = "fal-ai/nano-banana-pro/edit", VID = "fal-ai/kling-video/v2.1/standard/image-to-video";
const FAL = () => ({ Authorization: "Key " + process.env.FAL_KEY, "content-type": "application/json" });
const okHost = (u) => /^https:\/\/([a-z0-9.-]+\.fal\.(run|media|ai)\/|storage\.googleapis\.com\/falserverless\/)/.test(u);

async function consumo(funzione, modello, costo) { try { await rpc("pulse_fn_consumo", { p_org: ORG, p_funzione: funzione, p_modello: modello, p_in: 0, p_out: 0, p_ricerche: 0, p_costo: costo }); } catch {} }

async function promptDa(istruzione, imgs = []) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: [...imgs, { type: "text", text: istruzione }] }] }) });
  const j = await r.json(); await logUso("fal-prompt", MODEL, j.usage);
  if (!r.ok) throw new Error("anthropic " + r.status);
  return (j.content || []).map((x) => x.text || "").join("").replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 900);
}

export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  if (!process.env.FAL_KEY) return Response.json({ error: "FAL_KEY non impostata su Netlify" }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const { azione } = b;
  try {
    if (azione === "immagine") {
      const { brand = {}, identita = {}, profilo = "", tema = "", hook = "", scene = [], caption = "", richiesta = "", formato = "", piattaforma = "", modo = "foto", senza_rif = false } = b;
      const ar = /pin/i.test(formato) ? "2:3" : /post|carosel|carousel/i.test(formato) ? "4:5" : "9:16";
      const post = modo === "post";
      const kn = await getConoscenza(profilo).catch(() => "");
      const refs = senza_rif ? [] : (identita.riferimenti || []).map((r) => r.url).filter((u) => /^https:\/\/qudoygcfphqhhyenpwlr\.supabase\.co\/storage\//.test(u)).slice(0, 3);
      const refBlocks = refs.map((u) => ({ type: "image", source: { type: "url", url: u } }));
      const comune = `CONOSCENZA DEL BRAND:\n${String(kn).slice(0, 3500)}\nCONTENUTO: piattaforma ${piattaforma}, formato ${formato}. Tema: ${tema}. Hook: ${hook}. Scene: ${JSON.stringify(scene).slice(0, 500)}. Caption: ${String(caption).slice(0, 500)}.\nRICHIESTA DEL TITOLARE: ${richiesta || "nessuna: scegli tu"}.\nIdentità grafica: font titoli ${identita.font_titoli || ""}, font testo ${identita.font_testo || ""}, colori ${JSON.stringify(identita.colori || {})}, wordmark "${identita.wordmark || ""}", sottotitolo "${identita.sottotitolo || ""}". Stile: ${identita.stile || "minimale, pulito"}.`;
      const prompt = post
        ? await promptDa(`Sei il direttore creativo di ${brand.name || "un brand"}. Scrivi UN prompt in inglese (max 170 parole) per un generatore di immagini che sa scrivere testo (Nano Banana Pro) per produrre la GRAFICA SOCIAL FINITA di questo contenuto, pronta da pubblicare.
${comune}
${refBlocks.length ? "Ti allego grafiche di riferimento del brand: la nuova grafica deve avere la stessa impostazione (gerarchia, spazi, linee sottili, allineamento, wordmark in alto, stile tipografico) ma contenuto diverso; indicalo nel prompt come 'match the visual style of the reference images'." : ""}
Nel prompt scrivi: formato verticale ${ar}, layout preciso (wordmark in alto a sinistra con linea sottile, titolo grande, sottotitolo, eventuale elemento visivo coerente con il tema, firma in basso), colori in esadecimale, font descritto (es. clean geometric sans-serif), e i TESTI ESATTI in italiano tra virgolette (titolo massimo 8 parole, sottotitolo massimo 12 parole, eventuale invito all'azione breve). Il testo deve essere corretto, senza refusi, senza testo extra. Nessun dato inventato. Se il brand vende software, l'eventuale visual mostra il prodotto o il lavoro dello studio in modo astratto e pulito. Rispondi solo con il prompt.`, refBlocks)
        : await promptDa(`Sei il direttore creativo di ${brand.name || "un brand"}. Scrivi UN prompt in inglese (max 100 parole) per un generatore di immagini fotografiche che produca l'immagine giusta per QUESTO contenuto.
${comune}
${refBlocks.length ? "Ti allego grafiche di riferimento del brand: l'immagine deve essere coerente per atmosfera, luce e palette." : ""}
REGOLE: l'immagine deve rappresentare in modo diretto e riconoscibile il soggetto del contenuto e il mondo reale del brand (pubblico, ambiente di lavoro, prodotti), mai texture astratte o oggetti casuali. Se il brand vende software, mostra ciò che il software cambia nel lavoro (studio di architettura, scrivania con monitor e planimetrie, modelli, cantiere) con schermi dall'interfaccia astratta. Se è interior design, ambienti reali e curati. Descrivi soggetto, ambiente, luce, inquadratura, materiali, atmosfera; look fotografico editoriale. Nessun testo, logo, scritta, volto riconoscibile. Rispondi solo con il prompt.`, refBlocks);
      const input = { prompt, aspect_ratio: ar, resolution: "1K", num_images: 1, output_format: "jpeg" };
      let ep = IMG; if (post && refs.length) { ep = IMG_EDIT; input.image_urls = refs; }
      const r = await fetch("https://queue.fal.run/" + ep, { method: "POST", headers: FAL(), body: JSON.stringify(input) });
      const j = await r.json();
      if (!r.ok) return Response.json({ error: "fal " + r.status + " " + JSON.stringify(j).slice(0, 160) }, { status: 502 });
      await consumo("immagine-ai", ep, 0.15);
      return Response.json({ tipo: "immagine", prompt, status_url: j.status_url, response_url: j.response_url });
    }
    if (azione === "video") {
      const { brand = {}, tema = "", richiesta = "", image_url = "", durata = 5 } = b;
      if (!/^https:\/\/qudoygcfphqhhyenpwlr\.supabase\.co\/storage\//.test(image_url)) return Response.json({ error: "immagine di partenza non valida" }, { status: 400 });
      const prompt = await promptDa(`Scrivi UN prompt in inglese (max 50 parole) per animare questa immagine in un breve video verticale per ${brand.name || "un brand"}: tema ${tema}. Richiesta: ${richiesta || "movimento di camera lento e elegante"}. Descrivi solo movimento di camera e movimento naturale (luce, tende, vapore…), niente testo. Rispondi solo con il prompt.`);
      const dur = Number(durata) === 10 ? "10" : "5";
      const r = await fetch("https://queue.fal.run/" + VID, { method: "POST", headers: FAL(), body: JSON.stringify({ prompt, image_url, duration: dur, negative_prompt: "text, watermark, distortion, blur" }) });
      const j = await r.json();
      if (!r.ok) return Response.json({ error: "fal " + r.status + " " + JSON.stringify(j).slice(0, 160) }, { status: 502 });
      await consumo("video-ai", VID, dur === "10" ? 0.7 : 0.35);
      return Response.json({ tipo: "video", prompt, status_url: j.status_url, response_url: j.response_url });
    }
    if (azione === "stato") {
      const { status_url, response_url, tipo } = b;
      if (!okHost(status_url || "") || !okHost(response_url || "")) return Response.json({ error: "url non valido" }, { status: 400 });
      const s = await (await fetch(status_url, { headers: FAL() })).json();
      if (s.status === "IN_QUEUE" || s.status === "IN_PROGRESS") return Response.json({ stato: "in_corso" });
      if (s.status !== "COMPLETED") return Response.json({ stato: "errore", error: JSON.stringify(s).slice(0, 400) });
      const rr = await fetch(response_url, { headers: FAL() });
      const out = await rr.json();
      if (!rr.ok) return Response.json({ stato: "errore", error: "fal " + rr.status + " " + JSON.stringify(out).slice(0, 400) });
      if (tipo === "immagine") {
        const u = out.images?.[0]?.url; if (!u || !okHost(u)) return Response.json({ stato: "errore", error: "nessuna immagine" });
        const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
        return Response.json({ stato: "pronto", data: "data:image/jpeg;base64," + buf.toString("base64") });
      }
      const u = out.video?.url; if (!u || !okHost(u)) return Response.json({ stato: "errore", error: "nessun video" });
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      const path = `${ORG}/video/${Date.now()}.mp4`;
      const up = await fetch(`${SB}/storage/v1/object/pulse-media/${path}`, { method: "POST", headers: { apikey: SBK, Authorization: "Bearer " + jwt, "content-type": "video/mp4", "x-upsert": "true" }, body: buf });
      if (!up.ok) return Response.json({ stato: "errore", error: "salvataggio video " + up.status });
      return Response.json({ stato: "pronto", url: `${SB}/storage/v1/object/public/pulse-media/${path}` });
    }
    return Response.json({ error: "azione sconosciuta" }, { status: 400 });
  } catch (e) { return Response.json({ error: String(e.message).slice(0, 200) }, { status: 500 }); }
};
