const { createClient, chains, createAccount } = require("genlayer-js");
const fs = require("fs");
const path = require("path");

const CODE = fs.readFileSync(path.join(__dirname, "..", "contracts", "genpustaka.py"), "utf8");

async function main() {
  const w = JSON.parse(
    fs.readFileSync("D:\\Genlayer-project\\weels\\contract\\wallet\\cpe-deploy-key.json", "utf8")
  );
  const account = createAccount(w.privateKey);
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
