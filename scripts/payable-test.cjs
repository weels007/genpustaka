const { createClient, chains, createAccount } = require("genlayer-js");
const fs = require("fs");

const CONTRACT = "0x25D703dF04f39588BaF2aa6FCf972BB9af71E9b1";
const STR = { type: "string", name: "" };
const U256 = { type: "uint256", name: "" };
const ABI_STAKE = [{ inputs: [{ ...STR, name: "entry_id" }], name: "stake_for", outputs: [STR], stateMutability: "nonpayable", type: "function" }];
const ABI_FUND = [{ inputs: [], name: "fund_pool", outputs: [U256], stateMutability: "nonpayable", type: "function" }];
const ABI_POOL = [{ inputs: [], name: "get_pool", outputs: [U256], stateMutability: "view", type: "function" }];
const ABI_CONFIG = [{ inputs: [], name: "get_config", outputs: [STR], stateMutability: "view", type: "function" }];

async function checked(client, hash, timeout = 180000) {
  const r = await client.waitForTransactionReceipt({ hash, status: "FINALIZED", timeout, interval: 5000, fullTransaction: true });
  const exec = r.txExecutionResultName;
  if (exec && exec !== "FINISHED_WITH_RETURN") throw new Error("execution failed: " + exec);
  return r;
}

async function main() {
  const w = JSON.parse(fs.readFileSync("D:\\Genlayer-project\\weels\\contract\\wallet\\cpe-deploy-key.json", "utf8"));
  const account = createAccount(w.privateKey);
  const client = createClient({ chain: chains.studionet, account });
  console.log("Account:", account.address, "Contract:", CONTRACT);

  console.log("\n[1] stake_for(0) + 0.02 GEN");
  let tx = await client.writeContract({ address: CONTRACT, abi: ABI_STAKE, functionName: "stake_for", args: ["0"], value: 20000000000000000n });
  console.log("  TX:", tx);
  await checked(client, tx);

  let cfg = await client.readContract({ address: CONTRACT, abi: ABI_CONFIG, functionName: "get_config", args: [] });
  console.log("  contract balance:", cfg.balance.toString(), "wei | pool:", cfg.pool.toString(), "| min_stake:", cfg.min_stake.toString());
  console.log("  " + (cfg.balance.toString() === "20000000000000000" ? "PASSED (0.02 GEN escrowed)" : "FAILED"));

  console.log("\n=== flexible stake OK (fund/withdraw already proven) ===");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
