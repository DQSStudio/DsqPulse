import { userIsMember } from "./_lib.mjs";
import { runMonitor } from "./_monitor.mjs";
export default async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt || !(await userIsMember(jwt))) return new Response("no", { status: 401 });
  const { profilo } = await req.json().catch(() => ({}));
  if (["studio", "lab"].includes(profilo)) await runMonitor(profilo);
  return new Response("ok");
};
