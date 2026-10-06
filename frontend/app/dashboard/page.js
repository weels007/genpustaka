"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useWallet } from "../../lib/wallet";
import {
  ABIS,
  CONTRACT_ADDR,
  REWARD_PER_POINT_WEI,
  fetchBalance,
  fetchByAuthor,
  fetchEntry,
  fetchPool,
  formatWeiToGen,
  shortAddr,
  waitFinalizedChecked,
} from "../../lib/genlayer";

export default function DashboardPage() {
  const { address, getWriteClient } = useWallet();
  const [list, setList] = useState([]);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null);
  const [claimAmt, setClaimAmt] = useState("");
  const [claimMsg, setClaimMsg] = useState("");
  const [claiming, setClaiming] = useState(false);

  async function load() {
    if (loading || !address) return;
    setLoading(true);
    setMsg("Loading your data…");
    try {
      const [r, bal, pool] = await Promise.all([
        fetchByAuthor(address),
        fetchBalance(address),
        fetchPool(),
      ]);
      const entries = await Promise.all(r.ids.map((id) => fetchEntry(String(id))));
      entries.sort((a, b) => Number(b.id) - Number(a.id));
      setList(entries);
      const is = (s) => entries.filter((e) => e.status === s).length;
      const earned = entries
        .filter((e) => e.status === "verified")
        .reduce((sum, e) => sum + Number(e.score), 0);
      const staked = entries
        .filter((e) => e.status === "pending")
        .reduce((sum, e) => sum + Number(e.stake), 0);
      setStats({
        total: entries.length,
        verified: is("verified"),
        rejected: is("rejected"),
        pending: is("pending"),
        cancelled: is("cancelled"),
        earned,
        points: bal.toString(),
        pool: pool.toString(),
        staked,
      });
      setMsg(entries.length ? "" : "You have no entries yet — submit your first finding.");
    } catch (e) {
      setMsg("Load failed: " + String(e.message || e).split("\n")[0]);
    }
    setLoading(false);
  }

  useEffect(() => {
    setList([]); setStats(null);
    if (address) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function act(id, kind, label) {
    if (acting !== null || !address) return;
    setActing(id);
    try {
      const client = await getWriteClient();
      const fn = kind === "cancel" ? "cancel_entry" : kind === "appeal" ? "appeal_entry" : "verify_entry";
      const abi = kind === "cancel" ? ABIS.cancel : kind === "appeal" ? ABIS.appeal : ABIS.verify;
      const tx = await client.writeContract({ address: CONTRACT_ADDR, abi, functionName: fn, args: [String(id)] });
      setMsg(`${label} #${id} (${tx}) — waiting for FINALIZED…`);
      await waitFinalizedChecked(tx, kind === "verify" ? 600000 : 180000);
      const e = await fetchEntry(String(id));
      setMsg(`#${id}: ${e.status} (score ${e.score}). ${e.analysis || ""}`);
      await load();
    } catch (e) {
      try {
        const cur = await fetchEntry(String(id));
        if (kind === "verify" && cur.status === "pending") {
          setMsg(`No consensus reached (undetermined) — #${id} unchanged and still pending.`);
        } else {
          setMsg(`#${id}: ${cur.status} (score ${cur.score}). ${cur.analysis || ""}`);
        }
        await load();
      } catch {
        setMsg(`${label} failed: ` + String(e.message || e).split("\n")[0]);
      }
    }
    setActing(null);
  }

  async function onClaim() {
    if (claiming || !address) return;
    const pts = parseInt(claimAmt, 10);
    if (!pts || pts <= 0) { setClaimMsg("Enter a positive point amount."); return; }
    setClaiming(true);
    const preview = formatWeiToGen(BigInt(pts) * REWARD_PER_POINT_WEI);
    setClaimMsg(`Claiming ${pts} pts → ${preview} GEN…`);
    try {
      const client = await getWriteClient();
      const tx = await client.writeContract({ address: CONTRACT_ADDR, abi: ABIS.claim, functionName: "claim_gen", args: [BigInt(pts)] });
      await waitFinalizedChecked(tx, 180000);
      setClaimMsg(`Claimed ${pts} pts for ${preview} GEN.`);
      setClaimAmt("");
      await load();
    } catch (e) {
      setClaimMsg("Claim failed: " + String(e.message || e).split("\n")[0]);
    }
    setClaiming(false);
  }

  const mine = (e) => !!address && String(e.author).toLowerCase() === address.toLowerCase();

  return (
    <>
      <Header />
      <section className="section" style={{ paddingTop: "7rem" }}>
        <div className="panel">
          <h2>My dashboard</h2>
          {!address ? (
            <p className="sub">Connect a wallet from the header to see your profile, history, and rewards.</p>
          ) : (
            <>
              <p className="sub">Profile: <span className="mono">{shortAddr(address)}</span> <span className="mono" style={{ opacity: 0.6 }}>{address}</span></p>
              <div className="stat-grid">
                <div className="stat"><div className="k">SUBMITTED</div><div className="v">{stats?.total ?? "…"}</div></div>
                <div className="stat"><div className="k">VERIFIED</div><div className="v">{stats?.verified ?? "…"}</div></div>
                <div className="stat"><div className="k">REJECTED</div><div className="v">{stats?.rejected ?? "…"}</div></div>
                <div className="stat"><div className="k">PENDING</div><div className="v">{stats?.pending ?? "…"}</div></div>
                <div className="stat"><div className="k">POINTS EARNED</div><div className="v">{stats?.earned ?? "…"}</div></div>
                <div className="stat"><div className="k">POINTS NOW</div><div className="v">{stats?.points ?? "…"}</div></div>
                <div className="stat"><div className="k">STAKED (PENDING)</div><div className="v">{stats ? `${formatWeiToGen(stats.staked)} GEN` : "…"}</div></div>
                <div className="stat"><div className="k">REWARD POOL</div><div className="v">{stats ? `${formatWeiToGen(stats.pool)} GEN` : "…"}</div></div>
              </div>
              <div className="row">
                <button type="button" className="btn ghost" disabled={loading} onClick={load}>
                  {loading ? "Loading…" : "Refresh"}
                </button>
                <span className="status">{msg}</span>
              </div>
            </>
          )}
        </div>

        {address && (
          <div className="panel">
            <h2>Claim GEN rewards</h2>
            <p className="sub">Burn points for GEN from the reward pool. Rate: {formatWeiToGen(REWARD_PER_POINT_WEI)} GEN per point.</p>
            <div className="stat" style={{ marginBottom: "1rem" }}>
              <div className="k">YOUR POINTS (CONVERTIBLE)</div>
              <div className="v">{stats?.points == null ? "…" : `${stats.points} pts ≈ ${formatWeiToGen(BigInt(stats.points) * REWARD_PER_POINT_WEI)} GEN`}</div>
            </div>
            <div className="row">
              <input value={claimAmt} onChange={(e) => setClaimAmt(e.target.value)} placeholder="Points" inputMode="numeric" style={{ maxWidth: 160 }} />
              <button
                type="button"
                className="btn ghost"
                disabled={claiming || stats?.points == null || stats.points === "0"}
                onClick={() => setClaimAmt(stats?.points ?? "")}
              >
                Max
              </button>
              <button type="button" className="btn" disabled={claiming} onClick={onClaim}>
                {claiming ? "Claiming…" : "Claim GEN"}
              </button>
              <span className="status">{claimMsg}</span>
            </div>
          </div>
        )}

        {address && (
          <div className="panel">
            <h2>My history</h2>
            <p className="sub">Every entry you ever submitted, newest first.</p>
          {list.map((e) => (
            <div key={e.id} className="entry-card">
              <div className="entry-head">
                <span className={`tag ${e.status === "verified" ? "" : e.status === "pending" ? "pending" : "rejected"}`}>{e.status}</span>
                <span className="tag pending" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>{e.topic}</span>
                {Number(e.appeals) > 0 && (
                  <span className="tag pending" style={{ background: "rgba(252,211,77,0.2)", color: "#fde68a" }}>appealed ×{e.appeals.toString()}</span>
                )}
                {Number(e.stake) > 0 && (
                  <span className="tag pending" style={{ background: "rgba(126,240,212,0.2)", color: "#7ef0d4" }}>staked {formatWeiToGen(e.stake)} GEN</span>
                )}
                <span className="entry-id">#{e.id}</span>
              </div>
              <p className="entry-summary">{e.summary}</p>
              <div className="entry-meta">
                <div className="rowline"><span className="lbl2">Source</span><a href={e.url} target="_blank" rel="noreferrer">{e.url}</a></div>
                <div className="rowline"><span className="lbl2">Score</span><span>{e.score.toString()} / 10</span></div>
                <div className="score-bar"><span style={{ width: `${Number(e.score) * 10}%` }} /></div>
              </div>
              <div className="entry-analysis"><b>AI verdict</b>{e.analysis || "Awaiting verification — trigger Verify below."}</div>
                {mine(e) && (e.status === "pending" || e.status === "rejected") && (
                  <div className="row">
                    {e.status === "pending" && (
                      <>
                        <button type="button" className="btn ghost" style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }} disabled={acting !== null} onClick={() => act(e.id, "verify", "Verifying")}>
                          {acting === String(e.id) ? "Verifying…" : "Verify"}
                        </button>
                        <button type="button" className="btn ghost" style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }} disabled={acting !== null} onClick={() => act(e.id, "cancel", "Cancelling")}>
                          {acting === String(e.id) ? "Cancelling…" : "Cancel entry"}
                        </button>
                      </>
                    )}
                    {e.status === "rejected" && (
                      <button type="button" className="btn ghost" style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }} disabled={acting !== null} onClick={() => act(e.id, "appeal", "Appealing (fee 2 pts)")} title="Costs 2 reward points">
                        {acting === String(e.id) ? "Appealing…" : "Appeal (fee 2)"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
