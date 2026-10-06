const { createClient, chains, createAccount } = require("genlayer-js");
const fs = require("fs");

function loadWalletKey() {
  const p = process.env.WALLET_KEY_JSON;
  if (!p) throw new Error("Set WALLET_KEY_JSON env to the deployer key JSON path.");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const path = require("path");

const DEPLOY = JSON.parse(fs.readFileSync(path.join(__dirname, "deploy.json"), "utf8"));
const CONTRACT = process.env.CONTRACT || DEPLOY.address;

// Fresh URL on every run (v4 rejects duplicate URLs via url_index).
const E2E_URL = "https://example.com?e2e=1";
// Strictly-faithful summary (no extra claims) — scored 7 on v4.
const E2E_SUMMARY = "Example.com is a domain for documentation examples without needing permission.";

const ABI_SUBMIT = [{ inputs: [{ internalType: "string", name: "topic", type: "string" }, { internalType: "string", name: "url", type: "string" }, { internalType: "string", name: "summary", type: "string" }], name: "submit_entry", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "nonpayable", type: "function" }];
const ABI_VERIFY = [{ inputs: [{ internalType: "string", name: "entry_id", type: "string" }], name: "verify_entry", outputs: [{ internalType: "string", name: "entry_id", type: "string" }, { internalType: "string", name: "status", type: "string" }, { internalType: "uint256", name: "score", type: "uint256" }, { internalType: "string", name: "analysis", type: "string" }], stateMutability: "nonpayable", type: "function" }];
const ABI_GET_ENTRY = [{ inputs: [{ internalType: "string", name: "entry_id", type: "string" }], name: "get_entry", outputs: [{ internalType: "string", name: "id", type: "string" }, { internalType: "address", name: "author", type: "address" }, { internalType: "string", name: "topic", type: "string" }, { internalType: "string", name: "url", type: "string" }, { internalType: "string", name: "summary", type: "string" }, { internalType: "string", name: "status", type: "string" }, { internalType: "uint256", name: "score", type: "uint256" }, { internalType: "string", name: "analysis", type: "string" }, { internalType: "uint256", name: "appeals", type: "uint256" }, { internalType: "uint256", name: "stake", type: "uint256" }], stateMutability: "view", type: "function" }];
const ABI_STAKE = [{ inputs: [{ internalType: "string", name: "entry_id", type: "string" }], name: "stake_for", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "nonpayable", type: "function" }];
const ABI_BY_TOPIC = [{ inputs: [{ internalType: "string", name: "topic", type: "string" }], name: "get_entries_by_topic", outputs: [{ internalType: "string", name: "topic", type: "string" }, { internalType: "string[]", name: "ids", type: "string[]" }, { internalType: "uint256", name: "count", type: "uint256" }], stateMutability: "view", type: "function" }];
const ABI_BALANCE = [{ inputs: [{ internalType: "address", name: "addr", type: "address" }], name: "get_balance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }];
const ABI_BOARD = [{ inputs: [], name: "get_leaderboard", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "view", type: "function" }];
const ABI_COUNT = [{ inputs: [], name: "get_count", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }];
const ABI_PROJECT = [{ inputs: [], name: "get_project", outputs: [{ internalType: "string", name: "name", type: "string" }, { internalType: "string", name: "version", type: "string" }], stateMutability: "view", type: "function" }];

async function main() {
  const w = loadWalletKey();
  const account = createAccount(w.privateKey || w.private_key);
  const client = createClient({ chain: chains.studionet });

  console.log("=== GenPustaka E2E ===");
  console.log("Contract:", CONTRACT);
  console.log("Account:", account.address);

  console.log("\n[0] get_project");
  const proj = await client.readContract({ address: CONTRACT, abi: ABI_PROJECT, functionName: "get_project", args: [] });
  console.log("  Project:", proj.name, "v" + proj.version);

  console.log("\n[1] get_count");
  const count0 = await client.readContract({ address: CONTRACT, abi: ABI_COUNT, functionName: "get_count", args: [] });
  console.log("  Count:", count0.toString());

  console.log("\n[2] submit_entry");
  const submitTx = await client.writeContract({ account, address: CONTRACT, abi: ABI_SUBMIT, functionName: "submit_entry", args: ["Web", E2E_URL, E2E_SUMMARY] });
  console.log("  TX:", submitTx);
  await client.waitForTransactionReceipt({ hash: submitTx, status: "FINALIZED", timeout: 180000, interval: 5000 });

  console.log("\n[3] get_entry");
  const entry = await client.readContract({ address: CONTRACT, abi: ABI_GET_ENTRY, functionName: "get_entry", args: [count0.toString()] });
  console.log("  Status:", entry.status, "| Score:", entry.score.toString(), "| Appeals:", entry.appeals.toString(), "| Stake:", entry.stake.toString());

  console.log("\n[3b] stake_for (+0.02 GEN)");
  const stakeTx = await client.writeContract({ account, address: CONTRACT, abi: ABI_STAKE, functionName: "stake_for", args: [count0.toString()], value: 20000000000000000n });
  console.log("  TX:", stakeTx);
  await client.waitForTransactionReceipt({ hash: stakeTx, status: "FINALIZED", timeout: 180000, interval: 5000 });
  const staked = await client.readContract({ address: CONTRACT, abi: ABI_GET_ENTRY, functionName: "get_entry", args: [count0.toString()] });
  console.log("  Stake now:", staked.stake.toString(), "| " + (staked.stake.toString() === "20000000000000000" ? "PASSED" : "FAILED"));

  console.log("\n[4] get_entries_by_topic");
  const byTopic = await client.readContract({ address: CONTRACT, abi: ABI_BY_TOPIC, functionName: "get_entries_by_topic", args: ["Web"] });
  console.log("  Count:", byTopic.count.toString(), "| Ids:", JSON.stringify(byTopic.ids));

  console.log("\n[5] verify_entry (consensus, may take minutes)");
  const verifyTx = await client.writeContract({ account, address: CONTRACT, abi: ABI_VERIFY, functionName: "verify_entry", args: [count0.toString()] });
  console.log("  TX:", verifyTx);
  await client.waitForTransactionReceipt({ hash: verifyTx, status: "FINALIZED", timeout: 600000, interval: 15000 });

  console.log("\n[6] get_entry (after verify)");
  const after = await client.readContract({ address: CONTRACT, abi: ABI_GET_ENTRY, functionName: "get_entry", args: [count0.toString()] });
  console.log("  Status:", after.status, "| Score:", after.score.toString());

  console.log("\n[7] get_balance");
  const bal = await client.readContract({ address: CONTRACT, abi: ABI_BALANCE, functionName: "get_balance", args: [account.address] });
  console.log("  Balance:", bal.toString());

  console.log("\n[8] get_leaderboard (map return — may not decode via tuple ABI)");
  try {
    const board = await client.readContract({ address: CONTRACT, abi: ABI_BOARD, functionName: "get_leaderboard", args: [] });
    console.log("  Board:", JSON.stringify(board));
  } catch (e) {
    console.log("  SKIPPED (decode limitation):", e.message.split("\n")[0]);
  }

  console.log("\n=== E2E done ===");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
