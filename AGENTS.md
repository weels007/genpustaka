# AGENTS.md — GenPustaka (Crowd-sourced Knowledge Database on GenLayer)

> Catatan hidup untuk semua agent + manusia di project ini.
> Project ini PANJANG. Selalu baca file ini dulu sebelum kerja.
> WAJIB tetap mengikuti pola resmi docs GenLayer agar tidak tersesat.

## 1. Identitas Project

* **Nama resmi: `GenPustaka`**
  * Arti: `Gen` (GenLayer) + `Pustaka` (perpustakaan / knowledge base bhs Indonesia) — punya ciri khas, tetap jelas temanya.
  * Final, tidak pakai nama lain.
* **Tema docs asli:** `Crowd-sourced Knowledge Database — Implement a system where users are rewarded for finding and summarizing new information on various topics, building a comprehensive knowledge base.`
* **Lokasi:** `D:\Genlayer-project\weels\Crowd-sourced-Knowledge-Database`
* **Bahasa komunikasi:** Indonesia. Bahasa kode/komentar: Inggris.
* **Jaringan: `studionet`.**

## 2. Tujuan

Bangun Intelligent Contract + dApp di mana:
1. User submit `[topic, url, summary]` info baru.
2. Validator AI GenLayer verifikasi independen: novelty, faithfulness ke sumber, quality score.
3. Kalau `ACCEPTED`, entry jadi `verified`, author dapat reward points + reputasi. Kalau ditolak, `rejected`.
4. Knowledge base bisa di-query per topik, leaderboard, balance.

## 3. ATURAN WAJIB GenLayer (jangan dilanggar)

Sumber: https://docs.genlayer.com/ + skills `write-contract`, `genlayer-cli`, `genvm-lint`, `integration-tests`.

### 3.1 Runner version — PINNED
* Baris pertama kontrak HARUS:
  ```python
  # { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
  ```
* DILARANG: `py-genlayer:test`, `py-genlayer:latest`, `py-genlayer` tanpa hash. Ditolak network.
* Setelah tulis/ubah kontrak: selalu `genvm-lint check contracts/<file>.py`.

### 3.2 Kapan pakai GenLayer vs backend biasa
* **Frontend/backend owns:** UI, auth, indexing, preview non-otoritatif, caching, analitik.
* **GenLayer owns:** state transition yang butuh konsensus, input evidence, rule perbandingan validator, settlement (reward/reputasi/status), appeal path.
* **External sources owns:** fakta mentah / dokumen. Jangan dipercaya kecuali validator bisa re-fetch + normalisasi + bandingkan.
* Jangan rubber-stamp: kalau frontend sudah hitung jawaban final, GenLayer tidak ada gunanya.

### 3.3 Equivalence Principle — keputusan paling kritis
* `strict_eq` HANYA untuk deterministik (RPC blockchain, REST stabil + `json.dumps sort_keys=True`). JANGAN untuk LLM / halaman web berubah.
* Default untuk project ini: **custom validator `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`**.
  * Leader fetch + LLM, return structured kecil.
  * Validator rerun task yang sama, bandingkan decision fields saja, bukan teks analisis.
  * Untuk GenPustaka: bandingkan `is_novel` (exact), `is_faithful` (exact), `score` (toleransi ±1, gate: jika salah satu 0 maka harus sama-sama 0).
* `prompt_comparative` boleh untuk prototyping, tapi target akhir custom validator agar fleksibel.
* `prompt_non_comparative` HANYA untuk output open-ended murni (ringkasan bebas) di mana dua jawaban valid bisa beda total. Untuk keputusan reward/klasifikasi/skor JANGAN pakai non-comparative — harus comparative.
* Validator DILARANG hanya cek format JSON / enum allowed / summary non-empty / confidence range. Itu bukan konsensus, itu percaya leader 100%.
* Validator harus: rerun LLM/web task ATAU fetch source data yang sama dan derive status independen ATAU comparative LLM judgment atas leader vs validator output.

### 3.4 Error classification (wajib di validator)
```python
ERROR_EXPECTED  = "[EXPECTED]"   # logika bisnis deterministik — harus match persis
ERROR_EXTERNAL  = "[EXTERNAL]"   # API 4xx deterministik — harus match persis
ERROR_TRANSIENT = "[TRANSIENT]"  # network/5xx — setuju jika dua-duanya transient
ERROR_LLM       = "[LLM_ERROR]"  # LLM ngaco — selalu disagree, force rotation
```
* Gunakan helper `_handle_leader_error(leaders_res, leader_fn)` yang rerun `leader_fn` di validator dan bandingkan pesan sesuai prefix.
* Di kontrak pakai `gl.vm.UserError(f"{PREFIX} ...")`, bukan bare `Exception`.

### 3.5 Storage rules
* `list` -> `DynArray[T]`, `dict` -> `TreeMap[K,V]`, `int` -> `u256/i256/bigint`, enum simpan `.value` sebagai `str`.
* Field storage = anotasi class-level. `__init__` hanya isi nilai awal. Jangan `self.x = []` untuk DynArray/TreeMap.
* `@allow_storage @dataclass` untuk struct. Append field baru hanya di AKHIR (order-sensitive).
* `float` untuk uang DILARANG — pakai atto-scale `u256` (value * 1e18).
* Simpan hanya output kecil yang dibutuhkan. Dokumen besar / reasoning validator jangan disimpan mentah.
* Untuk baca storage di blok nondet: copy dulu ke memory (`gl.storage.copy_to_memory`) atau baca ke variabel lokal SEBELUM blok nondet.

### 3.6 LLM resilience
* Selalu `response_format="json"`, lalu validasi tipe, bersihkan JSON (strip markdown, potong `{...}`, hapus trailing comma), aliasing key (`score`/`rating`/`points`), coerce agresif ke tipe target.
* Baca storage ke variabel lokal sebelum `def leader_fn()`.

### 3.7 Anti-patterns (jangan dilakukan)
* `return True` di validator. Atau validator hanya cek shape.
* `strict_eq` untuk LLM. `float` untuk reward. `list/dict` di storage. `Enum` langsung di storage. Insert field di tengah dataclass.
* Setuju pada LLM error (harus `False` agar retry).
* Bandingkan field API yang berubah-ubah (timestamp, counts) — ekstrak stable fields atau derive status.

### 3.8 Testing & CLI workflow
1. `genvm-lint check contracts/genpustaka.py`
2. `pytest tests/direct/ -v` (mock `direct_vm.mock_web`, `mock_llm`, `clear_mocks`, `expect_revert`)
3. `glsim` / `genlayer up` lalu `gltest tests/integration/ -v -s --network localnet|studionet`
4. Deploy: `genlayer deploy --contract contracts/genpustaka.py --args ...`
5. Interaksi: `genlayer call <addr> <view>`, `genlayer write <addr> <method> --args ...`, `genlayer schema/code <addr>`
6. Debug: `genlayer receipt <txHash> --stdout --stderr`. Ingat `ACCEPTED/FINALIZED` != sukses eksekusi. Cek receipt dulu.
7. Jangan pakai `--rpc` untuk network built-in. Pakai `genlayer network set studionet|testnet-bradbury`.
8. Hormati rate-limit studionet (60 req/min, 1000/jam, 32 in-flight tx per sender). Batch harus throttle + tunggu receipt.

## 4. Arsitektur GenPustaka (MVP)

```
submit_entry(topic, url, summary) -> pending
  -> verify_entry(entry_id):
     leader_fn: web.get(url) + exec_prompt(novelty, faithfulness, score 0-10)
     validator_fn: rerun + compare is_novel/is_faithful exact, score ±1 + gate 0
  -> verified: balances[author] += base_reward * score / 10, topic_counts[topic] += 1
  -> rejected: tetap tersimpan untuk audit, tanpa reward
```

Storage MVP:
* `owner: Address`, `entries: TreeMap[str, Entry]`, `entry_ids: DynArray[str]`
* `balances: TreeMap[Address, u256]`, `topic_counts: TreeMap[str, u256]`, `next_id: u256`

Methods MVP:
* `submit_entry(topic, url, summary) -> id` (write)
* `verify_entry(entry_id) -> dict` (write + nondet, inti konsensus)
* `get_entry(id)`, `get_entries_by_topic(topic)`, `get_balance(addr)`, `get_leaderboard()`, `get_count()` (view)

Fase berikutnya (JANGAN dikerjakan sebelum MVP final):
* stake/slash anti-spam, duplicate hash index, appeal, voting kualitas, claim_reward token, frontend Next.js + genlayer-js, fee profiling.

## 5. Struktur Repo Target (boilerplate GenLayer)

```
contracts/genpustaka.py
tests/direct/test_knowledge.py
tests/integration/test_knowledge.py
frontend/ (Next.js 16 App Router + genlayer-js: `/` hero+stats, `/submit`, `/explore`, `/dashboard`, `/leaderboard`, `/contract`, shared `Header`, lib/genlayer.js, public/landing.html statis cadangan)
deploy/
gltest.config.yaml
AGENTS.md (file ini)
```

## 6. Log Aktivitas

| Tanggal (UTC) | Aktivitas | Hasil |
|---|---|---|
| 2026-10-03 | Baca docs.genlayer.com (main, developers, use-cases, ideas, equivalence, storage, tooling) + riset Truth Oracle, ContentValidator, Task Verifier, SocialOracle | Paham adjudication layer, leader/validator, Eq principle |
| 2026-10-03 | Buat AGENTS.md + tetapkan nama `GenPustaka` | File ini dibuat, aturan GenLayer ditegaskan |
| 2026-10-03 | Baca docs teliti (introduction, equivalence, non-determinism, web-access, calling-llms, crafting-prompts, error-handling, storage, debugging, examples/storage) + cek SDK lokal | API dipastikan: `gl.nondet.web.get` + `status_code/body`, `exec_prompt(response_format=json)`, `run_nondet_unsafe`, `gl.vm.UserError/Return` |
| 2026-10-03 | Scaffold `contracts/genpustaka.py` GenPustaka MVP (submit_entry + verify_entry custom validator, balances TreeMap[str,u256]) + `tests/direct/test_knowledge.py` | `genvm-lint check` OK (warning runner baru diabaikan, pinned sesuai skill), `pytest tests/direct/ -v` 4 passed. Fix: balances pakai key hex string (pola ContentValidator), bukan TreeMap[Address] |
| 2026-10-03 | Deploy studionet + test 7/7 method pakai wallet `cpe-deploy` | Kontrak v2 `0x8349...` FINAL, verify score 8, balance 8. Lihat §7 |
| 2026-10-04 | Rapikan AGENTS.md (§7 deploy, §8 DoD dicentang) | MVP dinyatakan selesai |
| 2026-10-04 | Fase 2: `url_index` anti-duplikat + `pending_counts` cap 3 + `appeal_entry` fee 2 + `get_pending_count` (field baru append di AKHIR) | `genvm-lint` OK (9 methods), `pytest tests/direct/` 7 passed. Catatan desain jujur: stake/slash GEN ditunda (butuh nilai riil, fase 3); appeal = hak yang diperoleh dari kontribusi bagus |
| 2026-10-04 | Deploy v3 studionet + uji live pakai wallet `cpe-deploy` | Kontrak `0x37f2...` (deploy `0x8a264867...`). submit OK; duplikat DITOLAK konsensus `[EXPECTED] URL already submitted`; verify 2 entry dua-duanya `rejected` skor 3 oleh validator ketat (subjektivitas LLM nyata: ringkasan yg sama lolos skor 8 di v2); appeal DITOLAK `[EXPECTED] Insufficient points` (balance 0); `get_pending_count` 1->0 konsisten |
| 2026-10-04 | Rename `knowledge.py` -> `genpustaka.py` + identitas `PROJECT_NAME/PROJECT_VERSION` + `get_project()` di kontrak (class sudah `GenPustaka`) | `genvm-lint` OK (10 methods), `pytest tests/direct/` 8 passed, deploy v4 `0x2f07...` + verify live skor 7 verified, balance 7 |
| 2026-10-04 | Jalankan `scripts/e2e-test.cjs` (genlayer-js) ke kontrak v4 | JS path TERBUKTI: `get_project`/`get_entry`/`by_topic`/`balance`/`leaderboard` semua ter-decode (termasuk map!). submit entry 1 OK. verify entry 1 -> `MAJORITY_DISAGREE` 4 ronde, state TIDAK berubah (by design): leader menilai `is_novel=false` karena ringkasan e2e menduplikasi entry 0 (novelty-context bekerja!), 3 validator disagree. Pelajaran: FINALIZED != state berubah; e2e hanya assert lunak. Tx: submit `0x3193e9f2...`, verify `0x5f063903...` |
| 2026-10-04 | Frontend `frontend/index.html` single-file dari prompt soda umum, diadaptasi ke GenPustaka | Struktur dipertahankan (hero full-viewport, glass header, carousel, parallax+repulsion+GSAP). Adaptasi: kaleng/cherry/GLB -> "Pustaka Core" CSS+SVG + knowledge orbs + partikel (aset soda tak sesuai tema); flavor -> topik (Web/AI/Crypto) ganti tema warna+headline; harga -> entry count live; tambah panel dApp (live stats, explore, submit+verify dgn burner key, leaderboard, contract). JS `node --check` OK, 28/28 ID valid |
| 2026-10-04 | Frontend full Next.js 16 (App Router) di `frontend/` sesuai boilerplate GenLayer | `create-next-app` + `genlayer-js` + `gsap`. `lib/genlayer.js` (addr v4 + ABI terbukti e2e), `app/page.js` client (hero adaptasi + stats/explore/submit+verify/leaderboard/contract), fonts via `next/font`. Hapus `AGENTS.md`/`.git` bawaan scaffold (otoritas = root AGENTS.md). `npm run build` OK, `next start` HTTP 200. `public/landing.html` = arsip single-file |
| 2026-10-04 | Fix 7 issue frontend: submit pindah ke route `/submit`; `ScrollTop` (route ganti mulai dari atas, anchor tetap smooth + `scroll-margin`); orbs diperkecil (±30-76px) + cluster tengah agar tak tutupi headline; cursor pointer semua tombol + `not-allowed` saat disabled; loading label + disable saat tx (`Submitting…`/`Verifying…`/`Exploring…`), sukses/error eksplisit, `lastId` di-null-kan pasca-verify (cegah double-verify revert); hapus kolom Balance redundan (sama dgn leaderboard); audit: tanpa mock data (cek grep bersih) | `npm run build` OK (`/`, `/submit`), serve HTTP 200 dua-duanya, landing tanpa panel submit, `/submit` ada form |
| 2026-10-04 | Navigasi jadi route sendiri: `/explore`, `/leaderboard`, `/contract` + shared `Header` (active state) | Landing tinggal hero + live stats. `npm run build` OK (5 route), serve HTTP 200 semua |
| 2026-10-04 | Explorer tanpa ketik: tab All/Web/AI/Crypto/My, auto-load + kartu topik | All = gabungan topik utama (kontrak belum ada `get_topics` — dicatat di kode), My = filter author == wallet terhubung (case-insensitive), newest-first, paralel fetch. Tanpa wallet → pesan connect. Build OK, serve 200 |
| 2026-10-04 | Topik submit jadi dropdown tetap (Web/AI/Crypto), bukan input bebas | Cegah topik asal-asalan (vektor spam). Opsi gelap agar terbaca. Build OK |
| 2026-10-04 | Connect Wallet EVM gantikan Open Studio: picker EIP-6963 (MetaMask/Rabby pilih manual, tanpa rebutan `window.ethereum`) + `client.connect("studionet")` | Riset SDK: `createClient({chain, account, provider})` didukung + pola wallet di README genlayer-js. `lib/wallet.js` (context, auto-reconnect silent, listeners), `ConnectWallet` (modal+menu+copy/disconnect), `Header` pakai itu, `/submit` sign via wallet bila terhubung else burner key. Build OK, serve 200 + tombol ter-render. Nested `frontend/AGENTS.md`+`CLAUDE.md` bawaan scaffold DIBIARKAN (aturan tooling); otoritas tetap root AGENTS.md bila konflik |
| 2026-10-04 | Favicon GenPustaka (`app/icon.svg`, kitab mint di atas gradien teal) gantikan bawaan Next.js | Build OK (route `/icon.svg` ada), serve `image/svg+xml` 200 |
| 2026-10-04 | Audit kritik tim GenLayer → paket v5: analisis cocok/tidak, eksekusi yang perlu | Berlaku: source_url binding, receipt-check, id resolution, cancel_entry, appeal history, test adversarial, get_topics/by_author. Tak berlaku (alasan dicatat): escrow/milestone, withdrawal (fee dibakar), float `/` (grep bersih), runner pinned, attribution langsung, reasoning display-only. Ditunda jujur: stake GEN riil, voting, corroborating-search |
| 2026-10-04 | Kontrak v5 (`source_url` di verdict+validator exact-match, `cancel_entry` author-only bebas slot+URL, `appeals` counter + analysis dipertahankan, `get_topics`, `get_entries_by_author`, `get_entry.appeals`) + 15 direct test (adversarial: `{}`/`"abc"`/markdown/404, tamper source_url, cancel, history) | `genvm-lint` OK (13 methods), `pytest` 15 passed. Deploy `0xc458...` + CLI: submit/cancel/resubmit-URL-bebas/by_author/topics semua OK |
| 2026-10-04 | Frontend v5: `waitFinalizedChecked` (tolak FINALIZED-tapi-rollback), `findMyEntry` (scan author+URL, bukan `count-1`), Explorer tab dinamis dari `get_topics` + My via `by_author` + tombol Cancel milik sendiri, ABI `appeals` | Build OK, serve 200. E2E ke v5 hijau penuh: submit OK, verify ACCEPTED skor 9 verified, balance 9, semua decode OK |
| 2026-10-04 | Appeal UI: tombol Verify/Cancel (pending milik sendiri) + Appeal fee 2 (rejected milik sendiri) di kartu Explorer + badge `appealed ×N` | `act()` generik (cancel/appeal/verify via wallet + `waitFinalizedChecked`), tombol tak bocor saat SSR/belum connect. Build OK, serve 200 |
| 2026-10-04 | Fase 3 tokenomics (kontrak `0xf799...`, PROJECT_VERSION 5): riset docs value-transfers (payable/`gl.message.value`/`emit_transfer`/`self.balance`, eksternal hanya `on=finalized`) + `stake_for` 100 wei / slash-ke-pool / refund-accept+cancel / `claim_gen` 10 wei-pt / `fund_pool` / `withdraw_pool` owner-only / `get_pool`+`get_config` | `genvm-lint` OK (19 methods), `pytest` 21 passed (tokenomics: exact-stake, slash, claim, withdraw-owner, cancel-refund). Live cpe-deploy (saldo ±1150 wei): stake escrow 100, fund pool 200, cancel refund (message value 100), withdraw 50 → pool 150. CLI tanpa flag `--value` → payable via JS. E2E hijau: stake PASSED, verify ACCEPTED skor 8 (refund path), balance 8. Claim live: `claim_gen(1)` 5/5 AGREE → pool 140, balance 7, message 10 wei. Konservasi dana live: wallet 1150→1010 wei + kontrak 140 = 1150 pas (stake+fund−refund−withdraw−claim). Studionet = testnet final, nilai GEN tak dipersoalkan. Catatan explorer: tiap `emit_transfer` memunculkan 1 child-tx (from=kontrak, `triggered_on=finalized`, `value_credited:true`, tanpa konsensus) — mis. `0x9095...` = refund cancel 100 wei, `0x6dae...` = withdraw 50 wei. Itu BUKAN double payout |
| 2026-10-04 | Keputusan jaringan: tetap di `studionet` | §1 AGENTS.md dikunci |
| 2026-10-04 | README.md root final (cara kerja, struktur, quickstart, keputusan jujur, tabel tx kunci) | Dokumentasi presentasi project |
| 2026-10-04 | README ditulis ulang Inggris modern (logo, badge, How-it-works, tabel kontrak, deployment+versi, dApp, tx kunci) | Gantikan versi Indonesia singkat |
| 2026-10-04 | Stake fleksibel: `MIN_STAKE` 10 wei, bukan nominal pas (balance user beda-beda; stake = confidence bond) | Kontrak PROJECT_VERSION 6 (`0x4941...`): `stake_for` terima ≥10 wei, `get_config.min_stake`; direct 21 passed (stake 250 OK, 5 wei ditolak); live: stake 250 escrow + cancel refund 250; frontend input nominal + stat MIN STAKE; README/badge/deplo table ikut v7. Build OK |
| 2026-10-05 | Nominal GEN pasti: `MIN_STAKE` 0.01 GEN, reward 0.001 GEN (ganti wei) + UI format GEN | Kontrak (`0x25D7...`): konstanta `10**16`/`10**15`; direct 21 passed skala GEN; e2e hijau (stake 0.02 GEN PASSED, verify skor 8, balance 8). Frontend: `parseGenToWei`/`formatWeiToGen` (tanpa float), input stake GEN, semua nominal tampil GEN. Syarat: wallet perlu top-up faucet (saldo lama ±1010 wei tak cukup) |
| 2026-10-04 | Audit alamat kontrak di semua tempat | Aktif (v7 `0x4941...`): `lib/genlayer.js`, `deploy.json`, `payable-test.cjs`, badge+deplo table README, `landing.html` (arsip, disamakan). Lama hanya sebagai riwayat di README + log AGENTS.md. e2e/deploy baca `deploy.json` (tanpa hardcode) |
| 2026-10-04 | Hapus kontrak lama tak terpakai | On-chain tak bisa dihapus (immutable) — yang dibersihkan: tabel versi + tx lama di README (tinggal v7 aktif), `__pycache__`. Verifikasi grep: nol referensi pensiun di luar log AGENTS.md |
| 2026-10-04 | Tangani hasil `Undetermined` di frontend (laporan user: timeout) | `Undetermined` = validator tak sepakat habis semua rotasi → by design state tak berubah. Frontend sekarang baca ulang `get_entry` saat wait gagal: pending → pesan jujur + saran retry/cancel; bila sudah berubah → tampilkan hasil asli |
| 2026-10-05 | Rombak kartu entry (dashboard+explorer): header badge + id, ringkasan lega, meta berlabel, score bar, AI verdict box, URL jadi link | Keluhan: terlalu rapat. Build OK, serve 200 |
| 2026-10-04 | Init git + push ke `weels007/genpustaka` + panduan Vercel | `.gitignore` (node_modules, artifacts, env/keys — wallet di luar repo, cek grep bersih), commit awal + push `main`. Vercel: Root Directory `frontend`, preset Next.js, tanpa env var (tertulis di README) |
| 2026-10-04 | Tombol explorer → halaman kontrak (`/address/<addr>`, bukan web Studio) | Format sesuai sibling (`explorer-studio…/address/…`); helper `explorerAddressUrl()` di lib; badge README ikut. Build OK, serve 200 |
| 2026-10-04 | Wallet-only writes: field burner key + warning dihapus total dari `/submit` | Tanpa connect = tombol disabled, signer lempar error. Tanpa sisa referensi key di app. Build OK |
| 2026-10-04 | Dashboard per-user (`/dashboard`): profile + 8 stat (submitted/verified/rejected/pending/earned/now/staked/pool) + history + claim pindah dari leaderboard | Claim/aksi hanya render bila wallet connect (SSR aman). Leaderboard murni peringkat. Nav +1. Build OK, serve 200 |

## 7. Deploy Studionet (wallet `D:\Genlayer-project\weels\contract\wallet`)

* Wallet: `cpe-deploy` (`0xD0B8fFA6ea2572D2a8F16512CAbB21eCFe6ea48b`, keystore `cpe-deploy.json` + raw key `cpe-deploy-key.json`). SEMUA deploy/call/write WAJIB pakai wallet ini (CLI: akun aktif `cpe-deploy`; JS: `createAccount(w.privateKey)` dari `cpe-deploy-key.json`). Jangan pakai wallet lain.
* **HEMAT balance GEN (aturan 2026-10-04):** uji gratis dulu (direct test, CLI read); write live seperlunya; stake bebas ≥10 wei (min stake); fund pool hanya bila perlu klaim; tarik kembali pool idle via `withdraw_pool` bila wallet menipis.
* Network: `studionet` (sudah `genlayer network set studionet`). Rate-limit: throttle, tunggu receipt antar tx.
* Kontrak v1 (bug `get_entry` int-vs-str): `0x38143004586Bc5e9D7e9b41aFC44d881F34Aa2C1` — submit OK, `get_entry` ERROR `TypeError '<' int vs str` (CLI kirim `"0"` sebagai int). Fix: `entry_id = str(entry_id)` di `verify_entry`/`get_entry`, `topic = str(topic)` di `get_entries_by_topic` (defensive coercion sesuai docs crafting-prompts).
* Kontrak v2 FINAL: `0x8349AD21303Fd348A9002B221E07644E7d5D28bd` (deploy `0x1953f29d...`, MAJORITY_AGREE).
  * `submit_entry` -> `0xb07b8b26...` OK, return `"0"`
  * `get_entry("0")` -> pending, konsisten
  * `get_entries_by_topic("Web")` -> `{count:1, ids:["0"]}`
  * `get_count` -> 1, `get_balance` -> 0, `get_leaderboard` -> `{}`
  * `verify_entry("0")` -> `0x5e389534...` ACCEPTED->FINALIZED, MAJORITY_AGREE (3 agree/2 disagree, 2 ronde), score 8 verified
  * Pasca-verify: `get_entry` = verified/score 8 + analysis, `get_balance` = 8, `get_leaderboard` = `{cpe-deploy: 8}`
* `gltest.config.yaml` final: keys valid = `paths/networks/environment` (bukan `contract_path`); network cukup `{}`, jangan `null`; tanpa `${ACCOUNT_PRIVATE_KEY_1}` bila env tidak ada.
* Artefak: `scripts/deploy.json`, `scripts/deploy.cjs`, `scripts/e2e-test.cjs`, `scripts/payable-test.cjs` (semua pakai `cpe-deploy-key.json`), `tests/integration/test_knowledge.py`.

## 8. Definisi Selesai (DoD) MVP
* [x] `genvm-lint check` lolos tanpa error
* [x] direct test submit->verify (mock) hijau
* [x] deploy + verify 1 entry nyata di studionet, receipt `FINALIZED` + eksekusi sukses
* [x] view `get_entry` mengembalikan status/score/analysis yang konsisten
