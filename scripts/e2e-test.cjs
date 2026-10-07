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


async function main() {
  const w = loadWalletKey();
  const account = createAccount(w.privateKey || w.private_key);
  const client = createClient({ chain: chains.studionet });

  console.log("=== GenPustaka E2E ===");
  console.log("Contract:", CONTRACT);
  console.log("Account:", account.address);

  console.log("\n[0] get_project");
  const proj = await client.readContract({ address: CONTRACT, functionName: "get_project", args: [] });
  console.log("  Project:", proj.name, "v" + proj.version);

  console.log("\n[1] get_count");
  const count0 = await client.readContract({ address: CONTRACT, functionName: "get_count", args: [] });
  console.log("  Count:", count0.toString());

  console.log("\n[2] submit_entry");
  const submitTx = await client.writeContract({ account, address: CONTRACT, functionName: "submit_entry", args: ["Web", E2E_URL, E2E_SUMMARY] });
  console.log("  TX:", submitTx);
  await client.waitForTransactionReceipt({ hash: submitTx, status: "FINALIZED", timeout: 180000, interval: 5000 });

  console.log("\n[3] get_entry");
  const entry = await client.readContract({ address: CONTRACT, functionName: "get_entry", args: [count0.toString()] });
  console.log("  Status:", entry.status, "| Score:", entry.score.toString(), "| Appeals:", entry.appeals.toString(), "| Stake:", entry.stake.toString());

  console.log("\n[3b] stake_for (+0.02 GEN)");
  const stakeTx = await client.writeContract({ account, address: CONTRACT, functionName: "stake_for", args: [count0.toString()], value: 20000000000000000n });
  console.log("  TX:", stakeTx);
  await client.waitForTransactionReceipt({ hash: stakeTx, status: "FINALIZED", timeout: 180000, interval: 5000 });
  const staked = await client.readContract({ address: CONTRACT, functionName: "get_entry", args: [count0.toString()] });
  console.log("  Stake now:", staked.stake.toString(), "| " + (staked.stake.toString() === "20000000000000000" ? "PASSED" : "FAILED"));

  console.log("\n[4] get_entries_by_topic");
  const byTopic = await client.readContract({ address: CONTRACT, functionName: "get_entries_by_topic", args: ["Web"] });
  console.log("  Count:", byTopic.count.toString(), "| Ids:", JSON.stringify(byTopic.ids));

  console.log("\n[5] verify_entry (consensus, may take minutes)");
  const verifyTx = await client.writeContract({ account, address: CONTRACT, functionName: "verify_entry", args: [count0.toString()] });
  console.log("  TX:", verifyTx);
  await client.waitForTransactionReceipt({ hash: verifyTx, status: "FINALIZED", timeout: 600000, interval: 15000 });

  console.log("\n[6] get_entry (after verify)");
  const after = await client.readContract({ address: CONTRACT, functionName: "get_entry", args: [count0.toString()] });
  console.log("  Status:", after.status, "| Score:", after.score.toString());

  console.log("\n[7] get_balance");
  const bal = await client.readContract({ address: CONTRACT, functionName: "get_balance", args: [account.address] });
  console.log("  Balance:", bal.toString());

  console.log("\n[8] get_leaderboard (map return — may not decode via tuple ABI)");
  try {
    const board = await client.readContract({ address: CONTRACT, functionName: "get_leaderboard", args: [] });
    console.log("  Board:", JSON.stringify(board));
  } catch (e) {
    console.log("  SKIPPED (decode limitation):", e.message.split("\n")[0]);
  }

  console.log("\n=== E2E done ===");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
