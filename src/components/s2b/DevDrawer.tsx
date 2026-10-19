import { useEffect, useState } from "react";
import { getApiKeys, setApiKeys, type ApiKeys } from "@/services/aggregatorService";

export function DevDrawer({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKeys>({});
  useEffect(() => setKeys(getApiKeys()), [open]);
  const live = !!(keys.sideshift || keys.changenow || keys.fixedfloat);

  return (
    <footer className="relative z-10 mt-10 border-t border-border bg-void/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 font-mono text-xs text-muted-foreground">
        <span>S2B_PROTOCOL © 2026 · Non-custodial routing · Quotes are estimates</span>
        <button onClick={() => setOpen(!open)} className="chamfer-sm bg-muted px-3 py-1.5 text-xlm hover:glow-xlm">[DEV_API_CONFIG] {live ? "· LIVE" : "· SIMULATION"}</button>
      </div>
      {open && (
        <div className="mx-auto max-w-7xl px-4 pb-6">
          <div className="panel glow-xlm grid gap-3 p-5 font-mono text-xs sm:grid-cols-3">
            {(["sideshift", "changenow", "fixedfloat"] as const).map((k) => (
              <label key={k} className="block">
                <span className="text-muted-foreground">{k.toUpperCase()}_API_KEY</span>
                <input type="password" value={keys[k] || ""} onChange={(e) => setKeys({ ...keys, [k]: e.target.value })}
                  className="mt-1 w-full bg-background px-3 py-2 text-foreground outline-none focus:glow-xlm chamfer-sm" placeholder="paste key…" />
              </label>
            ))}
            <div className="flex gap-2 sm:col-span-3">
              <button onClick={() => { setApiKeys(keys); onChange(); setOpen(false); }} className="btn-cta px-4 py-2 font-bold">SAVE & SWITCH MODE</button>
              <button onClick={() => { setApiKeys({}); setKeys({}); onChange(); }} className="chamfer-sm bg-muted px-4 py-2">CLEAR</button>
              <span className="self-center text-muted-foreground">Keys are stored only in this browser.</span>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
