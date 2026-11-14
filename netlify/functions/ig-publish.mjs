// Ogni 15 minuti pubblica su Instagram i contenuti programmati arrivati a scadenza.
import { GRAPH, rpc } from "./_lib.mjs";
export const config = { schedule: "*/15 * * * *" };
const post = async (u, body) => { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const x = await r.json(); if (!r.ok || x.error) throw new Error(x.error?.message || "errore Meta"); return x; };
const get = async (u) => { const r = await fetch(u); return r.json(); };
export default async () => {
  const items = (await rpc("pulse_fn_da_pubblicare", {})) || [];
  for (const c of items) {
    try {
      const acc = ((await rpc("pulse_fn_account", { p_profilo: c.profilo })) || [])[0];
      if (!acc) throw new Error("account Instagram non collegato");
      if (!c.media_url) throw new Error("manca l'immagine o il video da pubblicare");
      const caption = [c.caption, c.tags].filter(Boolean).join("\n\n");
      const f = (c.formato || "").toLowerCase();
      const isVideo = /reel|video/.test(f), isStory = /stori/.test(f);
      if (/carosell/.test(f)) throw new Error("i caroselli non sono ancora supportati");
      const body = { access_token: acc.token };
      if (isVideo) { body.media_type = isStory ? "STORIES" : "REELS"; body.video_url = c.media_url; if (!isStory) body.caption = caption; }
      else if (isStory) { body.media_type = "STORIES"; body.image_url = c.media_url; }
      else { body.image_url = c.media_url; body.caption = caption; }
      const cont = await post(`${GRAPH}/${acc.ig_user_id}/media`, body);
      for (let i = 0; i < 20; i++) {
        const s = await get(`${GRAPH}/${cont.id}?fields=status_code&access_token=${acc.token}`);
        if (s.status_code === "FINISHED") break;
        if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("elaborazione Meta fallita");
        await new Promise((r) => setTimeout(r, 3000));
      }
      const pub = await post(`${GRAPH}/${acc.ig_user_id}/media_publish`, { creation_id: cont.id, access_token: acc.token });
      await rpc("pulse_fn_esito", { p_id: c.id, p_stato: "pubblicato", p_media: pub.id, p_errore: null });
    } catch (e) {
      await rpc("pulse_fn_esito", { p_id: c.id, p_stato: "errore", p_media: null, p_errore: String(e.message).slice(0, 300) }).catch(() => {});
    }
  }
  return new Response("ok");
};
