# Portal submission — GenPustaka (draf isian form)

## 02 · One-liner (≤180)
A crowd-sourced knowledge base where AI validators verify every submission and contributors earn rewards.

## 03 · Project overview (≤1000)
GenPustaka is a crowd-sourced knowledge database on GenLayer studionet. Anyone
submits [topic, URL, summary] of newly found information; decentralized AI
validators independently re-fetch the source and reach consensus on novelty,
faithfulness, and quality (0–10). Accepted entries earn the author reward points
plus GEN from a slashed-stake pool, while duplicates, quota abuse, and thin
sources are rejected deterministically. Authors can stake GEN on their entries,
appeal rejections, or cancel stuck ones. It is for contributors, curators, and
anyone needing trustless curation without moderators or oracles — every
judgment, score, and payout is auditable on-chain through the Next.js dApp.

## 04 · Demo video (opsional — dikosongkan)
—

## 05 · How-to
### 01 · Connect a wallet
Click **Connect Wallet** in the header, pick MetaMask or Rabby, and approve.
Your address appears in the header.
### 02 · Submit knowledge
Open **Submit**, pick a topic from the dropdown, paste a source URL and a
faithful summary (min 20 chars), then **Submit entry**. Wait for FINALIZED and
note the entry id.
### 03 · Verify the entry
Click **Verify last entry** (or Verify on your card in Explore). AI consensus
takes minutes — then the card shows verified/rejected with score + analysis.
### 04 · Explore and claim
Open **Explore** (tabs All / topic / My Entries) and **Dashboard** for your
stats and history. Burn points for GEN via **Claim GEN** on the dashboard.

## 06 · Review verification (privat)
After Submit, the new entry id is shown and the card appears under Explore →
My Entries as pending. After Verify, it shows verified or rejected with an AI
score and analysis; on verified, author points and the leaderboard update.
Re-submitting the same URL (even with ?query variants) reverts with
[EXPECTED] URL already submitted. Submit and verify are gasless; staking needs
studionet GEN from the Studio faucet.

Contract: https://explorer-studio.genlayer.com/address/0x25D703dF04f39588BaF2aa6FCf972BB9af71E9b1
