import { createClient, chains, createAccount } from "genlayer-js";
import { ExecutionResult } from "genlayer-js/types";

export const CONTRACT_ADDR = "0x8556f5c750D7508D20CaF94C43a4dA009F362dfc";
export const BUILD_ID = "2026-10-07a";
export const RPC_URL = "https://studio.genlayer.com/api";

// Tokenomics in GEN (matches contract constants, stored as wei on-chain).
// Stake is a free-amount confidence bond: any value >= MIN_STAKE_WEI.
export const MIN_STAKE_WEI = 10n ** 16n; // 0.01 GEN
export const REWARD_PER_POINT_WEI = 10n ** 15n; // 0.001 GEN
const WEI_PER_GEN = 10n ** 18n;
export const explorerAddressUrl = (addr) => `https://explorer-studio.genlayer.com/address/${addr}`;

// "0.05" -> 50000000000000000n. Throws on malformed input. No floats.
export function parseGenToWei(str) {
  const s = String(str).trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) throw new Error('Enter a GEN amount like "0.05".');
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * WEI_PER_GEN + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

// 50000000000000000n -> "0.05". Accepts bigint/number/string.
export function formatWeiToGen(v) {
  const bi = BigInt(String(v));
  const neg = bi < 0n ? "-" : "";
  const abs = bi < 0n ? -bi : bi;
  const whole = abs / WEI_PER_GEN;
  const frac = (abs % WEI_PER_GEN).toString().padStart(18, "0").replace(/0+$/, "");
  return neg + whole.toString() + (frac ? "." + frac : "");
}

// ---------------------------------------------------------------------------
// True contract schema (from `genvm-lint schema`, trimmed to what the app
// uses). genlayer-js decodes generically, so hand-written viem-style ABIs
// are NOT used — this table plus the decoders below are the source of truth
// for arg shapes, payable rules, and return decoding.
// ---------------------------------------------------------------------------
export const SCHEMA = {
  submit_entry: { params: ["string", "string", "string"], ret: "string", payable: false, write: true },
  stake_for: { params: ["string"], ret: "string", payable: true, write: true, needsValue: true },
  verify_entry: { params: ["string"], ret: "dict", payable: false, write: true },
  appeal_entry: { params: ["string"], ret: "string", payable: false, write: true },
  cancel_entry: { params: ["string"], ret: "string", payable: false, write: true },
  claim_gen: { params: ["int"], ret: "int", payable: false, write: true },
  fund_pool: { params: [], ret: "int", payable: true, write: true },
  withdraw_pool: { params: ["int"], ret: "int", payable: false, write: true },
  get_entry: { params: ["string"], ret: "dict", payable: false, write: false },
  get_entries_by_topic: { params: ["string"], ret: "dict", payable: false, write: false },
  get_topics: { params: [], ret: "dict", payable: false, write: false },
  get_entries_by_author: { params: ["address"], ret: "dict", payable: false, write: false },
  get_balance: { params: ["address"], ret: "int", payable: false, write: false },
  get_pending_count: { params: ["address"], ret: "int", payable: false, write: false },
  get_leaderboard: { params: [], ret: "dict", payable: false, write: false },
  get_pool: { params: [], ret: "int", payable: false, write: false },
  get_count: { params: [], ret: "int", payable: false, write: false },
  get_project: { params: [], ret: "dict", payable: false, write: false },
  get_config: { params: [], ret: "dict", payable: false, write: false },
};

// ---------------------------------------------------------------------------
// Explicit decoding adapters for dictionary-returning views (and scalars).
// Every view result passes through here: wrong shapes fail loudly instead
// of rendering garbage. BigInts are preserved (use .toString()/Number()).
// ---------------------------------------------------------------------------
function reqDict(raw, method) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${method}: expected object, got ${String(raw).slice(0, 80)}`);
  }
  return raw;
}
function field(obj, method, name) {
  if (!(name in obj)) throw new Error(`${method}: missing field "${name}"`);
  return obj[name];
}
function asStr(v, where) {
  if (typeof v !== "string") throw new Error(`${where}: expected string, got ${typeof v}`);
  return v;
}
function asAddr(v, where) {
  const s = asStr(v, where);
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error(`${where}: not an address: ${s.slice(0, 20)}…`);
  return s;
}
function asUint(v, where) {
  try {
    const bi = typeof v === "bigint" ? v : BigInt(String(v).trim());
    if (bi < 0n) throw new Error("negative");
    return bi;
  } catch {
    throw new Error(`${where}: expected uint, got ${String(v).slice(0, 40)}`);
  }
}
function asInt(v, where) {
  const n = Number(typeof v === "bigint" ? v.toString() : v);
  if (!Number.isInteger(n)) throw new Error(`${where}: expected int, got ${String(v).slice(0, 40)}`);
  return n;
}
function asStrArray(v, where) {
  if (!Array.isArray(v)) throw new Error(`${where}: expected array`);
  return v.map((x, i) => asStr(x, `${where}[${i}]`));
}

export function decodeEntry(raw) {
  const d = reqDict(raw, "get_entry");
  return {
    id: asStr(field(d, "get_entry", "id"), "entry.id"),
    author: asAddr(field(d, "get_entry", "author"), "entry.author"),
    topic: asStr(field(d, "get_entry", "topic"), "entry.topic"),
    url: asStr(field(d, "get_entry", "url"), "entry.url"),
    summary: asStr(field(d, "get_entry", "summary"), "entry.summary"),
    status: asStr(field(d, "get_entry", "status"), "entry.status"),
    score: asInt(field(d, "get_entry", "score"), "entry.score"),
    analysis: asStr(field(d, "get_entry", "analysis"), "entry.analysis"),
    appeals: asInt(field(d, "get_entry", "appeals"), "entry.appeals"),
    stake: asUint(field(d, "get_entry", "stake"), "entry.stake"),
  };
}

export function decodeTopicEntries(raw) {
  const d = reqDict(raw, "get_entries_by_topic");
  return {
    topic: asStr(field(d, "get_entries_by_topic", "topic"), "by_topic.topic"),
    ids: asStrArray(field(d, "get_entries_by_topic", "ids"), "by_topic.ids"),
    count: asInt(field(d, "get_entries_by_topic", "count"), "by_topic.count"),
  };
}

export function decodeAuthorEntries(raw) {
  const d = reqDict(raw, "get_entries_by_author");
  return {
    author: asAddr(field(d, "get_entries_by_author", "author"), "by_author.author"),
    ids: asStrArray(field(d, "get_entries_by_author", "ids"), "by_author.ids"),
    count: asInt(field(d, "get_entries_by_author", "count"), "by_author.count"),
  };
}

export function decodeTopics(raw) {
  const d = reqDict(raw, "get_topics");
  const countsRaw = reqDict(field(d, "get_topics", "counts"), "topics.counts");
  const counts = {};
  for (const [k, v] of Object.entries(countsRaw)) counts[k] = asInt(v, `topics.counts[${k}]`);
  return { topics: asStrArray(field(d, "get_topics", "topics"), "topics.topics"), counts };
}

export function decodeBoard(raw) {
  const d = reqDict(raw, "get_leaderboard");
  const out = {};
  for (const [k, v] of Object.entries(d)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(k)) throw new Error(`get_leaderboard: bad key ${k.slice(0, 20)}…`);
    out[k] = asUint(v, `get_leaderboard[${k.slice(0, 10)}…]`);
  }
  return out;
}

export function decodeProject(raw) {
  const d = reqDict(raw, "get_project");
  return {
    name: asStr(field(d, "get_project", "name"), "project.name"),
    version: asStr(field(d, "get_project", "version"), "project.version"),
  };
}

export function decodeConfig(raw) {
  const d = reqDict(raw, "get_config");
  const num = (k) => asInt(field(d, "get_config", k), `config.${k}`);
  const wei = (k) => asUint(field(d, "get_config", k), `config.${k}`);
  return {
    min_stake: wei("min_stake"),
    reward_per_point: wei("reward_per_point"),
    appeal_fee: num("appeal_fee"),
    max_pending: num("max_pending"),
    base_reward: num("base_reward"),
    pool: wei("pool"),
    balance: wei("balance"),
  };
}

// ---------------------------------------------------------------------------
// Client + typed call wrappers (reads go through decoders, writes enforce
// the payable rules from SCHEMA).
// ---------------------------------------------------------------------------
let _client = null;
export function getClient() {
  if (!_client) _client = createClient({ chain: chains.studionet });
  return _client;
}

export function accountFromKey(privateKey) {
  return createAccount(privateKey);
}

async function readView(method, args = []) {
  const entry = SCHEMA[method];
  if (!entry || entry.write) throw new Error(`Unknown view: ${method}`);
  return getClient().readContract({ address: CONTRACT_ADDR, functionName: method, args });
}

export async function writeWith(client, method, args = [], value = null) {
  const entry = SCHEMA[method];
  if (!entry || !entry.write) throw new Error(`Unknown write method: ${method}`);
  if (!entry.payable && value != null && BigInt(value) > 0n) {
    throw new Error(`${method} is not payable — refusing to attach value.`);
  }
  if (entry.needsValue && (value == null || BigInt(value) <= 0n)) {
    throw new Error(`${method} requires a positive GEN value.`);
  }
  const tx = { address: CONTRACT_ADDR, functionName: method, args };
  if (value != null) tx.value = BigInt(value);
  return client.writeContract(tx);
}

export const fetchProject = async () => decodeProject(await readView("get_project"));
export const fetchCount = async () => asUint(await readView("get_count"), "get_count");
export const fetchBoard = async () => decodeBoard(await readView("get_leaderboard"));
export const fetchByTopic = async (topic) => decodeTopicEntries(await readView("get_entries_by_topic", [topic]));
export const fetchByAuthor = async (addr) => decodeAuthorEntries(await readView("get_entries_by_author", [addr]));
export const fetchEntry = async (id) => decodeEntry(await readView("get_entry", [String(id)]));
export const fetchBalance = async (addr) => asUint(await readView("get_balance", [addr]), "get_balance");
export const fetchPending = async (addr) => asUint(await readView("get_pending_count", [addr]), "get_pending_count");
export const fetchPool = async () => asUint(await readView("get_pool"), "get_pool");
export const fetchTopics = async () => decodeTopics(await readView("get_topics"));
export const fetchConfig = async () => decodeConfig(await readView("get_config"));

export const submitEntry = (account, topic, url, summary) =>
  getClient().writeContract({ account, address: CONTRACT_ADDR, functionName: "submit_entry", args: [topic, url, summary] });
export const verifyEntry = (account, entryId) =>
  getClient().writeContract({ account, address: CONTRACT_ADDR, functionName: "verify_entry", args: [String(entryId)] });
export const cancelEntry = (account, entryId) =>
  getClient().writeContract({ account, address: CONTRACT_ADDR, functionName: "cancel_entry", args: [String(entryId)] });
export const appealEntry = (account, entryId) =>
  getClient().writeContract({ account, address: CONTRACT_ADDR, functionName: "appeal_entry", args: [String(entryId)] });

// Raw JSON-RPC connectivity probe (no SDK): distinguishes network/CORS
// failures from contract/decoding errors.
export async function diagnoseRpc() {
  const started = Date.now();
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return { ok: res.ok, ms: Date.now() - started, status: res.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e?.message || e) };
  }
}

export async function waitFinalized(hash, timeout = 600000) {
  return getClient().waitForTransactionReceipt({ hash, status: "FINALIZED", timeout, interval: 5000 });
}

// FINALIZED is a lifecycle state, not execution success: a rolled-back
// call (e.g. duplicate URL, under-min stake) also finalizes. Always confirm
// execution via BOTH the execution-result flag AND the leader receipt,
// because simplified receipts may omit either field.
export async function waitFinalizedChecked(hash, timeout = 900000) {
  const receipt = await getClient().waitForTransactionReceipt({ hash, status: "FINALIZED", timeout, interval: 5000, fullTransaction: true });
  const exec = receipt?.txExecutionResultName;
  if (exec && exec !== ExecutionResult.FINISHED_WITH_RETURN && exec !== "FINISHED_WITH_RETURN") {
    throw new Error(`Transaction finalized but execution failed (${exec}). Contract state unchanged.`);
  }
  const leaders = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(leaders) ? leaders[0] : null;
  const res = first?.result;
  const resStatus = typeof res === "object" ? res?.status : null;
  if (resStatus && resStatus !== "return") {
    const payload = typeof res?.payload === "object" ? JSON.stringify(res.payload) : String(res?.payload ?? "");
    throw new Error(`Transaction finalized but execution reverted (${resStatus}). ${payload} Contract state unchanged.`);
  }
  return receipt;
}

// Resolve OUR entry id without trusting get_count - 1 (concurrent
// submissions could steal the slot). Bounded scan, newest first.
export async function findMyEntry(myAddrLower, url, count) {
  const n = Number(count);
  for (let i = n - 1; i >= Math.max(0, n - 6); i--) {
    try {
      const e = await fetchEntry(String(i));
      if (String(e.author).toLowerCase() === myAddrLower && e.url === url) return String(i);
    } catch { /* skip unreadable slots */ }
  }
  return null;
}

export function shortAddr(a) {
  if (!a || a.length < 10) return String(a);
  return a.slice(0, 6) + "…" + a.slice(-4);
}
