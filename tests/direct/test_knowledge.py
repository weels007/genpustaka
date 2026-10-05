import json


def _deploy_fresh(direct_vm, direct_deploy, user):
    direct_vm.sender = user
    return direct_deploy("contracts/genpustaka.py")


def _mock_accept(direct_vm, score=8):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "GenLayer page content."})
    direct_vm.mock_llm(
        r".*",
        json.dumps({"is_novel": True, "is_faithful": True, "score": score, "analysis": "Good."}),
    )


def _mock_reject(direct_vm):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Unrelated content."})
    direct_vm.mock_llm(
        r".*",
        json.dumps({"is_novel": True, "is_faithful": True, "score": 2, "analysis": "Low quality."}),
    )


def test_submit_and_verify_accepted(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    entry_id = contract.submit_entry(
        "AI",
        "https://example.com/article-1",
        "Ringkasan baru tentang GenLayer consensus yang cukup panjang untuk validasi.",
    )
    assert entry_id == "0"
    assert int(contract.get_pending_count(direct_alice)) == 1

    _mock_accept(direct_vm)

    result = contract.verify_entry(entry_id)
    assert result["status"] == "verified"
    assert int(result["score"]) == 8

    entry = contract.get_entry(entry_id)
    assert entry["status"] == "verified"
    assert int(entry["score"]) == 8
    assert int(entry["appeals"]) == 0

    # reward = base_reward(10) * score(8) // 10 = 8
    assert int(contract.get_balance(direct_alice)) == 8
    assert int(contract.get_count()) == 1
    assert int(contract.get_pending_count(direct_alice)) == 0

    by_topic = contract.get_entries_by_topic("AI")
    assert by_topic["count"] == 1
    assert entry_id in by_topic["ids"]

    board = contract.get_leaderboard()
    assert len(board) > 0

    direct_vm.clear_mocks()


def test_verify_rejected_on_low_score(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    entry_id = contract.submit_entry(
        "Crypto",
        "https://example.com/article-2",
        "Ringkasan lain yang cukup panjang agar lolos validasi input submit.",
    )

    _mock_reject(direct_vm)

    result = contract.verify_entry(entry_id)
    assert result["status"] == "rejected"
    assert int(contract.get_balance(direct_alice)) == 0
    assert int(contract.get_pending_count(direct_alice)) == 0

    direct_vm.clear_mocks()


def test_submit_validation(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Topic cannot be empty"):
        contract.submit_entry("", "https://example.com/x", "Ringkasan yang cukup panjang untuk lolos.")

    with direct_vm.expect_revert("URL must start"):
        contract.submit_entry("AI", "ftp://example.com/x", "Ringkasan yang cukup panjang untuk lolos.")

    with direct_vm.expect_revert("Summary too short"):
        contract.submit_entry("AI", "https://example.com/x", "pendek")


def test_validator_agreement_and_disagreement(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    entry_id = contract.submit_entry(
        "AI",
        "https://example.com/article-3",
        "Ringkasan ketiga yang cukup panjang untuk menguji validator consensus.",
    )

    _mock_accept(direct_vm, score=7)

    contract.verify_entry(entry_id)

    # Same mocks -> validator should agree with stored leader result.
    assert direct_vm.run_validator() is True

    # Change mocks to opposite decision -> validator should disagree.
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Page content."})
    direct_vm.mock_llm(
        r".*",
        json.dumps({"is_novel": False, "is_faithful": False, "score": 0, "analysis": "Bad."}),
    )
    assert direct_vm.run_validator() is False

    direct_vm.clear_mocks()


def test_source_url_binding(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    entry_id = contract.submit_entry(
        "AI",
        "https://example.com/article-4",
        "Ringkasan keempat yang cukup panjang untuk menguji binding URL sumber.",
    )
    _mock_accept(direct_vm)
    contract.verify_entry(entry_id)

    # Untouched leader result -> agree.
    assert direct_vm.run_validator() is True

    # Verdict bound to a different URL must be rejected, even if scores match.
    tampered = {
        "is_novel": True,
        "is_faithful": True,
        "score": 8,
        "analysis": "Good.",
        "source_url": "https://evil.example.com/other",
    }
    assert direct_vm.run_validator(leader_result=tampered) is False
    direct_vm.clear_mocks()


def test_duplicate_url_rejected(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    contract.submit_entry("AI", "https://example.com/dup", "Ringkasan pertama yang cukup panjang untuk lolos.")
    with direct_vm.expect_revert("already submitted"):
        contract.submit_entry("AI", "https://example.com/dup", "Ringkasan kedua yang cukup panjang untuk lolos.")


def test_pending_cap(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    for i in range(3):
        contract.submit_entry("AI", f"https://example.com/cap-{i}", "Ringkasan spam yang cukup panjang untuk lolos validasi.")
    assert int(contract.get_pending_count(direct_alice)) == 3

    with direct_vm.expect_revert("Too many pending"):
        contract.submit_entry("AI", "https://example.com/cap-3", "Ringkasan keempat yang cukup panjang untuk lolos.")

    # Verifying one frees a slot.
    _mock_accept(direct_vm)
    contract.verify_entry("0")
    direct_vm.clear_mocks()
    assert int(contract.get_pending_count(direct_alice)) == 2

    contract.submit_entry("AI", "https://example.com/cap-3", "Ringkasan keempat yang cukup panjang untuk lolos.")
    assert int(contract.get_pending_count(direct_alice)) == 3


def test_appeal_flow(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    bad_id = contract.submit_entry("AI", "https://example.com/appeal-bad", "Ringkasan buruk yang cukup panjang untuk lolos validasi.")
    _mock_reject(direct_vm)
    assert contract.verify_entry(bad_id)["status"] == "rejected"
    direct_vm.clear_mocks()

    # No points yet -> cannot afford the appeal fee.
    with direct_vm.expect_revert("Insufficient points"):
        contract.appeal_entry(bad_id)

    # Earn points with a good entry first.
    contract.submit_entry("AI", "https://example.com/appeal-good", "Ringkasan bagus yang cukup panjang untuk lolos validasi.")
    _mock_accept(direct_vm, score=8)
    contract.verify_entry("1")
    direct_vm.clear_mocks()
    assert int(contract.get_balance(direct_alice)) == 8

    # Non-author cannot appeal.
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the author"):
        contract.appeal_entry(bad_id)
    direct_vm.sender = direct_alice

    # Appeal succeeds: fee deducted, entry back to pending.
    assert contract.appeal_entry(bad_id) == bad_id
    assert int(contract.get_balance(direct_alice)) == 6
    assert contract.get_entry(bad_id)["status"] == "pending"

    # Appealing a non-rejected entry fails.
    with direct_vm.expect_revert("Only rejected"):
        contract.appeal_entry("1")

    # Re-verify after appeal can succeed.
    _mock_accept(direct_vm, score=7)
    result = contract.verify_entry(bad_id)
    assert result["status"] == "verified"
    direct_vm.clear_mocks()


def test_appeal_preserves_history(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    bad_id = contract.submit_entry("AI", "https://example.com/hist-bad", "Ringkasan buruk yang cukup panjang untuk lolos validasi.")
    _mock_reject(direct_vm)
    contract.verify_entry(bad_id)
    direct_vm.clear_mocks()
    old_analysis = contract.get_entry(bad_id)["analysis"]
    assert old_analysis != ""

    contract.submit_entry("AI", "https://example.com/hist-good", "Ringkasan bagus yang cukup panjang untuk lolos validasi.")
    _mock_accept(direct_vm)
    contract.verify_entry("1")
    direct_vm.clear_mocks()

    contract.appeal_entry(bad_id)
    appealed = contract.get_entry(bad_id)
    assert appealed["status"] == "pending"
    assert int(appealed["appeals"]) == 1
    assert appealed["analysis"] == old_analysis
    assert int(appealed["score"]) == 0


def test_cancel_entry(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    eid = contract.submit_entry("AI", "https://example.com/cancel-me", "Ringkasan yang cukup panjang untuk lolos validasi input.")
    assert int(contract.get_pending_count(direct_alice)) == 1

    # Non-author cannot cancel.
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the author"):
        contract.cancel_entry(eid)
    direct_vm.sender = direct_alice

    assert contract.cancel_entry(eid) == eid
    cancelled = contract.get_entry(eid)
    assert cancelled["status"] == "cancelled"
    assert int(contract.get_pending_count(direct_alice)) == 0

    # Cancelled entries cannot be verified or cancelled again.
    _mock_accept(direct_vm)
    with direct_vm.expect_revert("already verified"):
        contract.verify_entry(eid)
    direct_vm.clear_mocks()
    with direct_vm.expect_revert("Only pending"):
        contract.cancel_entry(eid)
    with direct_vm.expect_revert("Only rejected"):
        contract.appeal_entry(eid)

    # The URL is freed and can be submitted again.
    eid2 = contract.submit_entry("AI", "https://example.com/cancel-me", "Ringkasan ulang yang cukup panjang untuk lolos validasi.")
    assert eid2 == "1"


def test_topics_and_author_views(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    contract.submit_entry("Web", "https://example.com/t-web", "Ringkasan web yang cukup panjang untuk lolos validasi.")
    direct_vm.sender = direct_bob
    contract.submit_entry("AI", "https://example.com/t-ai", "Ringkasan AI yang cukup panjang untuk lolos validasi input.")
    direct_vm.sender = direct_alice

    _mock_accept(direct_vm)
    contract.verify_entry("0")
    direct_vm.clear_mocks()

    topics = contract.get_topics()
    assert set(topics["topics"]) == {"Web"}
    assert int(topics["counts"]["Web"]) == 1

    mine = contract.get_entries_by_author(direct_alice)
    assert mine["ids"] == ["0"]
    assert int(mine["count"]) == 1

    bobs = contract.get_entries_by_author(direct_bob)
    assert bobs["ids"] == ["1"]


def test_adversarial_llm_missing_keys(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    contract.submit_entry("AI", "https://example.com/adv-1", "Ringkasan adversarial yang cukup panjang untuk lolos.")

    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Page."})
    direct_vm.mock_llm(r".*", json.dumps({}))
    with direct_vm.expect_revert("Non-boolean"):
        contract.verify_entry("0")
    direct_vm.clear_mocks()


def test_adversarial_llm_bad_score(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    contract.submit_entry("AI", "https://example.com/adv-2", "Ringkasan adversarial yang cukup panjang untuk lolos.")

    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Page."})
    direct_vm.mock_llm(r".*", json.dumps({"is_novel": True, "is_faithful": True, "score": "bagus sekali"}))
    with direct_vm.expect_revert("Non-numeric score"):
        contract.verify_entry("0")
    direct_vm.clear_mocks()


def test_adversarial_llm_markdown_and_coercions(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    contract.submit_entry("AI", "https://example.com/adv-3", "Ringkasan adversarial yang cukup panjang untuk lolos.")

    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Page."})
    direct_vm.mock_llm(
        r".*",
        'Here you go:\n```json\n{"is_novel": "yes", "is_faithful": 1, "score": "8", "analysis": "Fine."}\n```',
    )
    result = contract.verify_entry("0")
    assert result["status"] == "verified"
    assert int(result["score"]) == 8
    direct_vm.clear_mocks()


def test_source_unavailable_404(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    contract.submit_entry("AI", "https://example.com/gone", "Ringkasan yang cukup panjang untuk lolos validasi input.")

    direct_vm.mock_web(r".*example\.com.*", {"status": 404, "body": "Not found"})
    direct_vm.mock_llm(r".*", json.dumps({"is_novel": True, "is_faithful": True, "score": 8}))
    with direct_vm.expect_revert("Source returned 404"):
        contract.verify_entry("0")
    # Failed verification changes nothing.
    assert contract.get_entry("0")["status"] == "pending"
    direct_vm.clear_mocks()


STAKE = 2 * 10**16  # 0.02 GEN (>= MIN_STAKE of 0.01 GEN)
MIN_STAKE_WEI = 10**16
RATE_WEI = 10**15  # 0.001 GEN per point


def test_stake_happy_path(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    eid = contract.submit_entry("AI", "https://example.com/stake-1", "Ringkasan stake yang cukup panjang untuk lolos validasi.")

    # Free-amount stake: any value >= MIN_STAKE (0.01 GEN) is accepted.
    direct_vm.value = STAKE
    assert contract.stake_for(eid) == eid
    direct_vm.value = 0

    assert int(contract.get_entry(eid)["stake"]) == STAKE


def test_stake_validation(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    eid = contract.submit_entry("AI", "https://example.com/stake-2", "Ringkasan stake yang cukup panjang untuk lolos validasi.")

    with direct_vm.expect_revert("Entry not found"):
        contract.stake_for("99")

    direct_vm.value = 5
    with direct_vm.expect_revert("at least"):
        contract.stake_for(eid)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    with direct_vm.expect_revert("Only the author"):
        contract.stake_for(eid)
    direct_vm.sender = direct_alice
    direct_vm.value = 0

    direct_vm.value = STAKE
    contract.stake_for(eid)
    direct_vm.value = 0
    with direct_vm.expect_revert("already staked"):
        contract.stake_for(eid)

    _mock_accept(direct_vm)
    contract.verify_entry(eid)
    direct_vm.clear_mocks()
    with direct_vm.expect_revert("Only pending"):
        contract.stake_for(eid)


def test_verify_refunds_stake_on_accept(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    eid = contract.submit_entry("AI", "https://example.com/stake-3", "Ringkasan stake yang cukup panjang untuk lolos validasi.")

    direct_vm.value = STAKE
    contract.stake_for(eid)
    direct_vm.value = 0

    _mock_accept(direct_vm)
    assert contract.verify_entry(eid)["status"] == "verified"
    direct_vm.clear_mocks()

    assert int(contract.get_entry(eid)["stake"]) == 0
    assert int(contract.get_pool()) == 0
    assert int(contract.get_balance(direct_alice)) == 8


def test_verify_slashes_stake_to_pool(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    eid = contract.submit_entry("AI", "https://example.com/stake-4", "Ringkasan stake yang cukup panjang untuk lolos validasi.")

    direct_vm.value = STAKE
    contract.stake_for(eid)
    direct_vm.value = 0

    _mock_reject(direct_vm)
    assert contract.verify_entry(eid)["status"] == "rejected"
    direct_vm.clear_mocks()

    assert int(contract.get_entry(eid)["stake"]) == 0
    assert int(contract.get_pool()) == STAKE
    assert int(contract.get_balance(direct_alice)) == 0


def test_fund_claim_withdraw(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Send some value"):
        contract.fund_pool()

    direct_vm.value = 10**17  # 0.1 GEN
    assert int(contract.fund_pool()) == 10**17
    direct_vm.value = 0

    # Earn 8 points first.
    contract.submit_entry("AI", "https://example.com/stake-5", "Ringkasan stake yang cukup panjang untuk lolos validasi.")
    _mock_accept(direct_vm)
    contract.verify_entry("0")
    direct_vm.clear_mocks()
    assert int(contract.get_balance(direct_alice)) == 8

    with direct_vm.expect_revert("Insufficient points"):
        contract.claim_gen(100)

    # 2 points * 0.001 GEN/point = 0.002 GEN from the pool.
    assert int(contract.claim_gen(2)) == 10**17 - 2 * RATE_WEI
    assert int(contract.get_balance(direct_alice)) == 6
    assert int(contract.get_pool()) == 10**17 - 2 * RATE_WEI

    with direct_vm.expect_revert("positive"):
        contract.claim_gen(0)

    # Only the owner (alice, the deployer) can withdraw.
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only owner"):
        contract.withdraw_pool(10)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("insufficient"):
        contract.withdraw_pool(10**30)
    assert int(contract.withdraw_pool(100)) == 10**17 - 2 * RATE_WEI - 100
    assert int(contract.get_pool()) == 10**17 - 2 * RATE_WEI - 100


def test_cancel_refunds_stake(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_fresh(direct_vm, direct_deploy, direct_alice)
    eid = contract.submit_entry("AI", "https://example.com/stake-6", "Ringkasan stake yang cukup panjang untuk lolos validasi.")

    direct_vm.value = STAKE
    contract.stake_for(eid)
    direct_vm.value = 0

    assert contract.cancel_entry(eid) == eid
    cancelled = contract.get_entry(eid)
    assert cancelled["status"] == "cancelled"
    assert int(cancelled["stake"]) == 0
    assert int(contract.get_pool()) == 0
