import { createClient, chains, createAccount } from "genlayer-js";
import { ExecutionResult } from "genlayer-js/types";

export const CONTRACT_ADDR = "0x8556f5c750D7508D20CaF94C43a4dA009F362dfc";
export const BUILD_ID = "2026-10-05d";
export const RPC_URL = "https://studio.genlayer.com/api";

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

// Test-scale tokenomics (matches contract constants). All amounts in wei.
// Stake is a free-amount confidence bond: any value >= MIN_STAKE.
export const MIN_STAKE_WEI = 10n ** 16n; // 0.01 GEN
export const REWARD_PER_POINT_WEI = 10n ** 15n; // 0.001 GEN
const WEI_PER_GEN = 10n ** 18n;

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
export const STUDIO_URL = "https://studio.genlayer.com";
export const explorerAddressUrl = (addr) => `https://explorer-studio.genlayer.com/address/${addr}`;

const STR = { type: "string", name: "" };
const ADDR = { type: "address", name: "" };
const U256 = { type: "uint256", name: "" };

export const ABIS = {
  submit: [{ inputs: [{ ...STR, name: "topic" }, { ...STR, name: "url" }, { ...STR, name: "summary" }], name: "submit_entry", outputs: [STR], stateMutability: "nonpayable", type: "function" }],
  verify: [{ inputs: [{ ...STR, name: "entry_id" }], name: "verify_entry", outputs: [{ ...STR, name: "entry_id" }, { ...STR, name: "status" }, { ...U256, name: "score" }, { ...STR, name: "analysis" }], stateMutability: "nonpayable", type: "function" }],
  getEntry: [{ inputs: [{ ...STR, name: "entry_id" }], name: "get_entry", outputs: [{ ...STR, name: "id" }, { ...ADDR, name: "author" }, { ...STR, name: "topic" }, { ...STR, name: "url" }, { ...STR, name: "summary" }, { ...STR, name: "status" }, { ...U256, name: "score" }, { ...STR, name: "analysis" }, { ...U256, name: "appeals" }, { ...U256, name: "stake" }], stateMutability: "view", type: "function" }],
  byTopic: [{ inputs: [{ ...STR, name: "topic" }], name: "get_entries_by_topic", outputs: [{ ...STR, name: "topic" }, { type: "string[]", name: "ids" }, { ...U256, name: "count" }], stateMutability: "view", type: "function" }],
  count: [{ inputs: [], name: "get_count", outputs: [U256], stateMutability: "view", type: "function" }],
  project: [{ inputs: [], name: "get_project", outputs: [{ ...STR, name: "name" }, { ...STR, name: "version" }], stateMutability: "view", type: "function" }],
  balance: [{ inputs: [{ ...ADDR, name: "addr" }], name: "get_balance", outputs: [U256], stateMutability: "view", type: "function" }],
  pending: [{ inputs: [{ ...ADDR, name: "addr" }], name: "get_pending_count", outputs: [U256], stateMutability: "view", type: "function" }],
  board: [{ inputs: [], name: "get_leaderboard", outputs: [STR], stateMutability: "view", type: "function" }],
  cancel: [{ inputs: [{ ...STR, name: "entry_id" }], name: "cancel_entry", outputs: [STR], stateMutability: "nonpayable", type: "function" }],
  appeal: [{ inputs: [{ ...STR, name: "entry_id" }], name: "appeal_entry", outputs: [STR], stateMutability: "nonpayable", type: "function" }],
  topics: [{ inputs: [], name: "get_topics", outputs: [STR], stateMutability: "view", type: "function" }],
  byAuthor: [{ inputs: [{ ...ADDR, name: "addr" }], name: "get_entries_by_author", outputs: [STR], stateMutability: "view", type: "function" }],
  stake: [{ inputs: [{ ...STR, name: "entry_id" }], name: "stake_for", outputs: [STR], stateMutability: "nonpayable", type: "function" }],
  claim: [{ inputs: [{ ...U256, name: "points" }], name: "claim_gen", outputs: [U256], stateMutability: "nonpayable", type: "function" }],
  pool: [{ inputs: [], name: "get_pool", outputs: [U256], stateMutability: "view", type: "function" }],
  config: [{ inputs: [], name: "get_config", outputs: [STR], stateMutability: "view", type: "function" }],
};

let _client = null;
export function getClient() {
  if (!_client) _client = createClient({ chain: chains.studionet });
  return _client;
}

export function accountFromKey(privateKey) {
  return createAccount(privateKey);
}

const read = (abi, functionName, args = []) =>
  getClient().readContract({ address: CONTRACT_ADDR, abi, functionName, args });

export const fetchProject = () => read(ABIS.project, "get_project");
export const fetchCount = () => read(ABIS.count, "get_count");
export const fetchBoard = () => read(ABIS.board, "get_leaderboard");
export const fetchByTopic = (topic) => read(ABIS.byTopic, "get_entries_by_topic", [topic]);
export const fetchEntry = (id) => read(ABIS.getEntry, "get_entry", [String(id)]);
export const fetchTopics = () => read(ABIS.topics, "get_topics");
export const fetchByAuthor = (addr) => read(ABIS.byAuthor, "get_entries_by_author", [addr]);
export const fetchPool = () => read(ABIS.pool, "get_pool");
export const fetchConfig = () => read(ABIS.config, "get_config");
export const fetchBalance = (addr) => read(ABIS.balance, "get_balance", [addr]);

export async function cancelEntry(account, entryId) {
  return getClient().writeContract({ account, address: CONTRACT_ADDR, abi: ABIS.cancel, functionName: "cancel_entry", args: [String(entryId)] });
}

export async function appealEntry(account, entryId) {
  return getClient().writeContract({ account, address: CONTRACT_ADDR, abi: ABIS.appeal, functionName: "appeal_entry", args: [String(entryId)] });
}

export async function submitEntry(account, topic, url, summary) {
  return getClient().writeContract({ account, address: CONTRACT_ADDR, abi: ABIS.submit, functionName: "submit_entry", args: [topic, url, summary] });
}

export async function verifyEntry(account, entryId) {
  return getClient().writeContract({ account, address: CONTRACT_ADDR, abi: ABIS.verify, functionName: "verify_entry", args: [String(entryId)] });
}

export async function waitFinalized(hash, timeout = 600000) {
  return getClient().waitForTransactionReceipt({ hash, status: "FINALIZED", timeout, interval: 5000 });
}

// FINALIZED is a lifecycle state, not execution success: a rolled-back
// call (e.g. duplicate URL, under-min stake) also finalizes. Always confirm
// execution via BOTH the execution-result flag AND the leader receipt,
// because simplified receipts may omit either field.
export async function waitFinalizedChecked(hash, timeout = 600000) {
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
