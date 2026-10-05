"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { RPC_URL, diagnoseRpc, fetchBoard, fetchByTopic, fetchCount, fetchProject } from "../lib/genlayer";

const TOPICS = [
  { name: "Web", theme: "", word: "Wisdom", glyph: "W" },
  { name: "AI", theme: "violet-theme", word: "Insight", glyph: "AI" },
  { name: "Crypto", theme: "amber-theme", word: "Signal", glyph: "₿" },
];

const ORBS_FG = ["b1", "b2", "b3", "b4", "b5", "b6"];
const ORBS_BG = ["b7", "b8", "b9"];

export default function Home() {
  const [topicIdx, setTopicIdx] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [sideWord, setSideWord] = useState("Wisdom");
  const [stats, setStats] = useState(null);
  const [chainMsg, setChainMsg] = useState("Connecting…");
  const [chainOk, setChainOk] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [topicCounts, setTopicCounts] = useState({});
  const [diag, setDiag] = useState("");

  const coreRef = useRef(null);
  const fgRef = useRef(null);
  const bgRef = useRef(null);
  const dustRef = useRef(null);
  const spinRef = useRef(0);
  const switchingRef = useRef(false);
  const mouse = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const cur = useRef({ x: 0, y: 0 });

  // motion engine: parallax + repulsion + float + particles
  useEffect(() => {
    const orbs = [...document.querySelectorAll(".orb")];
    orbs.forEach((b) => {
      b.dataset.rx = 0; b.dataset.ry = 0;
      b.dataset.angle = Math.random() * 360;
      b.dataset.baseX = 0; b.dataset.baseY = 0;
    });
    const onMove = (e) => {
      mouse.current = {
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
        px: e.clientX, py: e.clientY,
      };
    };
    window.addEventListener("mousemove", onMove);
    let raf = 0;
    const tick = () => {
      const t = Date.now() * 0.001;
      cur.current.x += (mouse.current.x - cur.current.x) * 0.05;
      cur.current.y += (mouse.current.y - cur.current.y) * 0.05;
      if (coreRef.current)
        coreRef.current.style.transform = `rotateY(${cur.current.x * 40 + spinRef.current}deg) rotateX(${-(cur.current.y * 20)}deg)`;
      if (fgRef.current) fgRef.current.style.transform = `translate(${cur.current.x * 60}px, ${cur.current.y * 60}px)`;
      if (bgRef.current) bgRef.current.style.transform = `translate(${cur.current.x * -30}px, ${cur.current.y * -30}px)`;
      if (dustRef.current) dustRef.current.style.transform = `translate(${cur.current.x * -15}px, ${cur.current.y * -15}px)`;
      if (!switchingRef.current) {
        orbs.forEach((orb, i) => {
          const r = orb.getBoundingClientRect();
          const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
          const dx = mouse.current.px - ox, dy = mouse.current.py - oy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let trx = 0, try_ = 0, mult = 1;
          if (dist < 400) {
            const f = (400 - dist) / 400;
            trx = (dx / dist) * f * -80; try_ = (dy / dist) * f * -80;
            mult = 1 + f * 5;
          }
          let rx = parseFloat(orb.dataset.rx) || 0, ry = parseFloat(orb.dataset.ry) || 0;
          let angle = parseFloat(orb.dataset.angle) || 0;
          const bx = parseFloat(orb.dataset.baseX) || 0, by = parseFloat(orb.dataset.baseY) || 0;
          rx += (trx - rx) * 0.1; ry += (try_ - ry) * 0.1; angle += 0.2 * mult;
          orb.dataset.rx = rx; orb.dataset.ry = ry; orb.dataset.angle = angle;
          const dur = [5, 7, 6, 8, 5.5, 6.5, 9, 11, 10][i % 9];
          const ph = (t + i * 0.7) * (Math.PI * 2 / dur);
          orb.style.transform = `translate(${rx + bx}px, ${ry + by + Math.sin(ph) * 15}px) rotate(${angle + Math.cos(ph) * 6}deg)`;
        });
      }
      document.querySelectorAll(".mote").forEach((m, i) => {
        const dur = 10 + i * 2, ph = (t + i * 1.2) * (Math.PI * 2 / dur);
        m.style.transform = `translate(${Math.cos(ph * 0.5) * 15}px, ${Math.sin(ph) * 20}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const spawn = setInterval(() => {
      const wrap = document.getElementById("particles-container");
      if (!wrap) return;
      const p = document.createElement("div");
      p.className = "particle";
      const s = Math.random() * 7 + 3;
      p.style.width = p.style.height = s + "px";
      p.style.left = Math.random() * 100 + "%";
      p.style.bottom = "-20px";
      p.style.opacity = Math.random() * 0.4 + 0.2;
      p.style.animation = `floatUpImg ${Math.random() * 6 + 4}s linear forwards`;
      wrap.appendChild(p);
      setTimeout(() => p.remove(), 11000);
    }, 400);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); clearInterval(spawn); };
  }, []);

  function switchTopic(idx) {
    if (switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    const t = TOPICS[idx];
    setTopicIdx(idx);
    const colors = { "": { inner: "#0b8a78", mid: "#044e3b", outer: "#011411" },
      "violet-theme": { inner: "#5b2b8a", mid: "#2c154e", outer: "#0d0614" },
      "amber-theme": { inner: "#8a5a0b", mid: "#4e3204", outer: "#140d01" } }[t.theme];
    gsap.to(document.body, { "--bg-inner": colors.inner, "--bg-mid": colors.mid, "--bg-outer": colors.outer, duration: 1.5, ease: "power2.inOut" });
    const spin = { val: 0, blur: 0 };
    gsap.to(spin, { val: 360, blur: 12, duration: 0.6, ease: "power2.in",
      onUpdate: () => { spinRef.current = spin.val; if (coreRef.current) coreRef.current.style.filter = `blur(${spin.blur}px)`; },
      onComplete: () => {
        document.body.classList.remove("violet-theme", "amber-theme");
        if (t.theme) document.body.classList.add(t.theme);
        setSideWord(t.word);
        gsap.to(spin, { val: 720, blur: 0, duration: 1.5, ease: "back.out(0.7)",
          onUpdate: () => { spinRef.current = spin.val; if (coreRef.current) coreRef.current.style.filter = `blur(${spin.blur}px)`; },
          onComplete: () => { spinRef.current = 0; if (coreRef.current) coreRef.current.style.filter = "none"; } });
      } });
    const orbs = [...document.querySelectorAll(".orb")];
    let done = 0;
    orbs.forEach((orb) => {
      const r = orb.getBoundingClientRect();
      const cx = window.innerWidth / 2 - (r.left + r.width / 2);
      const cy = window.innerHeight / 2 - (r.top + r.height / 2);
      const sa = parseFloat(orb.dataset.angle) || 0;
      const bx = parseFloat(orb.dataset.baseX) || 0, by = parseFloat(orb.dataset.baseY) || 0;
      const nx = (Math.random() - 0.5) * 200, ny = (Math.random() - 0.5) * 200;
      gsap.set(orb, { rotation: sa, x: bx, y: by });
      gsap.timeline()
        .to(orb, { x: cx, y: cy, rotation: sa + 45, scale: 0.1, opacity: 0, duration: 0.5, ease: "power2.in" })
        .to(orb, { duration: 0.3 })
        .to(orb, { x: nx, y: ny, rotation: sa + 90, scale: 1, opacity: 1, duration: 0.9, ease: "back.out(1.5)",
          onComplete: () => {
            orb.dataset.angle = sa + 90; orb.dataset.baseX = nx; orb.dataset.baseY = ny;
            orb.dataset.rx = 0; orb.dataset.ry = 0;
            if (++done === orbs.length) { switchingRef.current = false; setSwitching(false); }
          } });
    });
  }

  async function loadStats() {
    if (loadingStats) return;
    setLoadingStats(true);
    setChainMsg("Loading…"); setChainOk(false);
    try {
      const [proj, count, board] = await Promise.all([fetchProject(), fetchCount(), fetchBoard()]);
      const addrs = Object.keys(board);
      const total = addrs.reduce((s, a) => s + Number(board[a]), 0);
      setStats({ project: proj.name, count: count.toString(), users: addrs.length, points: total });
      setChainMsg("Connected to studionet."); setChainOk(true);
      const cc = {};
      for (const t of TOPICS) {
        try {
          const r = await fetchByTopic(t.name);
          cc[t.name] = r.count.toString() + " entries";
        } catch { cc[t.name] = "– entries"; }
      }
      setTopicCounts(cc);
    } catch (e) { setChainMsg("Chain read failed: " + String(e.message || e).split("\n")[0]); }
    setLoadingStats(false);
  }
  useEffect(() => { loadStats(); }, []);

  return (
    <>
      <div id="particles-container"></div>
      <Header />

      <main className="hero" id="top">
        <div className="hero-content">
          <div className="dust-container" ref={dustRef}>
            <div className="mote m1"></div><div className="mote m2"></div>
            <div className="mote m3"></div><div className="mote m4"></div>
          </div>

          <div className="hero-left">
            <h1 className="main-title">Pure<br />Knowledge</h1>
            <p className="description">Find new information, summarize it, earn rewards.<br />Every entry is verified by decentralized AI validators —<br />all in one open knowledge base.</p>
            <div><Link href="/submit" className="primary-btn" style={{ textDecoration: "none" }}>Submit Knowledge <span className="plus-icon">+</span></Link></div>
            <div className="award-badge">
              <div className="award-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3l2.5 5.5L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </div>
              <div><span className="award-title">BUILT ON GENLAYER</span><span className="award-subtitle">AI CONSENSUS VERIFIED</span></div>
            </div>
          </div>

          <div className="orbs-container-bg" ref={bgRef}>
            {ORBS_BG.map((c) => <div key={c} className={`orb ${c}`}></div>)}
          </div>

          <div className="hero-center">
            <div className="core-wrap" ref={coreRef}>
              <div className="core-ring r1"></div>
              <div className="core-ring r2"></div>
              <div className="core-ring r3"></div>
              <div className="core-glow"></div>
              <div className="core-book">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M9 8h7M9 11.5h5" stroke="#7ef0d4" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          <div className="orbs-container" ref={fgRef}>
            {ORBS_FG.map((c) => <div key={c} className={`orb ${c}`}></div>)}
          </div>

          <div className="hero-right">
            <div className="product-carousel">
              <div className="carousel-cards">
                {TOPICS.map((t, i) => (
                  <button type="button" key={t.name} disabled={switching} className={`card${i === topicIdx ? " active" : ""}`} onClick={() => switchTopic(i)}>
                    <div className="card-glyph">{t.glyph}</div>
                    <div className="card-info"><span>{t.name}</span><span>{topicCounts[t.name] || "– entries"}</span></div>
                  </button>
                ))}
              </div>
              <div className="carousel-nav">
                <button type="button" className="nav-arrow" disabled={switching} onClick={() => switchTopic((topicIdx + 2) % 3)}>←</button>
                <button type="button" className="nav-arrow" disabled={switching} onClick={() => switchTopic((topicIdx + 1) % 3)}>→</button>
              </div>
            </div>
            <h2 className="side-title">Verified<br />{sideWord}</h2>
          </div>
        </div>
      </main>

      <section className="section">
        <div className="panel">
          <h2>Live from chain</h2>
          <p className="sub">Read directly from the GenPustaka contract on studionet. Explore the <Link href="/explore">knowledge base</Link>, check the <Link href="/leaderboard">leaderboard</Link>, or <Link href="/submit">contribute</Link>.</p>
          <div className="stat-grid">
            <div className="stat"><div className="k">PROJECT</div><div className="v">{stats?.project || "…"}</div></div>
            <div className="stat"><div className="k">ENTRIES</div><div className="v">{stats?.count || "…"}</div></div>
            <div className="stat"><div className="k">CONTRIBUTORS</div><div className="v">{stats?.users ?? "…"}</div></div>
            <div className="stat"><div className="k">POINTS GIVEN</div><div className="v">{stats?.points ?? "…"}</div></div>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" disabled={loadingStats} onClick={loadStats}>{loadingStats ? "Loading…" : "Refresh"}</button>
            <button type="button" className="btn ghost" onClick={async () => { setDiag("Probing…"); const r = await diagnoseRpc(); setDiag(r.ok ? `RPC OK (${r.ms} ms, HTTP ${r.status})` : `RPC unreachable (${r.ms} ms): ${r.error || "HTTP " + r.status} — check connection/ad-blocker/VPN`); }}>Test RPC</button>
            <span className={`status${chainOk ? " ok" : ""}`}>{chainMsg}</span>
          </div>
          <div className="status">{diag} <span className="mono">{RPC_URL}</span></div>
        </div>
      </section>

      <Footer />
    </>
  );
}
