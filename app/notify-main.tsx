// pocketjs-notify/app/notify-main.tsx — JG-122 mounting entry.
//
// Installs the browser-only pointer shim, then mounts the Solid app. On a
// device host there is no `document` and the shim is a no-op — the app is
// fully operable with d-pad + CIRCLE there (the buttons are focusable).

import { mount } from "@pocketjs/framework";
import { focusNode, hitFocusable, pressNode, setActiveNode } from "@pocketjs/framework/input";
import NotifyApp from "./app.tsx";

// The browser playground (hosts/web/index.html + engine.js) drives the guest
// with frame(buttons, analog) only — pointer taps on the canvas never reach
// the guest through the input contract. But the bundle evals in the page
// realm, so DOM pointer events can feed the framework's own focus/press
// authority directly (same edge semantics as framework/src/desktop-pointer.ts:
// down focuses+activates the hit focusable; up over the same node presses).
function installBrowserPointer(): void {
  if (typeof document === "undefined") return;
  const canvas = document.getElementById("screen");
  if (!canvas) return;
  const W = 480; // logical viewport — matches the dev URL ?width=480&height=800
  const H = 800;
  let owner: unknown = null;

  const logical = (ev: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
  };

  canvas.addEventListener("pointerdown", (raw) => {
    const p = logical(raw as { clientX: number; clientY: number });
    if (!p) return;
    const hit = hitFocusable(p.x, p.y);
    if (hit) {
      focusNode(hit);
      setActiveNode(hit);
      owner = hit;
      raw.preventDefault();
    }
  });

  window.addEventListener("pointerup", (raw) => {
    const current = owner;
    owner = null;
    setActiveNode(null);
    if (!current) return;
    const p = logical(raw as { clientX: number; clientY: number });
    if (!p) return;
    const hit = hitFocusable(p.x, p.y);
    if (hit === current) pressNode(hit);
  });
}

installBrowserPointer();

mount(() => <NotifyApp />);
