// pocketjs-notify server — the "server pushes a notification, the PocketJS
// app answers yes/no, the answer is recorded" counterpart of JG-122.
//
//   POST /notify  {text}            queue a notification (1..120 printable ASCII)
//   GET  /pending                    oldest-first pending queue
//   POST /answer  {id, answer}       answer "yes"|"no"; pops the id, records it
//   GET  /answers                    recorded answers (also echoed to stdout)
//   GET  /                           tiny sender page (input + button + answers)
//
// CORS is open: the PocketJS browser dev host serves the app at :8130 while
// this server runs at :8899, so the guest's JSON POST needs a preflight answer.

import { Hono } from "hono";
import { cors } from "hono/cors";

interface PendingItem {
  id: number;
  text: string;
}

interface AnswerRecord {
  id: number;
  text: string;
  answer: "yes" | "no";
  at: number;
}

const app = new Hono();
app.use("*", cors());

let nextId = 1;
const pending: PendingItem[] = [];
const answers: AnswerRecord[] = [];

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

app.post("/notify", async (c) => {
  const body = await c.req.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length === 0 || text.length > 120 || !PRINTABLE_ASCII.test(text)) {
    return c.json({ error: "text must be 1..120 printable ASCII chars" }, 400);
  }
  const item: PendingItem = { id: nextId++, text };
  pending.push(item);
  console.log(`[notify]  queued id=${item.id} text="${item.text}" (pending=${pending.length})`);
  return c.json({ ok: true, id: item.id }, 201);
});

app.get("/pending", (c) => c.json({ pending }));

app.post("/answer", async (c) => {
  const body = await c.req.json().catch(() => null) as { id?: unknown; answer?: unknown } | null;
  const id = typeof body?.id === "number" ? body.id : Number.NaN;
  const answer = body?.answer === "yes" || body?.answer === "no" ? body.answer : null;
  if (answer === null || !Number.isInteger(id)) {
    return c.json({ error: "expected {id: number, answer: 'yes' | 'no'}" }, 400);
  }
  const idx = pending.findIndex((p) => p.id === id);
  if (idx === -1) {
    return c.json({ error: `no pending notification ${id}` }, 404);
  }
  const [item] = pending.splice(idx, 1);
  const record: AnswerRecord = { id: item.id, text: item.text, answer, at: Date.now() };
  answers.push(record);
  console.log(`[answer]  id=${record.id} answer=${record.answer} text="${record.text}" (total=${answers.length})`);
  return c.json({ ok: true, ...record });
});

app.get("/answers", (c) => c.json({ answers }));

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>pocketjs-notify</title>
<style>
  body { font: 14px/1.6 ui-monospace, Menlo, monospace; background: #0b0e17; color: #cbd5e1;
         max-width: 560px; margin: 40px auto; padding: 0 16px; }
  h1 { font-size: 18px; color: #e2e8f0; }
  input { width: 65%; padding: 8px; background: #1e293b; color: #e2e8f0;
          border: 1px solid #334155; border-radius: 6px; font: inherit; }
  button { padding: 8px 16px; background: #1e293b; color: #e2e8f0;
           border: 1px solid #334155; border-radius: 6px; font: inherit; cursor: pointer; }
  button:active { background: #6366f1; }
  #msg { color: #94a3b8; min-height: 1.6em; }
  li { margin: 2px 0; }
  .yes { color: #4ade80; } .no { color: #f87171; }
</style></head>
<body>
<h1>pocketjs-notify sender</h1>
<p><input id="text" maxlength="120" placeholder="notification text (ASCII only)"> <button id="send">Notify</button></p>
<p id="msg"></p>
<h2>Answers</h2>
<ol id="answers"></ol>
<script>
  const msg = document.getElementById("msg");
  document.getElementById("send").onclick = async () => {
    const text = document.getElementById("text").value.trim();
    const res = await fetch("/notify", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    msg.textContent = res.ok ? "queued (id " + (await res.json()).id + ")" :
      "rejected: " + (await res.json()).error;
    if (res.ok) document.getElementById("text").value = "";
  };
  document.getElementById("text").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("send").click();
  });
  const render = (rows) => {
    document.getElementById("answers").innerHTML = rows.map((a) =>
      '<li>#' + a.id + ' <span class="' + a.answer + '">' + a.answer.toUpperCase() +
      '</span> &mdash; ' + a.text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</li>').join("");
  };
  const refresh = async () => render((await (await fetch("/answers")).json()).answers.slice().reverse());
  refresh();
  setInterval(refresh, 2000);
</script>
</body></html>`;

app.get("/", (c) => c.html(PAGE));

const port = Number(process.env.PORT ?? 8899);
console.log(`pocketjs-notify server on http://127.0.0.1:${port}`);

export default {
  port,
  fetch: app.fetch,
};
