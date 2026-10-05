"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import { CONTRACT_ADDR, explorerAddressUrl, fetchConfig, fetchCount, fetchProject } from "../../lib/genlayer";

export default function ContractPage() {
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState("Loading…");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [proj, count, cfg] = await Promise.all([fetchProject(), fetchCount(), fetchConfig()]);
        setInfo({
          name: proj.name, version: proj.version, count: count.toString(),
          pool: cfg.pool.toString(), balance: cfg.balance.toString(),
          stake: cfg.min_stake.toString(), rate: cfg.reward_per_point.toString(),
          fee: cfg.appeal_fee.toString(), cap: cfg.max_pending.toString(),
        });
        setMsg("Connected to studionet.");
      } catch (e) {
        setMsg("Chain read failed: " + String(e.message || e).split("\n")[0]);
      }
    })();
  }, []);

  async function copyAddr() {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDR);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Header />
      <section className="section" style={{ paddingTop: "7rem" }}>
        <div className="panel">
          <h2>Contract</h2>
          <p className="sub">GenPustaka intelligent contract (GenLayer studionet).</p>
          <div className="stat-grid">
            <div className="stat"><div className="k">PROJECT</div><div className="v">{info ? `${info.name} v${info.version}` : "…"}</div></div>
            <div className="stat"><div className="k">ENTRIES</div><div className="v">{info?.count || "…"}</div></div>
            <div className="stat"><div className="k">REWARD POOL</div><div className="v">{info ? `${info.pool} wei` : "…"}</div></div>
            <div className="stat"><div className="k">CONTRACT BALANCE</div><div className="v">{info ? `${info.balance} wei` : "…"}</div></div>
            <div className="stat"><div className="k">MIN STAKE</div><div className="v">{info ? `${info.stake} wei` : "…"}</div></div>
            <div className="stat"><div className="k">GEN / POINT</div><div className="v">{info ? `${info.rate} wei` : "…"}</div></div>
            <div className="stat"><div className="k">APPEAL FEE</div><div className="v">{info ? `${info.fee} pts` : "…"}</div></div>
            <div className="stat"><div className="k">MAX PENDING</div><div className="v">{info?.cap || "…"}</div></div>
          </div>
          <label className="lbl">Contract address</label>
          <div className="mono">{CONTRACT_ADDR}</div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={copyAddr}>{copied ? "Copied!" : "Copy address"}</button>
            <button type="button" className="btn ghost" onClick={() => window.open(explorerAddressUrl(CONTRACT_ADDR), "_blank")}>View in Explorer</button>
          </div>
          <div className="status">{msg}</div>
        </div>
      </section>
      <footer>GenPustaka — crowd-sourced knowledge, verified by AI consensus on GenLayer.</footer>
    </>
  );
}
