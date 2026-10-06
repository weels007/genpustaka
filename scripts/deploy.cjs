const { createClient, chains, createAccount } = require("genlayer-js");
const fs = require("fs");

function loadWalletKey() {
  const p = process.env.WALLET_KEY_JSON;
  if (!p) throw new Error("Set WALLET_KEY_JSON env to the deployer key JSON path.");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const path = require("path");

const CODE = fs.readFileSync(path.join(__dirname, "..", "contracts", "genpustaka.py"), "utf8");

async function main() {
  const w = loadWalletKey();
  const account = createAccount(w.privateKey || w.private_key);
  const client = createClient({ chain: chains.studionet });

  console.log("Deploying GenPustaka from", account.address);
  const tx = await client.deployContract({ account, code: CODE, args: [], consensusMaxRotations: 3 });
  console.log("Deploy tx:", tx);

  const receipt = await client.waitForTransactionReceipt({ hash: tx, status: "FINALIZED", fullTransaction: true });
  const address = receipt.recipient || receipt.to_address || null;
  console.log("result_name:", receipt.result_name);
  console.log("CONTRACT_ADDRESS:", address);

  fs.writeFileSync(path.join(__dirname, "deploy.json"), JSON.stringify({ deployedAt: new Date().toISOString(), tx, address }, null, 2));
  console.log("saved scripts/deploy.json");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
