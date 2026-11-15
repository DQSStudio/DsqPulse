// Ricerca per hashtag su Instagram (Hashtag Search API): post più popolari e recenti con quell'hashtag.
import { GRAPH, ORG, rpc, userIsMember } from "./_lib.mjs";
const FIELDS = "id,caption,media_type,like_count,comments_count,permalink,timestamp";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return new Response("no", { status: 401 });
  const { profilo, tag = "" } = await req.json().catch(() => ({}));
  const q = String(tag).replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
  if (!["studio", "lab"].includes(profilo) || !q) return Response.json({ error: "hashtag non valido" }, { status: 400 });
  const acc = ((await rpc("pulse_fn_account", { p_profilo: profilo })) || [])[0];
  if (!acc) return Response.json({ error: "Instagram non collegato" }, { status: 400 });
  const g = async (u) => { const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || "errore Meta"); return j; };
  try {
    const id = (await g(`${GRAPH}/ig_hashtag_search?user_id=${acc.ig_user_id}&q=${encodeURIComponent(q)}&access_token=${acc.token}`)).data?.[0]?.id;
    if (!id) return Response.json({ error: "Hashtag non trovato" }, { status: 404 });
    const [top, rec] = await Promise.all([
      g(`${GRAPH}/${id}/top_media?user_id=${acc.ig_user_id}&fields=${FIELDS}&limit=25&access_token=${acc.token}`),
      g(`${GRAPH}/${id}/recent_media?user_id=${acc.ig_user_id}&fields=${FIELDS}&limit=25&access_token=${acc.token}`),
    ]);
    return Response.json({ tag: q, top: top.data || [], recenti: rec.data || [] });
  } catch (e) { return Response.json({ error: String(e.message).slice(0, 300) }, { status: 502 }); }
};
