"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "../components/Header";
import { useWallet } from "../../lib/wallet";
import {
  ABIS,
  CONTRACT_ADDR,
  REWARD_PER_POINT,
  fetchBalance,
  fetchBoard,
  fetchPool,
  shortAddr,
  waitFinalizedChecked,
} from "../../lib/genlayer";

export default function LeaderboardPage() {
  const { address, getWriteClient } = useWallet();
  const [board, setBoard] = useState([]);
  const [msg, setMsg] = useState("Loading…");
  const [loading, setLoading] = useState(false);
  const [myPts, setMyPts] = useState(null);
  const [pool, setPool] = useState(null);
  const [claimAmt, setClaimAmt] = useState("");
  const [claimMsg, setClaimMsg] = useState("");
  const [claiming, setClaiming] = useState(false);

  async function load() {
    if (loading) return;
    setLoading(true);
    setMsg("Loading…");
    try {
      const data = await fetchBoard();
      const addrs = Object.keys(data);
      setBoard(
        addrs
          .sort((a, b) => Number(data[b]) - Number(data[a]))
          .map((a) => ({ addr: a, pts: data[a].toString() }))
      );
      setMsg(addrs.length ? `${addrs.length} contributor${addrs.length > 1 ? "s" : ""}.` : "No contributors yet — be the first.");
    } catch (e) {
      setMsg("Load failed: " + String(e.message || e).split("\n")[0]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!address) { setMyPts(null); return; }
    (async () => {
      try {
        const [b, p] = await Promise.all([fetchBalance(address), fetchPool()]);
        setMyPts(b.toString());
        setPool(p.toString());
      } catch { /* ignore */ }
    })();
  }, [address, board]);

  async function onClaim() {
    if (claiming || !address) return;
    const pts = parseInt(claimAmt, 10);
    if (!pts || pts <= 0) { setClaimMsg("Enter a positive point amount."); return; }
    setClaiming(true);
    setClaimMsg(`Claiming ${pts} pts → ${pts * Number(REWARD_PER_POINT)} wei…`);
    try {
      const client = await getWriteClient();
      const tx = await client.writeContract({ address: CONTRACT_ADDR, abi: ABIS.claim, functionName: "claim_gen", args: [BigInt(pts)] });
      await waitFinalizedChecked(tx, 180000);
      setClaimMsg(`Claimed ${pts} pts for ${pts * Number(REWARD_PER_POINT)} wei GEN.`);
      setClaimAmt("");
      load();
    } catch (e) {
      setClaimMsg("Claim failed: " + String(e.message || e).split("\n")[0]);
    }
    setClaiming(false);
  }

  return (
    <>
      <Header />
      <section className="section" style={{ paddingTop: "7rem" }}>
        <div className="panel">
          <h2>Leaderboard</h2>
          <p className="sub">Reward points earned from verified entries. Want to join? <Link href="/submit">Submit knowledge</Link>.</p>
          <div className="row">
            <button type="button" className="btn ghost" disabled={loading} onClick={load}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <span className="status">{msg}</span>
          </div>
          <table className="board">
            <thead><tr><th>#</th><th>Address</th><th>Points</th></tr></thead>
            <tbody>
              {board.length ? board.map((r, i) => (
                <tr key={r.addr}><td>{i + 1}</td><td className="mono">{shortAddr(r.addr)}</td><td>{r.pts}</td></tr>
              )) : <tr><td colSpan="3">No contributors yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Claim GEN rewards</h2>
          <p className="sub">Burn points for GEN from the reward pool (funded by slashed stakes). Rate: {REWARD_PER_POINT.toString()} wei per point. Pool: {pool === null ? "…" : `${pool} wei`}.</p>
          {!address ? (
            <div className="status">Connect a wallet from the header to claim.</div>
          ) : (
            <>
              <div className="status">Your points: {myPts === null ? "…" : myPts}</div>
              <div className="row">
                <input value={claimAmt} onChange={(e) => setClaimAmt(e.target.value)} placeholder="Points" inputMode="numeric" style={{ maxWidth: 160 }} />
                <button type="button" className="btn" disabled={claiming} onClick={onClaim}>
                  {claiming ? "Claiming…" : "Claim GEN"}
                </button>
                <span className="status">{claimMsg}</span>
              </div>
            </>
          )}
        </div>
      </section>
      <footer>GenPustaka — crowd-sourced knowledge, verified by AI consensus on GenLayer.</footer>
    </>
  );
}
