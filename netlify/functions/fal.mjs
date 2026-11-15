// Immagini e video AI su richiesta (fal.ai). Azioni: immagine, video, stato.
import { userIsMember, logUso, rpc, ORG, SB, SBK } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
const IMG = "fal-ai/flux-pro/v1.1", VID = "fal-ai/kling-video/v2.1/standard/image-to-video";
const FAL = () => ({ Authorization: "Key " + process.env.FAL_KEY, "content-type": "application/json" });
const okHost = (u) => /^https:\/\/[a-z0-9.-]+\.fal\.(run|media|ai)\//.test(u);

async function consumo(funzione, modello, costo) { try { await rpc("pulse_fn_consumo", { p_org: ORG, p_funzione: funzione, p_modello: modello, p_in: 0, p_out: 0, p_ricerche: 0, p_costo: costo }); } catch {} }

async function promptDa(istruzione) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: istruzione }] }) });
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
      const { brand = {}, identita = {}, tema = "", richiesta = "", formato = "", piattaforma = "" } = b;
      const verticale = !/post|carosel|carousel/i.test(formato) || /pin/i.test(formato);
      const prompt = await promptDa(`Scrivi UN prompt in inglese (max 90 parole) per un generatore di immagini fotografiche (Flux). Brand: ${brand.name || ""} (${brand.desc || ""}). Tema del contenuto: ${tema}. Richiesta specifica: ${richiesta || "scegli tu il soggetto più efficace"}. Piattaforma: ${piattaforma}. Stile del brand: ${identita.stile || "minimale, pulito"}; palette ${JSON.stringify(identita.colori || {})}.
Descrivi soggetto, ambiente, luce, inquadratura, materiali, atmosfera; look fotografico realistico, editoriale. NESSUN testo, logo, scritta o persona riconoscibile nell'immagine. Rispondi solo con il prompt.`);
      const r = await fetch("https://queue.fal.run/" + IMG, { method: "POST", headers: FAL(), body: JSON.stringify({ prompt, image_size: verticale ? "portrait_16_9" : "portrait_4_3", num_images: 1, output_format: "jpeg", safety_tolerance: "2" }) });
      const j = await r.json();
      if (!r.ok) return Response.json({ error: "fal " + r.status + " " + JSON.stringify(j).slice(0, 160) }, { status: 502 });
      await consumo("immagine-ai", IMG, 0.04);
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
      if (s.status !== "COMPLETED") return Response.json({ stato: "errore", error: JSON.stringify(s).slice(0, 160) });
      const rr = await fetch(response_url, { headers: FAL() });
      const out = await rr.json();
      if (!rr.ok) return Response.json({ stato: "errore", error: "fal " + rr.status + " " + JSON.stringify(out).slice(0, 160) });
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
