"use client";

import { useState } from "react";
import { useWallet } from "../../lib/wallet";

function shortAddr(a) {
  if (!a || a.length < 10) return String(a);
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export default function ConnectWallet() {
  const { providers, address, providerName, status, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  async function pick(uuid) {
    const acc = await connect(uuid);
    if (acc) setOpen(false);
  }

  async function copyAddr() {
    try { await navigator.clipboard.writeText(address); } catch { /* ignore */ }
    setMenu(false);
  }

  if (address) {
    return (
      <div style={{ position: "relative" }}>
        <button type="button" className="contact-btn" onClick={() => setMenu(!menu)} title={address}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#7ef0d4", marginRight: 8 }}></span>
          {shortAddr(address)}
        </button>
        {menu && (
          <div style={{ position: "absolute", right: 0, top: "110%", background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 16, padding: "0.8rem", minWidth: 230, zIndex: 200, backdropFilter: "blur(12px)" }}>
            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{providerName || "Wallet"}</div>
            <div className="mono" style={{ marginBottom: 10 }}>{address}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn ghost" style={{ padding: "0.4rem 0.9rem", fontSize: "0.75rem" }} onClick={copyAddr}>Copy</button>
              <button type="button" className="btn ghost" style={{ padding: "0.4rem 0.9rem", fontSize: "0.75rem" }} onClick={() => { setMenu(false); setOpen(true); }}>Switch</button>
              <button type="button" className="btn ghost" style={{ padding: "0.4rem 0.9rem", fontSize: "0.75rem" }} onClick={() => { disconnect(); setMenu(false); }}>Disconnect</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button type="button" className="contact-btn" disabled={status === "connecting"} onClick={() => setOpen(true)}>
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#0b1512", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20, padding: "1.5rem", width: "100%", maxWidth: 380 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <b style={{ fontFamily: "Outfit, sans-serif" }}>Choose a wallet</b>
              <button type="button" className="nav-arrow" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>Pick manually — no auto-connect race.</div>
            {providers.length === 0 && (
              <div className="warn">No EVM wallet detected. Install <a href="https://metamask.io" target="_blank" rel="noreferrer" style={{ color: "#fde68a" }}>MetaMask</a> or <a href="https://rabby.io" target="_blank" rel="noreferrer" style={{ color: "#fde68a" }}>Rabby</a>, then refresh.</div>
            )}
            {providers.map((p) => (
              <button
                key={p.info.uuid}
                type="button"
                disabled={status === "connecting"}
                onClick={() => pick(p.info.uuid)}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", borderRadius: 14, padding: "0.7rem 1rem", marginTop: 8, cursor: status === "connecting" ? "wait" : "pointer" }}
              >
                {p.info.icon
                  ? <img src={p.info.icon} alt="" width="28" height="28" style={{ borderRadius: 8 }} />
                  : <span style={{ width: 28, height: 28, borderRadius: 8, background: "#7ef0d4", color: "#01241c", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{(p.info.name || "W").slice(0, 1)}</span>}
                <span>
                  <b>{p.info.name || "Browser Wallet"}</b>
                  {p.info.rdns ? <span style={{ display: "block", fontSize: "0.72rem", color: "rgba(255,255,255,0.55)" }}>{p.info.rdns}</span> : null}
                </span>
              </button>
            ))}
            {error && <div className="status err" style={{ marginTop: 10 }}>{error}</div>}
          </div>
        </div>
      )}
    </>
  );
}
