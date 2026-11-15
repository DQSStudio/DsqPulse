// L'agente impara da un documento (PDF/testo) o da una risposta: aggiorna il riassunto del profilo e, se serve, fa domande.
import { ORG, rpc, userIsMember, logUso, pulisci, getConoscenza } from "./_lib.mjs";
const MODEL = "claude-sonnet-5-5";
async function claude(prompt, max) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: max, messages: [{ role: "user", content: prompt }] }) });
  const j = await r.json(); await logUso("impara", MODEL, j.usage);
  if (!r.ok) throw new Error("Anthropic " + r.status);
  return (j.content || []).map((x) => x.text || "").join("");
}
const estrai = (t) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error("risposta non leggibile"); return JSON.parse(m[0]); };
async function jsonSicuro(prompt, max) {
  const t = await claude(prompt, max);
  try { return pulisci(estrai(t)); }
  catch { return pulisci(estrai(await claude("Questo JSON è malformato. Restituiscilo identico nei contenuti ma valido. Rispondi solo con il JSON.\n\n" + t, max))); }
}
const REGOLE = `Regole: usa SOLO ciò che è scritto nel documento o nelle risposte, non inventare nulla. Scrivi in italiano. Dentro i testi non usare virgolette doppie (usa apostrofi) né a capo: per andare a capo nel riassunto usa il carattere | tra una riga e l'altra.`;
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return new Response("no", { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { modo, profilo, brand = {} } = b;
  if (!["studio", "lab"].includes(profilo) || !["doc", "risposta"].includes(modo)) return new Response("richiesta", { status: 400 });
  const attuale = await getConoscenza(profilo);
  const intro = `Sei l'agente social media di ${brand.name || profilo}. ${brand.lead || ""}\nRIASSUNTO ATTUALE DI COSA SAI SUL BRAND:\n${attuale || "(ancora vuoto)"}`;
  const nuovo = (s) => String(s || "").replace(/\s*\|\s*/g, "\n").trim();
  if (modo === "doc") {
    const { doc_id, nome = "documento", testo = "" } = b;
    const upd = (stato, tipo, appreso, errore) => rpc("pulse_fn_doc_update", { p_id: doc_id, p_stato: stato, p_tipo: tipo, p_appreso: appreso, p_errore: errore || null });
    try {
      const out = await jsonSicuro(`${intro}\n\nHAI RICEVUTO QUESTO DOCUMENTO (${nome}):\n"""\n${String(testo).slice(0, 60000)}\n"""\n\nCapisci che tipo di documento è (presentazione del brand, domande e risposte già compilate, analisi di mercato o di pubblico, listino, linee guida, altro) e comportati di conseguenza: se contiene domande con risposte, fai tue le risposte; se contiene un'analisi di mercato o di profilo, estrai pubblico, concorrenti, trend e posizionamento; se è una presentazione, estrai servizi, metodo, tono, punti di forza. Poi aggiorna il riassunto fondendo il nuovo con il vecchio, senza perdere ciò che era già giusto; se il documento contraddice il riassunto attuale, tieni il documento più recente e fai una domanda. Fai domande SOLO per ciò che manca davvero o è ambiguo e serve per scrivere buoni contenuti social (massimo 4, specifiche, a cui il titolare sa rispondere in due righe); se il documento è già completo, nessuna domanda.\n${REGOLE}\nRispondi SOLO con JSON: {"tipo":"breve etichetta","appreso":["5-8 punti brevi: cosa hai imparato da QUESTO documento"],"riassunto":"riassunto completo e aggiornato del brand, max 3000 caratteri, in sezioni con titolo in maiuscolo (CHI E', SERVIZI O PRODOTTI, TARGET, TONO E STILE, PUNTI DI FORZA, MERCATO E CONCORRENTI, DA EVITARE) e righe che iniziano con trattino, separate da |","domande":[{"q":"","perche":"a cosa mi serve"}]}`, 6000);
      if (!out.riassunto || out.riassunto.length < 50) throw new Error("riassunto vuoto");
      await rpc("pulse_fn_conoscenza_set", { p_org: ORG, p_profilo: profilo, p_testo: nuovo(out.riassunto) });
      for (const d of (out.domande || []).slice(0, 4)) if (d.q) await rpc("pulse_fn_domanda_add", { p_org: ORG, p_profilo: profilo, p_testo: d.q, p_perche: d.perche || null, p_fonte: nome });
      await upd("letto", out.tipo || null, { punti: out.appreso || [], domande: (out.domande || []).length }, null);
    } catch (e) { try { await upd("errore", null, null, String(e.message).slice(0, 250)); } catch {} }
  } else {
    try {
      const { domanda = "", risposta = "" } = b;
      const out = await jsonSicuro(`${intro}\n\nIl titolare ha risposto a una tua domanda.\nDOMANDA: ${String(domanda).slice(0, 400)}\nRISPOSTA: ${String(risposta).slice(0, 1500)}\n\nAggiorna il riassunto integrando questa informazione (nella sezione giusta), senza perdere il resto e senza allungarlo oltre 3000 caratteri.\n${REGOLE}\nRispondi SOLO con JSON: {"riassunto":"riassunto completo aggiornato, righe separate da |"}`, 4000);
      if (out.riassunto && out.riassunto.length > 50) await rpc("pulse_fn_conoscenza_set", { p_org: ORG, p_profilo: profilo, p_testo: nuovo(out.riassunto) });
    } catch {}
  }
  return new Response("ok");
};
