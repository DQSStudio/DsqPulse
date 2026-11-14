import { runMonitor } from "./_monitor.mjs";
export const config = { schedule: "0 5 * * *" };
export default async () => { for (const p of ["studio", "lab"]) { try { await runMonitor(p); } catch {} } return new Response("ok"); };
