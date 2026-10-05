"""GenPustaka integration tests (full consensus on live network).

Run: gltest tests/integration/ -v -s --network studionet
Note: verify_entry does real web + LLM consensus, can take minutes.
"""

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


def test_submit_and_views():
    factory = get_contract_factory("GenPustaka")
    contract = factory.deploy(args=[])

    info = contract.get_project(args=[]).call()
    assert info["name"] == "GenPustaka"

    tx = contract.submit_entry(
        args=[
            "Web",
            "https://example.com",
            "Example.com is a reserved domain by IANA for illustrative examples in documentation.",
        ]
    ).transact()
    assert tx_execution_succeeded(tx)

    count = contract.get_count(args=[]).call()
    assert int(count) == 1

    entry = contract.get_entry(args=["0"]).call()
    assert entry["status"] == "pending"
    assert entry["topic"] == "Web"

    by_topic = contract.get_entries_by_topic(args=["Web"]).call()
    assert int(by_topic["count"]) == 1


@pytest.mark.slow
def test_verify_entry_consensus():
    factory = get_contract_factory("GenPustaka")
    contract = factory.deploy(args=[])

    tx = contract.submit_entry(
        args=[
            "Web",
            "https://example.com",
            "Example.com is a reserved domain by IANA for illustrative examples in documentation.",
        ]
    ).transact()
    assert tx_execution_succeeded(tx)

    tx_verify = contract.verify_entry(args=["0"]).transact()
    assert tx_execution_succeeded(tx_verify)

    entry = contract.get_entry(args=["0"]).call()
    assert entry["status"] in ("verified", "rejected")
    assert 0 <= int(entry["score"]) <= 10

    board = contract.get_leaderboard(args=[]).call()
    assert isinstance(board, dict)
