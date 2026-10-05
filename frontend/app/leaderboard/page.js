"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { fetchBoard, shortAddr } from "../../lib/genlayer";

export default function LeaderboardPage() {
  const [board, setBoard] = useState([]);
  const [msg, setMsg] = useState("Loading…");
  const [loading, setLoading] = useState(false);

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

  return (
    <>
      <Header />
      <section className="section" style={{ paddingTop: "7rem" }}>
        <div className="panel">
          <h2>Leaderboard</h2>
          <p className="sub">Reward points earned from verified entries. Want to join? <Link href="/submit">Submit knowledge</Link>. To claim GEN for your points, open your <Link href="/dashboard">dashboard</Link>.</p>
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
      </section>
      <Footer />
    </>
  );
}
