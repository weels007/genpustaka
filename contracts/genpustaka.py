# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json


ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

PROJECT_NAME = "GenPustaka"
PROJECT_VERSION = "8"

# Tokenomics in whole GEN units, stored as wei (1 GEN = 10**18 wei).
# Stake is a free-amount confidence bond: any value >= MIN_STAKE.
MIN_STAKE = 10 ** 16  # 0.01 GEN
REWARD_PER_POINT = 10 ** 15  # 0.001 GEN


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class Entry:
    author: Address
    topic: str
    url: str
    summary: str
    status: str
    score: u256
    analysis: str
    appeals: u256
    stake: u256


def _coerce_bool(value: object, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "yes", "1", "novel", "faithful", "accept", "accepted"):
            return True
        if low in ("false", "no", "0", "not novel", "not faithful", "reject", "rejected"):
            return False
    raise gl.vm.UserError(f"{ERROR_LLM} Non-boolean {field}: {value}")


def _coerce_score(value: object) -> int:
    if value is None:
        raise gl.vm.UserError(f"{ERROR_LLM} Missing 'score'")
    try:
        text = str(value).strip()
        score = int(round(float(text)))
    except (ValueError, TypeError):
        raise gl.vm.UserError(f"{ERROR_LLM} Non-numeric score: {value}")
    if score < 0:
        score = 0
    if score > 10:
        score = 10
    return score


def _clean_json_dict(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise gl.vm.UserError(f"{ERROR_LLM} LLM returned non-dict/non-str: {type(raw)}")
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise gl.vm.UserError(f"{ERROR_LLM} No JSON object in LLM output")
    candidate = text[first:last + 1]
    try:
        parsed = json.loads(candidate)
    except Exception as e:
        raise gl.vm.UserError(f"{ERROR_LLM} Invalid JSON from LLM: {e}")
    if not isinstance(parsed, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} LLM JSON is not an object")
    return parsed


def _parse_verdict(raw: object) -> dict:
    data = _clean_json_dict(raw)
    is_novel = data.get("is_novel")
    if is_novel is None:
        is_novel = data.get("novel", data.get("is_new"))
    is_faithful = data.get("is_faithful")
    if is_faithful is None:
        is_faithful = data.get("faithful", data.get("grounded"))
    score_raw = data.get("score")
    if score_raw is None:
        for alt in ("rating", "points", "value", "result", "quality"):
            if alt in data:
                score_raw = data[alt]
                break
    analysis = data.get("analysis", data.get("reasoning", data.get("explanation", "")))
    if not isinstance(analysis, str):
        analysis = str(analysis)
    return {
        "is_novel": _coerce_bool(is_novel, "is_novel"),
        "is_faithful": _coerce_bool(is_faithful, "is_faithful"),
        "score": _coerce_score(score_raw),
        "analysis": analysis[:2000],
    }


def _addr_key(addr: object) -> str:
    as_hex = getattr(addr, "as_hex", None)
    if isinstance(as_hex, str):
        return as_hex
    if isinstance(addr, bytes):
        try:
            return Address(addr).as_hex
        except Exception:
            return "0x" + bytes(addr).hex()
    if isinstance(addr, str):
        s = addr.strip()
        try:
            return Address(s).as_hex
        except Exception:
            return s
    as_bytes = getattr(addr, "as_bytes", None)
    if isinstance(as_bytes, bytes):
        try:
            return Address(as_bytes).as_hex
        except Exception:
            pass
    return str(addr)


def _handle_leader_error(leaders_res: object, leader_fn: object) -> bool:
    leader_msg = getattr(leaders_res, "message", "")
    if not isinstance(leader_msg, str):
        leader_msg = str(leader_msg)
    try:
        leader_fn()  # type: ignore[operator]
        return False
    except gl.vm.UserError as e:
        validator_msg = getattr(e, "message", str(e))
        if not isinstance(validator_msg, str):
            validator_msg = str(validator_msg)
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False
    except Exception:
        return False


def _canonical_url(url: object) -> str:
    """Normalize a URL for duplicate detection: strip query/fragment,
    lowercase scheme+host, unify http->https, drop trailing slashes."""
    u = str(url).strip()
    h = u.find("#")
    if h != -1:
        u = u[:h]
    q = u.find("?")
    if q != -1:
        u = u[:q]
    sep = u.find("://")
    if sep != -1:
        scheme = u[:sep].lower()
        if scheme == "http":
            scheme = "https"
        rest = u[sep + 3:]
        slash = rest.find("/")
        if slash == -1:
            u = scheme + "://" + rest.lower()
        else:
            u = scheme + "://" + rest[:slash].lower() + rest[slash:]
    while len(u) > 8 and u.endswith("/"):
        u = u[:-1]
    return u


def _normalize_summary(summary: object) -> str:
    """Lowercase + collapse whitespace for exact-duplicate detection."""
    return " ".join(str(summary).strip().lower().split())


class GenPustaka(gl.Contract):
    owner: Address
    entries: TreeMap[str, Entry]
    entry_ids: DynArray[str]
    balances: TreeMap[str, u256]
    topic_counts: TreeMap[str, u256]
    next_id: u256
    base_reward: u256
    url_index: TreeMap[str, str]
    pending_counts: TreeMap[str, u256]
    appeal_fee: u256
    max_pending: u256
    pool: u256
    summary_index: TreeMap[str, str]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.next_id = 0
        self.base_reward = 10
        self.appeal_fee = 2
        self.max_pending = 3

    @gl.public.write
    def submit_entry(self, topic: str, url: str, summary: str) -> str:
        if not isinstance(topic, str) or len(topic.strip()) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Topic cannot be empty")
        if len(topic) > 100:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Topic too long (max 100)")
        if not isinstance(url, str) or not (url.strip().lower().startswith("http://") or url.strip().lower().startswith("https://")):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} URL must start with http:// or https://")
        if len(url) > 500:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} URL too long (max 500)")
        if not isinstance(summary, str) or len(summary.strip()) < 20:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Summary too short (min 20 chars)")
        if len(summary) > 2000:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Summary too long (max 2000 chars)")

        clean_url = url.strip()
        canon_url = _canonical_url(clean_url)
        if canon_url in self.url_index:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} URL already submitted: {clean_url}")
        norm_summary = _normalize_summary(summary)
        if norm_summary in self.summary_index:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Identical summary already submitted")

        author = gl.message.sender_address
        author_key = _addr_key(author)
        if int(self.pending_counts.get(author_key, 0)) >= int(self.max_pending):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Too many pending entries (max {int(self.max_pending)})")

        entry_id = str(self.next_id)
        entry = Entry(
            author=author,
            topic=topic.strip(),
            url=clean_url,
            summary=summary.strip(),
            status="pending",
            score=0,
            analysis="",
            appeals=0,
            stake=0,
        )
        self.entries[entry_id] = entry
        self.entry_ids.append(entry_id)
        self.url_index[canon_url] = entry_id
        self.summary_index[norm_summary] = entry_id
        self.pending_counts[author_key] = int(self.pending_counts.get(author_key, 0)) + 1
        self.next_id = self.next_id + 1
        return entry_id

    @gl.public.write
    def verify_entry(self, entry_id: str) -> dict:
        entry_id = str(entry_id)
        if entry_id not in self.entries:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry not found: {entry_id}")
        if str(self.entries[entry_id].status) != "pending":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry already verified")

        # Read storage BEFORE nondet block (storage not accessible inside).
        topic = str(self.entries[entry_id].topic)
        url = str(self.entries[entry_id].url)
        summary = str(self.entries[entry_id].summary)
        author = self.entries[entry_id].author

        # Collect up to 5 existing summaries on same topic for novelty context.
        peer_summaries: list = []
        for eid in self.entry_ids:
            if str(eid) == str(entry_id):
                continue
            e = self.entries[str(eid)]
            if str(e.topic) == topic and str(e.status) == "verified":
                peer_summaries.append(str(e.summary)[:500])
                if len(peer_summaries) >= 5:
                    break
        peers_text = "\n".join([f"- {s}" for s in peer_summaries]) if peer_summaries else "(none yet)"

        def leader_fn():
            res = gl.nondet.web.get(url)
            status_code = getattr(res, "status_code", getattr(res, "status", 200))
            if status_code >= 400 and status_code < 500:
                raise gl.vm.UserError(f"{ERROR_EXTERNAL} Source returned {status_code}")
            if status_code >= 500:
                raise gl.vm.UserError(f"{ERROR_TRANSIENT} Source temporarily unavailable: {status_code}")
            body = res.body
            if isinstance(body, bytes):
                page_text = body.decode("utf-8", errors="ignore")
            else:
                page_text = str(body)
            page_text = page_text[:4000]

            prompt = f"""You are a strict knowledge curator for GenPustaka, a crowd-sourced knowledge base.
Topic: {topic}
User summary: {summary}
Source page (truncated): {page_text}
Already-verified summaries on this topic:
{peers_text}

Decide:
1. is_novel: true if the summary adds information not already covered above, else false.
2. is_faithful: true if the summary is grounded in the source page and has no hallucinated facts, else false.
3. score: integer 0-10 for overall quality (0 = reject, 10 = excellent). Be strict.
   If the source page itself holds almost no information (placeholder, stub,
   or boilerplate-only page), the summary cannot be high quality: cap score at 4.
4. analysis: one or two sentences of reasoning.

Return ONLY JSON with keys: is_novel (bool), is_faithful (bool), score (int), analysis (str)."""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            verdict = _parse_verdict(raw)
            # Bind the verdict to the exact source URL that was fetched.
            verdict["source_url"] = url
            return verdict

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            try:
                validator_data = leader_fn()
            except Exception:
                return False
            leader_data = leaders_res.calldata
            if not isinstance(leader_data, dict):
                return False
            try:
                # The leader must have judged the submitted URL, not another page.
                if str(leader_data.get("source_url", "")) != url:
                    return False
                if bool(leader_data.get("is_novel")) != bool(validator_data.get("is_novel")):
                    return False
                if bool(leader_data.get("is_faithful")) != bool(validator_data.get("is_faithful")):
                    return False
                leader_score = _coerce_score(leader_data.get("score"))
                validator_score = _coerce_score(validator_data.get("score"))
                if (leader_score == 0) != (validator_score == 0):
                    return False
                if abs(leader_score - validator_score) > 1:
                    return False
            except Exception:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        score_val = int(result.get("score", 0))
        analysis_val = str(result.get("analysis", ""))[:2000]
        accepted = bool(result.get("is_novel")) and bool(result.get("is_faithful")) and score_val >= 5

        author_key = _addr_key(author)
        stake_amt = int(self.entries[entry_id].stake)

        if accepted:
            new_status = "verified"
            reward = int(self.base_reward) * score_val // 10
            current = int(self.balances.get(author_key, 0))
            self.balances[author_key] = current + reward
            current_topic = int(self.topic_counts.get(topic, 0))
            self.topic_counts[topic] = current_topic + 1
            if stake_amt > 0:
                _Recipient(author).emit_transfer(value=u256(stake_amt))
        else:
            new_status = "rejected"
            if stake_amt > 0:
                self.pool = int(self.pool) + stake_amt

        pending = int(self.pending_counts.get(author_key, 0))
        self.pending_counts[author_key] = pending - 1 if pending > 0 else 0

        updated = Entry(
            author=author,
            topic=topic,
            url=url,
            summary=summary,
            status=new_status,
            score=score_val,
            analysis=analysis_val,
            appeals=int(self.entries[entry_id].appeals),
            stake=0,
        )
        self.entries[entry_id] = updated
        return {"entry_id": entry_id, "status": new_status, "score": score_val, "analysis": analysis_val}

    @gl.public.write
    def appeal_entry(self, entry_id: str) -> str:
        entry_id = str(entry_id)
        if entry_id not in self.entries:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry not found: {entry_id}")
        e = self.entries[entry_id]
        if str(e.status) != "rejected":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only rejected entries can be appealed")
        caller_key = _addr_key(gl.message.sender_address)
        if caller_key != _addr_key(e.author):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the author can appeal")
        fee = int(self.appeal_fee)
        balance = int(self.balances.get(caller_key, 0))
        if balance < fee:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient points for appeal fee ({fee})")
        if int(self.pending_counts.get(caller_key, 0)) >= int(self.max_pending):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Too many pending entries (max {int(self.max_pending)})")
        self.balances[caller_key] = balance - fee
        self.pending_counts[caller_key] = int(self.pending_counts.get(caller_key, 0)) + 1
        reset = Entry(
            author=e.author,
            topic=str(e.topic),
            url=str(e.url),
            summary=str(e.summary),
            status="pending",
            score=0,
            analysis=str(e.analysis),
            appeals=int(e.appeals) + 1,
            stake=0,
        )
        self.entries[entry_id] = reset
        return entry_id

    @gl.public.write.payable
    def stake_for(self, entry_id: str) -> str:
        entry_id = str(entry_id)
        if entry_id not in self.entries:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry not found: {entry_id}")
        e = self.entries[entry_id]
        if str(e.status) != "pending":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only pending entries can be staked")
        caller_key = _addr_key(gl.message.sender_address)
        if caller_key != _addr_key(e.author):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the author can stake")
        if int(e.stake) > 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry already staked")
        paid = int(gl.message.value)
        if paid < MIN_STAKE:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Stake must be at least 0.01 GEN")
        staked = Entry(
            author=e.author,
            topic=str(e.topic),
            url=str(e.url),
            summary=str(e.summary),
            status=str(e.status),
            score=int(e.score),
            analysis=str(e.analysis),
            appeals=int(e.appeals),
            stake=paid,
        )
        self.entries[entry_id] = staked
        return entry_id

    @gl.public.write.payable
    def fund_pool(self) -> u256:
        v = int(gl.message.value)
        if v <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Send some value to fund the pool")
        self.pool = int(self.pool) + v
        return self.pool

    @gl.public.write
    def claim_gen(self, points: u256) -> u256:
        pts = int(points)
        if pts <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Claim amount must be positive")
        caller = gl.message.sender_address
        caller_key = _addr_key(caller)
        balance = int(self.balances.get(caller_key, 0))
        if balance < pts:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient points")
        payout = pts * REWARD_PER_POINT
        pool_now = int(self.pool)
        if pool_now < payout:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Reward pool insufficient")
        self.balances[caller_key] = balance - pts
        self.pool = pool_now - payout
        _Recipient(caller).emit_transfer(value=u256(payout))
        return self.pool

    @gl.public.write
    def withdraw_pool(self, amount: u256) -> u256:
        if _addr_key(gl.message.sender_address) != _addr_key(self.owner):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only owner can withdraw")
        amt = int(amount)
        if amt <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Withdraw amount must be positive")
        pool_now = int(self.pool)
        if pool_now < amt:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Reward pool insufficient")
        self.pool = pool_now - amt
        _Recipient(self.owner).emit_transfer(value=u256(amt))
        return self.pool

    @gl.public.write
    def cancel_entry(self, entry_id: str) -> str:
        entry_id = str(entry_id)
        if entry_id not in self.entries:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry not found: {entry_id}")
        e = self.entries[entry_id]
        if str(e.status) != "pending":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only pending entries can be cancelled")
        caller_key = _addr_key(gl.message.sender_address)
        if caller_key != _addr_key(e.author):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the author can cancel")
        stake_amt = int(e.stake)
        if stake_amt > 0:
            _Recipient(e.author).emit_transfer(value=u256(stake_amt))
        cancelled = Entry(
            author=e.author,
            topic=str(e.topic),
            url=str(e.url),
            summary=str(e.summary),
            status="cancelled",
            score=0,
            analysis=str(e.analysis),
            appeals=int(e.appeals),
            stake=0,
        )
        self.entries[entry_id] = cancelled
        pending = int(self.pending_counts.get(caller_key, 0))
        self.pending_counts[caller_key] = pending - 1 if pending > 0 else 0
        url_key = _canonical_url(str(e.url))
        if url_key in self.url_index:
            del self.url_index[url_key]
        norm_key = _normalize_summary(str(e.summary))
        if norm_key in self.summary_index:
            del self.summary_index[norm_key]
        return entry_id

    @gl.public.view
    def get_entry(self, entry_id: str) -> dict:
        entry_id = str(entry_id)
        if entry_id not in self.entries:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Entry not found: {entry_id}")
        e = self.entries[entry_id]
        return {
            "id": str(entry_id),
            "author": _addr_key(e.author),
            "topic": str(e.topic),
            "url": str(e.url),
            "summary": str(e.summary),
            "status": str(e.status),
            "score": int(e.score),
            "analysis": str(e.analysis),
            "appeals": int(e.appeals),
            "stake": int(e.stake),
        }

    @gl.public.view
    def get_entries_by_topic(self, topic: str) -> dict:
        topic = str(topic)
        matched: list = []
        for eid in self.entry_ids:
            key = str(eid)
            if str(self.entries[key].topic) == topic:
                matched.append(key)
        return {"topic": topic, "ids": matched, "count": len(matched)}

    @gl.public.view
    def get_topics(self) -> dict:
        topics: list = []
        counts: dict = {}
        for topic, n in self.topic_counts.items():
            topics.append(str(topic))
            counts[str(topic)] = int(n)
        return {"topics": topics, "counts": counts}

    @gl.public.view
    def get_entries_by_author(self, addr: Address) -> dict:
        author_key = _addr_key(addr)
        matched: list = []
        for eid in self.entry_ids:
            key = str(eid)
            if _addr_key(self.entries[key].author) == author_key:
                matched.append(key)
        return {"author": author_key, "ids": matched, "count": len(matched)}

    @gl.public.view
    def get_balance(self, addr: Address) -> u256:
        return self.balances.get(_addr_key(addr), 0)

    @gl.public.view
    def get_pending_count(self, addr: Address) -> u256:
        return self.pending_counts.get(_addr_key(addr), 0)

    @gl.public.view
    def get_leaderboard(self) -> dict:
        board: dict = {}
        for addr_key, bal in self.balances.items():
            board[str(addr_key)] = int(bal)
        return board

    @gl.public.view
    def get_count(self) -> u256:
        return self.next_id

    @gl.public.view
    def get_pool(self) -> u256:
        return self.pool

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "min_stake": MIN_STAKE,
            "reward_per_point": REWARD_PER_POINT,
            "appeal_fee": int(self.appeal_fee),
            "max_pending": int(self.max_pending),
            "base_reward": int(self.base_reward),
            "pool": int(self.pool),
            "balance": int(self.balance),
        }

    @gl.public.view
    def get_project(self) -> dict:
        return {"name": PROJECT_NAME, "version": PROJECT_VERSION}
