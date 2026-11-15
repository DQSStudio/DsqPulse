// Scarica le ultime pubblicazioni del profilo Instagram collegato e le salva come grafiche di riferimento del brand.
import { userIsMember, rpc, ORG, SB, SBK, GRAPH } from "./_lib.mjs";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return Response.json({ error: "non autorizzato" }, { status: 401 });
  const { profilo } = await req.json().catch(() => ({}));
  if (!["studio", "lab"].includes(profilo)) return Response.json({ error: "profilo" }, { status: 400 });
  try {
    const acc = ((await rpc("pulse_fn_account", { p_profilo: profilo })) || [])[0];
    if (!acc?.token) return Response.json({ error: "Instagram non collegato a questo profilo" }, { status: 400 });
    const r = await fetch(`${GRAPH}/${acc.ig_user_id}/media?fields=media_type,media_url,thumbnail_url,permalink&limit=24&access_token=${acc.token}`);
    const j = await r.json();
    if (!r.ok) return Response.json({ error: "Instagram: " + (j.error?.message || r.status) }, { status: 502 });
    const lista = (j.data || []).map((m) => ({ id: m.id, url: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url })).filter((m) => m.url).slice(0, 9);
    if (!lista.length) return Response.json({ error: "Nessuna pubblicazione trovata sul profilo" }, { status: 404 });
    const out = (await Promise.all(lista.map(async (m, i) => {
      try {
        const img = await fetch(m.url); if (!img.ok) return null;
        const buf = Buffer.from(await img.arrayBuffer());
        const path = `${ORG}/${profilo}/ig-${m.id}.jpg`;
        const up = await fetch(`${SB}/storage/v1/object/pulse-media/${path}`, { method: "POST", headers: { apikey: SBK, Authorization: "Bearer " + jwt, "content-type": "image/jpeg", "x-upsert": "true" }, body: buf });
        if (!up.ok) return null;
        return { url: `${SB}/storage/v1/object/public/pulse-media/${path}`, nome: "Instagram " + (i + 1), ig: true };
      } catch { return null; }
    }))).filter(Boolean);
    if (!out.length) return Response.json({ error: "Non sono riuscito a scaricare le immagini" }, { status: 502 });
    return Response.json({ riferimenti: out });
  } catch (e) { return Response.json({ error: String(e.message).slice(0, 200) }, { status: 500 }); }
};
