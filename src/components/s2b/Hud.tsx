import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { connectWallet, WALLET_NAMES, type Wallet, type WalletName } from "@/services/walletService";
import freighterLogo from "@/assets/wallet-freighter.svg.asset.json";
import lobstrLogo from "@/assets/wallet-lobstr.png.asset.json";
import xbullLogo from "@/assets/wallet-xbull.png.asset.json";
import albedoLogo from "@/assets/wallet-albedo.svg.asset.json";
export type { Wallet } from "@/services/walletService";

const walletLogos: Record<WalletName, string> = {
  Freighter: freighterLogo.url,
  Lobstr: lobstrLogo.url,
  xBull: xbullLogo.url,
  Albedo: albedoLogo.url,
};

export function Hud({ wallet, onConnect }: { wallet: Wallet | null; onConnect: (w: Wallet | null) => void }) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(localStorage.getItem("s2b_theme") === "light"); }, []);
  useEffect(() => { document.documentElement.classList.toggle("light", light); localStorage.setItem("s2b_theme", light ? "light" : "dark"); }, [light]);

  const connect = async (name: WalletName) => {
    setConnecting(name);
    setError("");
    try {
      onConnect(await connectWallet(name));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection cancelled or unavailable. Please try again.");
    } finally { setConnecting(null); }
  };

  return (
    <header className="relative z-10 border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
        <div className="shrink-0">
          <div className="s2b-wordmark text-foreground" aria-label="STELLAR2BITCOIN">
            <span>STELLAR</span><span className="s2b-wordmark-two text-brand-btc">2</span><span>BITCOIN</span>
          </div>
        </div>
        
        <Button variant="ghost" size="icon" onClick={() => setLight(!light)} aria-label={light ? "Switch to dark mode" : "Switch to light mode"} title={light ? "Switch to dark mode" : "Switch to light mode"} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
          {light ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
        </Button>
        {wallet ? (
          <Button variant="secondary" onClick={() => onConnect(null)} title="Disconnect wallet" aria-label="Disconnect wallet" className="chamfer-sm glow-xlm bg-panel px-4 py-2 font-mono text-xs text-xlm">
            {wallet.name.toUpperCase()} · {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
          </Button>
        ) : (
          <Button id="connect-wallet" onClick={() => { setError(""); setOpen(true); }} className="btn-cta px-4 py-2 font-sans text-sm font-semibold">
            Connect wallet
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(value) => { if (!connecting) setOpen(value); }}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-md bg-panel" onEscapeKeyDown={(e) => { if (connecting) e.preventDefault(); }} onPointerDownOutside={(e) => { if (connecting) e.preventDefault(); }}>
            <DialogTitle className="text-sm text-foreground">Connect a Stellar wallet</DialogTitle>
            <DialogDescription className="text-xs">Stellar Mainnet</DialogDescription>
            <div className="grid gap-2">
              {WALLET_NAMES.map((w) => (
                <Button variant="secondary" key={w} disabled={!!connecting} onClick={() => connect(w)}
                  className="h-12 justify-between bg-muted px-4 font-mono text-sm">
                  <span className="flex items-center gap-3">
                    <img src={walletLogos[w]} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
                    {w}
                  </span>
                  <span className="text-xs text-muted-foreground">{connecting === w ? "Awaiting approval…" : "→"}</span>
                </Button>
              ))}
            </div>
            {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
          </DialogContent>
      </Dialog>
    </header>
  );
}
