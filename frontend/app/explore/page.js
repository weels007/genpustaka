"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import { useWallet } from "../../lib/wallet";
import {
  ABIS,
  CONTRACT_ADDR,
  MIN_STAKE,
  fetchByAuthor,
  fetchByTopic,
  fetchEntry,
  fetchTopics,
  waitFinalizedChecked,
} from "../../lib/genlayer";

export default function ExplorePage() {
  const { address, getWriteClient } = useWallet();
  const [topics, setTopics] = useState([]);
  const [tab, setTab] = useState("All");
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null); // entry id currently transacting
  const [stakeAmts, setStakeAmts] = useState({}); // entry id -> BigInt wei

  async function load(activeTab, topicList) {
    if (loading) return;
    if (activeTab === "My Entries" && !address) {
      setList([]);
      setMsg("Connect a wallet from the header to see your own entries.");
      return;
    }
    setLoading(true);
    setMsg("Loading…");
    setList([]);
    try {
      let entries = [];
      if (activeTab === "My Entries") {
        const r = await fetchByAuthor(address);
        entries = await Promise.all(r.ids.map((id) => fetchEntry(String(id))));
      } else {
        const names = activeTab === "All" ? topicList : [activeTab];
        const byTopic = await Promise.all(names.map((t) => fetchByTopic(t)));
        const ids = [...new Set(byTopic.flatMap((r) => r.ids.map(String)))];
        entries = await Promise.all(ids.map((id) => fetchEntry(id)));
      }
      // newest first (higher id = newer)
      entries.sort((a, b) => Number(b.id) - Number(a.id));
      setList(entries);
      setMsg(
        entries.length
          ? `Showing ${entries.length} entr${entries.length > 1 ? "ies" : "y"}.`
          : activeTab === "My Entries"
            ? "You have no entries yet."
            : "No entries for this topic yet."
      );
    } catch (e) {
      setMsg("Explore failed: " + String(e.message || e).split("\n")[0]);
    }
    setLoading(false);
  }

  async function init() {
    try {
      const t = await fetchTopics();
      const names = (t.topics || []).map(String);
      setTopics(names);
      await load("All", names);
    } catch (e) {
      setMsg("Explore failed: " + String(e.message || e).split("\n")[0]);
    }
  }

  function pick(t) {
    setTab(t);
    load(t, topics);
  }

  async function act(id, kind, label, value) {
    if (acting !== null || !address) return;
    setActing(id);
    try {
      const client = await getWriteClient();
      const fn = kind === "cancel" ? "cancel_entry" : kind === "appeal" ? "appeal_entry" : kind === "stake" ? "stake_for" : "verify_entry";
      const abi = kind === "cancel" ? ABIS.cancel : kind === "appeal" ? ABIS.appeal : kind === "stake" ? ABIS.stake : ABIS.verify;
      const tx = await client.writeContract({
        address: CONTRACT_ADDR, abi, functionName: fn, args: [String(id)],
        ...(kind === "stake" ? { value } : {}),
      });
      setMsg(`${label} #${id} (${tx}) — waiting for FINALIZED…`);
      await waitFinalizedChecked(tx, kind === "verify" ? 600000 : 180000);
      const e = await fetchEntry(String(id));
      setMsg(`#${id}: ${e.status} (score ${e.score}). ${e.analysis || ""}`);
      await load(tab, topics);
    } catch (e) {
      setMsg(`${label} failed: ` + String(e.message || e).split("\n")[0]);
    }
    setActing(null);
  }

  async function onCancel(id) { await act(id, "cancel", "Cancelling"); }
  async function onAppeal(id) { await act(id, "appeal", "Appealing (fee 2 pts)"); }
  async function onVerify(id) { await act(id, "verify", "Verifying"); }
  async function onStake(id) {
    const raw = (stakeAmts[id] ?? MIN_STAKE).toString();
    let amt;
    try { amt = BigInt(raw); } catch { setMsg("Stake amount must be a whole wei number."); return; }
    if (amt < MIN_STAKE) { setMsg(`Minimum stake is ${MIN_STAKE.toString()} wei.`); return; }
    setStakeAmts((m) => ({ ...m, [id]: amt }));
    await act(id, "stake", `Staking ${amt.toString()} wei`, amt);
  }

  useEffect(() => { init(); }, []);

  const tabs = ["All", ...topics, "My Entries"];
  const mine = (e) => !!address && String(e.author).toLowerCase() === address.toLowerCase();

  return (
    <>
      <Header />
      <section className="section" style={{ paddingTop: "7rem" }}>
        <div className="panel">
          <h2>Explore knowledge</h2>
          <p className="sub">All entries stored on-chain, newest first. Connect a wallet to manage your own: verify or cancel pending entries, stake GEN for extra weight, appeal rejected ones (fee 2 pts).</p>
          <div className="row" role="tablist" aria-label="Topic filter">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                disabled={loading}
                onClick={() => pick(t)}
                className={`btn ${tab === t ? "" : "ghost"}`}
              >
                {loading && tab === t ? "Loading…" : t}
              </button>
            ))}
            <span className="status">{msg}</span>
          </div>
          {list.map((e) => (
            <div key={e.id} className="entry-card">
              <span className={`tag ${e.status === "verified" ? "" : e.status === "pending" ? "pending" : "rejected"}`}>{e.status}</span>
              <span className="tag pending" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>{e.topic}</span>
              {Number(e.appeals) > 0 && (
                <span className="tag pending" style={{ background: "rgba(252,211,77,0.2)", color: "#fde68a" }}>appealed ×{e.appeals.toString()}</span>
              )}
              {Number(e.stake) > 0 && (
                <span className="tag pending" style={{ background: "rgba(126,240,212,0.2)", color: "#7ef0d4" }}>staked {e.stake.toString()} wei</span>
              )}
              <b>#{e.id} · score {e.score.toString()}</b><br />{e.summary}<br />
              <span className="mono">{e.url}</span><br /><i>{e.analysis || "awaiting verification"}</i>
              {mine(e) && (e.status === "pending" || e.status === "rejected") && (
                <div className="row">
                  {e.status === "pending" && (
                    <>
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }}
                        disabled={acting !== null}
                        onClick={() => onVerify(e.id)}
                      >
                        {acting === String(e.id) ? "Verifying…" : "Verify"}
                      </button>
                      {Number(e.stake) === 0 && (
                        <>
                          <input
                            value={(stakeAmts[String(e.id)] ?? MIN_STAKE).toString()}
                            onChange={(ev) => setStakeAmts((m) => ({ ...m, [String(e.id)]: ev.target.value }))}
                            placeholder="wei"
                            inputMode="numeric"
                            style={{ maxWidth: 110 }}
                            aria-label="Stake amount in wei"
                          />
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }}
                            disabled={acting !== null}
                            onClick={() => onStake(e.id)}
                            title={`Locks any amount ≥ ${MIN_STAKE.toString()} wei until verified`}
                          >
                            {acting === String(e.id) ? "Staking…" : "Stake"}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }}
                        disabled={acting !== null}
                        onClick={() => onCancel(e.id)}
                      >
                        {acting === String(e.id) ? "Cancelling…" : "Cancel entry"}
                      </button>
                    </>
                  )}
                  {e.status === "rejected" && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }}
                      disabled={acting !== null}
                      onClick={() => onAppeal(e.id)}
                      title="Costs 2 reward points"
                    >
                      {acting === String(e.id) ? "Appealing…" : "Appeal (fee 2)"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <footer>GenPustaka — crowd-sourced knowledge, verified by AI consensus on GenLayer.</footer>
    </>
  );
}
