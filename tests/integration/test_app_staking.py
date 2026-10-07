"""App-level reads + GEN staking end to end (same calls as the Next.js app).

No LLM consensus involved: only deterministic methods, so this is fast.
Value-bearing `stake_for` is exercised with real wei.

Run against studionet with a FUNDED key (staking moves real GEN):
    $env:GENPUSTAKA_FUNDED_KEY = "<0x...>"   # PowerShell, never commit this
    gltest tests/integration/test_app_staking.py -v -s --network studionet

Claim/verify (LLM consensus) are covered by direct tests, CLI runs, and e2e.
"""

import os

import pytest
from eth_account import Account

from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

FUNDED_KEY = os.environ.get("GENPUSTAKA_FUNDED_KEY")
needs_funds = pytest.mark.skipif(not FUNDED_KEY, reason="GENPUSTAKA_FUNDED_KEY not set (needs >= 0.03 GEN on studionet)")

STAKE = 2 * 10**16  # 0.02 GEN
FUND = 10**15  # 0.001 GEN
TOPIC = "Web"
URL = "https://example.com"
SUMMARY = "Example.com is a domain for documentation examples without needing permission."


def _deploy():
    factory = get_contract_factory("GenPustaka")
    return factory.deploy(args=[], account=Account.from_key(FUNDED_KEY))


@needs_funds
def test_app_reads_and_staking():
    contract = _deploy()

    # --- identity + empty-state reads (all dictionary views decode) ---
    info = contract.get_project(args=[]).call()
    assert info["name"] == "GenPustaka"

    assert int(contract.get_count(args=[]).call()) == 0
    assert contract.get_topics(args=[]).call()["topics"] == []
    assert contract.get_leaderboard(args=[]).call() == {}
    assert int(contract.get_pool(args=[]).call()) == 0

    cfg = contract.get_config(args=[]).call()
    assert int(cfg["min_stake"]) == 10**16
    assert int(cfg["reward_per_point"]) == 10**15
    assert int(cfg["balance"]) == 0

    # --- submit (same call the app's Submit page makes) ---
    tx = contract.submit_entry(args=[TOPIC, URL, SUMMARY]).transact()
    assert tx_execution_succeeded(tx)

    entry = contract.get_entry(args=["0"]).call()
    assert entry["status"] == "pending"
    assert entry["topic"] == TOPIC
    assert entry["url"] == URL
    assert int(entry["stake"]) == 0
    assert int(entry["appeals"]) == 0

    assert int(contract.get_entries_by_topic(args=[TOPIC]).call()["count"]) == 1

    # --- value-bearing stake call (payable as required by the schema) ---
    tx = contract.stake_for(args=["0"]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)

    staked = contract.get_entry(args=["0"]).call()
    assert int(staked["stake"]) == STAKE
    assert int(contract.get_config(args=[]).call()["balance"]) == STAKE

    # --- fund + owner withdraw close the pool loop ---
    tx = contract.fund_pool(args=[]).transact(value=FUND)
    assert tx_execution_succeeded(tx)
    assert int(contract.get_pool(args=[]).call()) == FUND

    tx = contract.withdraw_pool(args=[FUND]).transact()
    assert tx_execution_succeeded(tx)
    assert int(contract.get_pool(args=[]).call()) == 0

    # --- cancel refunds the escrow without any LLM round ---
    tx = contract.cancel_entry(args=["0"]).transact()
    assert tx_execution_succeeded(tx)

    gone = contract.get_entry(args=["0"]).call()
    assert gone["status"] == "cancelled"
    assert int(gone["stake"]) == 0
