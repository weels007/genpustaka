<div align="center">

<img src="frontend/app/icon.svg" width="120" alt="GenPustaka logo" />

# GenPustaka

**A crowd-sourced knowledge database where contributors are rewarded for finding
and summarizing new information — every entry verified by decentralized AI consensus.**

[![GenLayer](https://img.shields.io/badge/GenLayer-studionet-0b8a78)](https://docs.genlayer.com/)
[![Contract](https://img.shields.io/badge/contract-0x25D7…f71E9b1-4e3204)](https://explorer-studio.genlayer.com/address/0x25D703dF04f39588BaF2aa6FCf972BB9af71E9b1)
[![Tests](https://img.shields.io/badge/direct--tests-21_passed-0b8a78)](#development)
[![Frontend](https://img.shields.io/badge/frontend-Next.js_16-black)](#dapp)

[How it works](#-how-it-works) · [Smart contract](#-smart-contract) ·
[Deployment](#-deployment) · [dApp](#-dapp) · [Development](#-development)

</div>

---

## 📖 About

`Gen` (GenLayer) + `Pustaka` (Indonesian for *library*). GenPustaka turns the
[GenLayer idea](https://docs.genlayer.com/developers/intelligent-contracts/ideas)
*"Crowd-sourced Knowledge Database"* into a working product:

1. Anyone submits `[topic, url, summary]` of newly found information.
2. Independent AI validators re-fetch the source and judge **novelty**,
   **faithfulness**, and **quality (0–10)** through on-chain consensus.
3. Accepted entries earn the author **reward points + GEN**; rejected ones stay
   on record for audit.

No oracles, no moderators — judgment is trustless.

## ⚙️ How it works

```text
submit_entry(topic, url, summary) ──▶ pending
        │  duplicate URL rejected · max 3 pending/author
        ▼
stake_for(entry), any amount >= 0.01 GEN (optional escrow)
        ▼
verify_entry(entry)  ── consensus ──▶ verified  → points += score
     leader: web.get(url) + LLM verdict            ├─ stake refunded
     validator: reruns + compares decision fields  └─ topic counter += 1
                     │                         └─▶ rejected  → stake slashed to pool
        ┌────────────┴─────────────┐
appeal_entry (author, fee 2 pts)   cancel_entry (author, stake refunded)
        │ re-verifiable                 │ frees quota + URL
claim_gen(points) → GEN from pool · fund_pool / withdraw_pool (owner)
```

**Consensus rule** (custom `run_nondet_unsafe` validator): `is_novel` and
`is_faithful` must match exactly, `score` within ±1 (either side scoring `0`
forces agreement), and the verdict must be bound to the submitted `source_url`.
`FINALIZED` alone never means success — execution results are always checked.

## 📜 Smart contract

`contracts/genpustaka.py` — `GenPustaka` (`gl.Contract`, pinned runner,
`TreeMap`/`DynArray`/`u256` storage, atto-scale wei, no `float` money).

| Method | Type | Description |
|---|---|---|
| `submit_entry` | write | New entry → `pending` (dup + quota guards) |
| `stake_for` | write payable | Escrow any amount ≥ 0.01 GEN on own pending entry |
| `verify_entry` | write + consensus | AI novelty/faithfulness/score verdict |
| `appeal_entry` | write | Author-only re-queue of `rejected` (fee 2 pts, history kept) |
| `cancel_entry` | write | Author-only escape hatch (refunds stake, frees URL) |
| `claim_gen` | write | Burn points → GEN from pool (0.001 GEN/pt) |
| `fund_pool` / `withdraw_pool` | write payable / owner | Pool top-up / owner withdrawal (no locked fees) |
| `get_entry` / `get_entries_by_topic` / `get_topics` / `get_entries_by_author` | view | Reads (incl. `stake`, `appeals`) |
| `get_balance` / `get_pending_count` / `get_leaderboard` | view | Points, quota, ranking |
| `get_pool` / `get_config` / `get_count` / `get_project` | view | Tokenomics + identity |

## 🚀 Deployment

Network: **GenLayer studionet**.

**Contract:** `0x25D703dF04f39588BaF2aa6FCf972BB9af71E9b1`
([view in explorer](https://explorer-studio.genlayer.com/address/0x25D703dF04f39588BaF2aa6FCf972BB9af71E9b1))

Deploys and writes use the project's private deployer wallet (kept out of this
repo). `get_project` answers `GenPustaka`.

> Each `emit_transfer` spawns one child tx (`from` = contract,
> `triggered_on: finalized`) — that is the payout arriving, not a double spend.
> Live fund conservation verified: 1150 = 1010 wallet + 140 contract.

## 🖥️ dApp

`frontend/` — Next.js 16 App Router + `genlayer-js` + EIP-6963 wallet picker
(MetaMask/Rabby, manual choice, auto-reconnect).

| Route | Purpose |
|---|---|
| `/` | Hero + live on-chain stats |
| `/submit` | Submit (fixed topic dropdown) + AI verify, wallet or burner key |
| `/explore` | Dynamic topic tabs + My entries; verify / stake / cancel / appeal own entries |
| `/leaderboard` | Ranking + claim GEN rewards |
| `/contract` | Address, pool, tokenomics config |

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000
```

### Deploy to Vercel

The Next.js app lives in `frontend/`, so when importing
[weels007/genpustaka](https://github.com/weels007/genpustaka) into Vercel set:

| Setting | Value |
|---|---|
| Framework Preset | Next.js (auto-detected) |
| **Root Directory** | `frontend` |
| Build Command | `npm run build` (default) |
| Output Directory | default (`.next`) |
| Environment Variables | none required |

No secrets are needed: reads are public and writes are signed in the user's
own MetaMask/Rabby wallet.

## 🛠️ Development

```bash
genvm-lint check contracts/genpustaka.py   # must pass, pinned runner
pytest tests/direct/ -v                    # 21 tests: consensus, adversarial, tokenomics
gltest tests/integration/ -v -s            # smoke (uses ephemeral accounts)
node scripts/e2e-test.cjs                  # live studionet flow (deployer key)
```

Notes: the CLI has no `--value` flag — payable calls go through `scripts/`;
studionet is gasless but GEN balances transfer for real (test-scale wei).

---

<div align="center">

**GenPustaka** — crowd-sourced knowledge, verified by AI consensus on GenLayer.

</div>
