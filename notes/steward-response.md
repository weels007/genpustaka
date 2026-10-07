# Steward response — GenPustaka (what changed)

## 1. App ABIs corrected (frontend/lib/genlayer.js)
Reading the genlayer-js type definitions showed `readContract`/`writeContract`
take no `abi` parameter at all — our hand-written tuple ABIs were silently
ignored by the SDK. Removed every fake ABI from the app and `scripts/`.
In their place: a `SCHEMA` table transcribed from `genvm-lint schema` output
(params, return kind, payable, read/write per method) plus explicit decoding
adapters for all dictionary-returning views (`decodeEntry`,
`decodeTopicEntries`, `decodeAuthorEntries`, `decodeTopics`, `decodeBoard`,
`decodeProject`, `decodeConfig`). Each adapter validates field presence and
types, preserves BigInt for uints, and throws a descriptive error on shape
mismatch instead of rendering garbage. All reads route through them.

## 2. Value-bearing stake call marked payable
`stake_for` is declared `payable:true` per the schema. The new `writeWith()`
wrapper enforces the payable rules: it refuses value on non-payable methods
and requires a positive value on `stake_for`. Scripts updated the same way.

## 3. Repository integration test (tests/integration/test_app_staking.py)
End-to-end on studionet, no LLM consensus (deterministic methods only):
deploy → all dict-view reads → submit_entry → `stake_for` with 0.02 GEN of
real value → fund_pool → owner withdraw_pool → cancel_entry refund.
PASSED in ~85s. The funded key comes from the `GENPUSTAKA_FUNDED_KEY`
environment variable and is never committed. Note: GLSim cannot run this
contract (its bundled runner rejects `@gl.evm.contract_interface`), so the
test targets studionet.

No contract changes were needed: `contracts/` untouched, active contract is
still 0x8556f5c750D7508D20CaF94C43a4dA009F362dfc.
