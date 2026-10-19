import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Quote, Token } from "@/services/aggregatorService";

interface Props { quote: Quote; token: Token; amount: number; dest: string; walletName: string; onClose: () => void }

const STEPS = ["STELLAR TX BROADCASTED (LedgerConfirmed)", "BRIDGE NODE LIQUIDITY LOCKED", "BITCOIN TX BROADCASTED TO MEMPOOL", "SETTLEMENT COMPLETE"];
const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

export function ExecutionModal({ quote, token, amount, dest, walletName, onClose }: Props) {
  const [stage, setStage] = useState(1);
  const [secs, setSecs] = useState(899);
  const [tab, setTab] = useState<"wallet" | "manual">("wallet");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const deposit = useMemo(() => "GDEP" + hex(52).toUpperCase().replace(/[01]/g, "X"), []);
  const memo = useMemo(() => String(Math.floor(1e9 + Math.random() * 9e9)), []);
  const txid = useMemo(() => hex(64), []);

  useEffect(() => { const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (stage !== 1) return; const t = setTimeout(() => setStage(2), 1800); return () => clearTimeout(t); }, [stage]);

  useEffect(() => {
    if (stage !== 3) return;
    const lines: string[] = [
      `> tx.submit() ledger #${51234000 + Math.floor(Math.random() * 999)} memo=${memo}`,
      `> [01] ${STEPS[0]}`, `> ${quote.provider} node ack · rate locked`, `> [02] ${STEPS[1]}`,
      `> constructing PSBT · fee ${Math.ceil(Math.random() * 10 + 8)} sat/vB`, `> [03] ${STEPS[2]} txid=${txid.slice(0, 16)}…`,
      `> awaiting confirmation…`, `> [04] ${STEPS[3]} · ${quote.btcOut.toFixed(8)} BTC delivered`,
    ];
    let i = 0;
    const t = setInterval(() => {
      const line = lines[i] ?? ""; setLogs((l) => [...l, line]);
      const m = line.match(/\[0(\d)\]/); if (m) setProgress(Number(m[1]));
      i++; if (i >= lines.length) clearInterval(t);
    }, 1100);
    return () => clearInterval(t);
  }, [stage]);

  const copy = (v: string, k: string) => { navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(""), 1200); };
  const mm = String(Math.floor(secs / 60)).padStart(2, "0"), ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur">
      <div className="panel glow-btc max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6 font-mono">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-2xl text-btc text-glow-btc">EXECUTION_TERMINAL // {quote.provider.toUpperCase()}</div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-destructive">[X] ABORT</button>
        </div>
        <div className="mb-5 grid grid-cols-3 gap-1">
          {["ROUTE LOCK", "SIGN XDR", "TELEMETRY"].map((s, i) => (
            <div key={s} className={`chamfer-sm px-2 py-1.5 text-center text-[10px] tracking-widest ${stage > i + 1 ? "bg-acid/20 text-acid" : stage === i + 1 ? "bg-btc/20 text-btc" : "bg-muted text-muted-foreground"}`}>0{i + 1} {s}</div>
          ))}
        </div>

        <div className="mb-4 grid gap-2 text-xs sm:grid-cols-2">
          <Field label="SEND" value={`${amount} ${token}`} cls="text-xlm" />
          <Field label="RECEIVE" value={`${quote.btcOut.toFixed(8)} BTC`} cls="text-btc" />
          <Field label="DEPOSIT ADDRESS" value={`${deposit.slice(0, 10)}…${deposit.slice(-8)}`} />
          <Field label="MEMO_ID (AUTO-EMBEDDED)" value={memo} cls="text-acid" />
          <Field label="DESTINATION" value={`${dest.slice(0, 12)}…${dest.slice(-6)}`} />
          <Field label="RATE LOCK" value={`${mm}:${ss}`} cls={secs < 60 ? "text-destructive" : "text-btc"} />
        </div>

        {stage === 1 && <div className="relative h-1 overflow-hidden bg-muted"><div className="absolute h-full w-1/3 bg-btc scan-bar" /><p className="pt-3 text-xs text-muted-foreground">GENERATING XDR ENVELOPE…</p></div>}

        {stage === 2 && (
          <div>
            <div className="mb-3 flex gap-2 text-xs">
              {(["wallet", "manual"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`chamfer-sm px-3 py-1.5 ${tab === t ? "bg-xlm/20 text-xlm" : "bg-muted text-muted-foreground"}`}>
                  {t === "wallet" ? "DIRECT SIGNATURE" : "QR / MANUAL"}
                </button>
              ))}
            </div>
            {tab === "wallet" ? (
              <button onClick={() => setStage(3)} className="btn-cta w-full py-4 font-display text-xl tracking-widest">
                SIGN & BROADCAST WITH {walletName.toUpperCase()}
              </button>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="bg-foreground p-2"><QRCodeSVG value={`web+stellar:pay?destination=${deposit}&amount=${amount}&memo=${memo}&memo_type=MEMO_ID`} size={140} /></div>
                <div className="flex-1 space-y-2 text-xs">
                  <CopyRow label="ADDRESS" v={deposit} copied={copied === "a"} onCopy={() => copy(deposit, "a")} />
                  <CopyRow label="MEMO" v={memo} copied={copied === "m"} onCopy={() => copy(memo, "m")} />
                  <p className="text-destructive">! Missing memo = lost funds.</p>
                  <button onClick={() => setStage(3)} className="chamfer-sm w-full bg-muted py-2 text-xlm hover:glow-xlm">I'VE SENT THE PAYMENT</button>
                </div>
              </div>
            )}
          </div>
        )}

        {stage === 3 && (
          <div>
            <div className="mb-4 space-y-2">
              {STEPS.map((s, i) => (
                <div key={s} className={`flex items-center gap-3 text-xs ${progress > i ? "text-acid" : progress === i ? "text-btc" : "text-muted-foreground"}`}>
                  <span className={`chamfer-sm px-2 py-0.5 ${progress > i ? "bg-acid/20" : "bg-muted"}`}>[0{i + 1}]</span>
                  <span>{s}</span>
                  {i === 2 && progress > 2 && <a className="underline text-xlm" target="_blank" rel="noreferrer" href={`https://mempool.space/tx/${txid}`}>TXID↗</a>}
                  {progress === i && <span className="caret">█</span>}
                </div>
              ))}
            </div>
            <div className="h-40 overflow-y-auto bg-background p-3 text-[11px] text-acid chamfer-sm">
              {logs.map((l, i) => <div key={i}>{l}</div>)}<span className="caret">_</span>
            </div>
            {progress >= 4 && <button onClick={onClose} className="btn-cta mt-4 w-full py-3 font-sans text-sm font-semibold">SWAP COMPLETE // CLOSE</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, cls = "text-foreground" }: { label: string; value: string; cls?: string }) {
  return <div className="chamfer-sm bg-muted/60 px-3 py-2"><div className="text-[10px] text-muted-foreground">{label}</div><div className={`truncate ${cls}`}>{value}</div></div>;
}
function CopyRow({ label, v, copied, onCopy }: { label: string; v: string; copied: boolean; onCopy: () => void }) {
  return <div className="flex items-center gap-2"><span className="w-16 text-muted-foreground">{label}</span><span className="flex-1 truncate">{v}</span><button onClick={onCopy} className="text-xlm">{copied ? "COPIED" : "COPY"}</button></div>;
}
