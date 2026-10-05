"use client";

import Link from "next/link";
import { useState } from "react";
import Header from "../components/Header";
import { useWallet } from "../../lib/wallet";
import {
  ABIS,
  CONTRACT_ADDR,
  fetchCount,
  fetchEntry,
  findMyEntry,
  waitFinalizedChecked,
} from "../../lib/genlayer";

export default function SubmitPage() {
  const { address: walletAddr, providerName, getWriteClient } = useWallet();
  const [form, setForm] = useState({ topic: "Web", url: "", summary: "" });
  const [txMsg, setTxMsg] = useState("");
  const [txOk, setTxOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | submitting | submitted | verifying
  const [lastId, setLastId] = useState(null);

  // Wallet-only signing: no connected wallet = no writes. No key pasting, ever.
  async function signer() {
    if (!walletAddr) throw new Error("Connect a wallet from the header first.");
    const client = await getWriteClient();
    return {
      send: (functionName, abi, args) =>
        client.writeContract({ address: CONTRACT_ADDR, abi, functionName, args }),
      label: `${providerName || "wallet"} (${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)})`,
      address: walletAddr,
    };
  }

  function validInput() {
    if (!form.topic.trim() || !form.url.trim() || form.summary.trim().length < 20)
      throw new Error("Fill topic, URL, and a summary of min 20 chars.");
  }

  async function onSubmit() {
    if (busy) return;
    setBusy(true); setPhase("submitting"); setTxOk(false);
    setTxMsg("Submitting entry to studionet…");
    try {
      validInput();
      const s = await signer();
      const tx = await s.send("submit_entry", ABIS.submit, [form.topic.trim(), form.url.trim(), form.summary.trim()]);
      setTxMsg(`Submitted via ${s.label}: ${tx} — waiting for finalization…`);
      await waitFinalizedChecked(tx, 180000);
      const count = await fetchCount();
      const id = await findMyEntry(s.address.toLowerCase(), form.url.trim(), count);
      if (!id) throw new Error("Finalized, but your entry was not found (execution may have rolled back — e.g. duplicate URL).");
      setLastId(id);
      setPhase("submitted");
      setTxMsg(`Entry #${id} stored on-chain. You can now trigger AI verification.`);
      setTxOk(true);
    } catch (e) {
      setPhase("idle");
      setTxMsg("Submit failed: " + String(e.message || e).split("\n")[0]);
    }
    setBusy(false);
  }

  async function onVerify() {
    if (busy || lastId === null) return;
    setBusy(true); setPhase("verifying"); setTxOk(false);
    setTxMsg(`Verifying entry #${lastId} — AI consensus takes minutes, do not close this page…`);
    try {
      const s = await signer();
      const tx = await s.send("verify_entry", ABIS.verify, [lastId]);
      setTxMsg(`Verify tx via ${s.label}: ${tx} — waiting for FINALIZED…`);
      await waitFinalizedChecked(tx);
      const e = await fetchEntry(lastId);
      setTxMsg(`Entry #${lastId}: ${e.status} (score ${e.score}). ${e.analysis || ""}`);
      setTxOk(e.status === "verified");
      setPhase("idle");
      setLastId(null); // no longer pending — prevents double-verify reverts
    } catch (e) {
      setPhase("submitted"); // still pending, keep verify available
      setTxMsg("Verify failed: " + String(e.message || e).split("\n")[0]);
    }
    setBusy(false);
  }

  return (
    <>
      <Header />
      <section className="section" style={{ paddingTop: "7rem" }}>
        <div className="panel">
          <h2>Submit knowledge</h2>
          <p className="sub">Submit a new finding, then trigger AI verification. Duplicates are rejected on-chain. Max 3 pending entries per author.</p>
          <div className="status ok" style={{ marginTop: 0 }}>
            {walletAddr
              ? `Signing with connected wallet (${providerName}). Approve each transaction in the wallet popup.`
              : "Connect a wallet from the header to submit — writes are disabled until then."}
          </div>
          <label className="lbl">Topic (fixed list — free topics are a spam vector)</label>
          <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
            <option value="Web">Web</option>
            <option value="AI">AI</option>
            <option value="Crypto">Crypto</option>
          </select>
          <label className="lbl">Source URL</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
          <label className="lbl">Summary (min 20 chars, faithful to the source)</label>
          <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Summarize what is new in the source…" />
          <div className="row">
            <button type="button" className="btn" disabled={busy || !walletAddr} onClick={onSubmit}>
              {phase === "submitting" ? "Submitting…" : "Submit entry"}
            </button>
            <button type="button" className="btn ghost" disabled={busy || lastId === null || !walletAddr} onClick={onVerify}>
              {phase === "verifying" ? "Verifying…" : "Verify last entry"}
            </button>
            <Link href="/" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>← Back home</Link>
          </div>
          <div className={`status${txOk ? " ok" : txMsg.startsWith("Submit failed") || txMsg.startsWith("Verify failed") ? " err" : ""}`}>{txMsg}</div>
        </div>
      </section>

      <footer>GenPustaka — crowd-sourced knowledge, verified by AI consensus on GenLayer.</footer>
    </>
  );
}
