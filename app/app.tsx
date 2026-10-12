// pocketjs-notify/app/app.tsx — JG-122: poll /pending, answer YES/NO.
//
// Phases: idle --(poll finds pending)--> alert --(button press)--> sending
//         --> idle on 2xx, back to alert on failure (server keeps it pending).
//
// Polling: a self-chaining after() every 2.5 virtual seconds (the virtual
// clock equals wall time on the 60 Hz dev host) — NET v1 has no push channel,
// polling is the design. One request in flight at a time; the answer POST may
// overlap it, which is exactly the 2-concurrent-request cap, never over.
//
// Transition logs are the E2E contract (scripts/e2e.ts):
//   poll-ok n=<pending>            every successful GET /pending
//   notify-shown id=<id>           alert phase entered
//   answered <id> <yes|no>         POST /answer returned 2xx
//
// Layout is absolute so click geometry is fixed: YES center (119,718),
// NO center (361,718) in the 480x800 logical viewport.
// Every class attribute is ONE full literal (the Tailwind subset bakes
// whole strings; concatenations would silently stay unbaked).

import { createSignal, Show } from "solid-js";
import { Screen, Text, View } from "@pocketjs/framework/components";
import { after } from "@pocketjs/framework/clock";
import { fetch } from "@pocketjs/framework/net";

const SERVER = "http://127.0.0.1:8899";
const POLL_SECONDS = 2.5;

const INK = "#e8f0f2";
const DIM = "#8fa3ad";
const GREEN = "#4ade80";
const RED = "#f87171";

interface PendingItem {
  id: number;
  text: string;
}

type Phase = "idle" | "alert" | "sending";

export default function NotifyApp() {
  const [phase, setPhase] = createSignal<Phase>("idle");
  const [item, setItem] = createSignal<PendingItem | null>(null);
  const [serverUp, setServerUp] = createSignal(false);
  const [lastAnswer, setLastAnswer] = createSignal<string | null>(null);
  const answeredIds = new Set<number>();

  const poll = async (): Promise<void> => {
    try {
      const res = await fetch(SERVER + "/pending", { method: "GET", timeoutMs: 5000, maxBytes: 64 * 1024 });
      setServerUp(res.ok);
      if (!res.ok) return;
      const data = await res.json() as { pending: PendingItem[] };
      console.log("poll-ok n=" + data.pending.length);
      const next = data.pending.find((p) => !answeredIds.has(p.id)) ?? null;
      if (next && phase() !== "sending" && phase() !== "alert") {
        setItem(next);
        setPhase("alert");
        console.log("notify-shown id=" + next.id);
      }
    } catch {
      setServerUp(false); // server down / net error — keep polling
    }
  };

  const tick = (): void => {
    void poll();
    after(POLL_SECONDS, tick);
  };

  const answer = (choice: "yes" | "no"): void => {
    const current = item();
    if (!current || phase() !== "alert") return;
    setPhase("sending");
    void (async () => {
      try {
        console.log("answer-send " + current.id + " " + choice);
        const res = await fetch(SERVER + "/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: current.id, answer: choice }),
          timeoutMs: 5000,
          maxBytes: 16 * 1024,
        });
        console.log("answer-resp " + res.status);
        if (res.ok) {
          answeredIds.add(current.id);
          setLastAnswer("#" + current.id + " " + (choice === "yes" ? "YES" : "NO"));
          setPhase("idle"); // unmount the card BEFORE clearing the data it reads
          setItem(null);
          console.log("answered " + current.id + " " + choice);
        } else {
          setPhase("alert"); // still pending server-side — user can retry
        }
      } catch (e) {
        console.log("answer-err " + String(e));
        setPhase("alert");
      }
    })();
  };

  void poll(); // first poll immediately on mount, then every POLL_SECONDS
  after(POLL_SECONDS, tick);

  return (
    <Screen class="relative flex-col w-full h-full bg-[#0b0e17] overflow-hidden">
      <View class="flex-row items-center justify-between px-4 h-12 bg-[#131a2a]">
        <Text class="text-base font-bold tracking-wide" style={{ textColor: INK }}>POCKET NOTIFY</Text>
        <View class="flex-row items-center gap-2">
          <Show when={serverUp()} fallback={<View class="w-2 h-2 rounded-full bg-[#f87171]" />}>
            <View class="w-2 h-2 rounded-full bg-emerald-500" />
          </Show>
          <Text class="text-xs" style={{ textColor: DIM }}>{serverUp() ? "LIVE" : "OFFLINE"}</Text>
        </View>
      </View>

      <View class="flex-1 items-center justify-center">
        <Text class="text-base" style={{ textColor: DIM }}>Waiting for notifications...</Text>
        <Show when={lastAnswer()}>
          <Text class="text-sm" style={{ textColor: INK }}>last answer: {lastAnswer()}</Text>
        </Show>
      </View>

      <Show when={phase() === "alert" || phase() === "sending"}>
        <View class="absolute top-20 left-6 right-6 p-4 rounded-xl border border-[#334155] bg-[#101828]">
          <Text class="text-xs tracking-wide" style={{ textColor: DIM }}>NOTIFICATION #{item()!.id}</Text>
          <Text class="text-base" style={{ textColor: INK }}>{item()!.text}</Text>
        </View>
      </Show>

      <Show when={phase() === "alert"}>
        <View
          focusable
          debugName="BtnYes"
          onPress={() => answer("yes")}
          class="absolute left-6 bottom-10 w-[190] h-[84] rounded-xl bg-[#14532d] border border-[#4ade80] items-center justify-center focus:bg-[#166534] focus:border-[#86efac]"
        >
          <Text class="text-2xl font-bold" style={{ textColor: GREEN }}>YES</Text>
        </View>
        <View
          focusable
          debugName="BtnNo"
          onPress={() => answer("no")}
          class="absolute right-6 bottom-10 w-[190] h-[84] rounded-xl bg-[#7f1d1d] border border-[#f87171] items-center justify-center focus:bg-[#991b1b] focus:border-[#fca5a5]"
        >
          <Text class="text-2xl font-bold" style={{ textColor: RED }}>NO</Text>
        </View>
      </Show>

      <Show when={phase() === "sending"}>
        <View class="absolute left-6 right-6 bottom-10 h-[84] rounded-xl bg-[#1e293b] border border-[#334155] items-center justify-center">
          <Text class="text-base" style={{ textColor: DIM }}>SENDING ANSWER...</Text>
        </View>
      </Show>
    </Screen>
  );
}
