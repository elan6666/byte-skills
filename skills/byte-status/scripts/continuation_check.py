#!/usr/bin/env python3
"""Read-only outcome continuation check; no scheduler, network, or host hooks.

Accept an existing JSON state's ``overall_outcome`` member or the same object
as the document root. Relative evidence paths resolve beside the state file.
Exit 0: recorded completion or a justified yield; 2: continue work; 1: invalid.
This checks recorded evidence identity and consistency. It neither tests a
real wakeup nor authenticates authorship nor enforces agent/host behavior.
"""

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


LIMITATION = (
    "Validates local records, hashes and consistency only; does not authenticate "
    "receipt authors, create monitoring, test real wakeups, or enforce host behavior."
)

SCHEMA_HELP = '''Minimal existing state (the overall_outcome object can also be the root):
{
  "overall_outcome": {
    "schema_version": 1, "id": "research", "objective": "Resolve the observed issue",
    "status": "active",
    "acceptance": [{"id": "quality", "status": "pending"}],
    "next_action": {"description": "Implement and verify next candidate", "trigger": "ready"},
    "execution": {"mode": "active"}
  }
}

Complete: status=complete, every acceptance status=met with nonempty evidence
  [{"path": "receipt.json", "sha256": "<64 lowercase hex>"}]. Each referenced
  JSON must have kind=acceptance_verification, outcome_id=this outcome's id,
  criterion_id=that acceptance id, status=verified, and nonempty
  sources:[{"path": "result.json", "sha256": "<64 lowercase hex>"}]. Source
  attachments are hash-checked too; an unrelated result is not acceptance.
Paused: pause_request is a path/sha256 reference to JSON containing
  kind=user_pause_request, requested_by=user, outcome_id and request_ref.
Blocked: blocker has kind (user_input, credentials, payment, authority, or
  unavailable_external_state), reason, external_dependency, resume_trigger,
  a nonempty evidence list, and independent_work_remaining=false. If true,
  continue available work; missing is invalid.
Waiting: status remains active; next_action.trigger=run_terminal;
  execution.mode=waiting and independent_work_remaining=false. Execution has
  run_id, attempt (positive integer), owner_session, supervisor_session,
  monitor_id and three path/sha256 references: supervisor_ack,
  monitor_registration, return_wake_receipt. Each referenced JSON has the same
  outcome_id/run_id/attempt/owner_session/supervisor_session/monitor_id and
  checked_at/valid_until (ISO 8601 with timezone). Required kind/status pairs:
  supervisor_ack/acknowledged; monitor_registration/active; return_wake/verified.
  return_wake_receipt also has a nonempty verification_ref describing real
  route verification evidence. Message delivery alone is insufficient.

Relative paths resolve beside the input state. Reads only; no jobs are launched.
Exit 0 permits a justified yield/completion; exit 2 means continue; exit 1 means
repair invalid state/evidence. --now is only for deterministic offline checks.
This is an opt-in consistency check, NOT a host-enforced runtime guarantee.
'''


class Invalid(ValueError):
    pass


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's usual exit 2 would collide with "continue_work".
        raise Invalid(f"arguments: {message}")


def require(condition, message):
    if not condition:
        raise Invalid(message)


def nonempty(value, name):
    require(isinstance(value, str) and bool(value.strip()), f"{name} must be nonempty text")
    return value


def timestamp(value, name):
    nonempty(value, name)
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Invalid(f"{name} must be an ISO 8601 timestamp") from exc
    require(result.tzinfo is not None, f"{name} must include a timezone")
    return result.astimezone(timezone.utc)


def read_json(data, name):
    try:
        result = json.loads(data)
    except (ValueError, UnicodeError) as exc:
        raise Invalid(f"{name} is not valid JSON") from exc
    require(isinstance(result, dict), f"{name} must contain a JSON object")
    return result


def evidence_bytes(reference, root, name):
    require(isinstance(reference, dict), f"{name} must be a path/sha256 reference")
    path = Path(nonempty(reference.get("path"), f"{name}.path"))
    expected = reference.get("sha256")
    require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected),
            f"{name}.sha256 must be 64 lowercase hex characters")
    path = path if path.is_absolute() else root / path
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise Invalid(f"{name}: evidence unavailable ({exc.__class__.__name__})") from exc
    require(hashlib.sha256(data).hexdigest() == expected, f"{name}: evidence SHA256 mismatch")
    return data


def evidence_list(references, root, name):
    require(isinstance(references, list) and bool(references), f"{name} needs evidence")
    for index, reference in enumerate(references):
        evidence_bytes(reference, root, f"{name}[{index}]")


def acceptance_evidence(references, root, outcome_id, criterion_id):
    name = f"acceptance.{criterion_id}.evidence"
    require(isinstance(references, list) and bool(references), f"{name} needs verification receipts")
    for index, reference in enumerate(references):
        receipt_name = f"{name}[{index}]"
        receipt = read_json(evidence_bytes(reference, root, receipt_name), receipt_name)
        require(receipt.get("kind") == "acceptance_verification",
                f"{receipt_name}: requires acceptance_verification kind")
        require(receipt.get("outcome_id") == outcome_id, f"{receipt_name}: outcome_id mismatch")
        require(receipt.get("criterion_id") == criterion_id, f"{receipt_name}: criterion_id mismatch")
        require(receipt.get("status") == "verified", f"{receipt_name}: acceptance not verified")
        evidence_list(receipt.get("sources"), root, f"{receipt_name}.sources")


def waiting_receipt(reference, root, name, execution, outcome_id, now, max_age):
    receipt = read_json(evidence_bytes(reference, root, name), name)
    for field in ("run_id", "attempt", "owner_session", "supervisor_session", "monitor_id"):
        require(type(receipt.get(field)) is type(execution[field]) and
                receipt.get(field) == execution[field], f"{name}: {field} mismatch")
    require(receipt.get("outcome_id") == outcome_id, f"{name}: outcome_id mismatch")
    checked = timestamp(receipt.get("checked_at"), f"{name}.checked_at")
    expires = timestamp(receipt.get("valid_until"), f"{name}.valid_until")
    require(checked <= now < expires, f"{name}: future or expired evidence")
    require((now - checked).total_seconds() <= max_age, f"{name}: stale evidence")
    return receipt


def check(outcome, root, now, max_age):
    require(type(outcome.get("schema_version")) is int and outcome["schema_version"] == 1,
            "schema_version must be 1")
    outcome_id = nonempty(outcome.get("id"), "id")
    nonempty(outcome.get("objective"), "objective")
    status = outcome.get("status")
    require(status in ("active", "complete", "paused", "blocked"), "unknown outcome status")
    # An explicit user pause takes precedence over repairing old completion
    # records. Never turn a broken historical evidence file into more work
    # after the user has stopped this outcome.
    if status == "paused":
        request = read_json(evidence_bytes(outcome.get("pause_request"), root, "pause_request"),
                            "pause_request")
        require(request.get("kind") == "user_pause_request", "pause requires an explicit user request")
        require(request.get("requested_by") == "user", "pause must be requested by the user")
        require(request.get("outcome_id") == outcome_id, "pause_request: outcome_id mismatch")
        nonempty(request.get("request_ref"), "pause_request.request_ref")
        return "yield_paused", ["Recorded explicit user pause applies to this outcome."], 0

    criteria = outcome.get("acceptance")
    require(isinstance(criteria, list) and bool(criteria), "acceptance must be a nonempty list")
    seen = set()
    pending = []
    for criterion in criteria:
        require(isinstance(criterion, dict), "each acceptance item must be an object")
        criterion_id = nonempty(criterion.get("id"), "acceptance.id")
        require(criterion_id not in seen, "acceptance IDs must be unique")
        seen.add(criterion_id)
        require(criterion.get("status") in ("pending", "met"), "unknown acceptance status")
        if criterion["status"] == "met":
            acceptance_evidence(criterion.get("evidence"), root, outcome_id, criterion_id)
        else:
            pending.append(criterion_id)

    if status == "complete":
        require(not pending, "overall completion requires every acceptance criterion met")
        return "complete", ["All recorded acceptance criteria have hash-verified evidence."], 0

    if status == "blocked":
        blocker = outcome.get("blocker")
        require(isinstance(blocker, dict), "blocked needs a concrete external blocker")
        if blocker.get("independent_work_remaining") is True:
            return "continue_work", ["Independent work remains available despite the external blocker."], 2
        require(blocker.get("independent_work_remaining") is False,
                "blocked yield requires explicit blocker.independent_work_remaining=false")
        require(blocker.get("kind") in ("user_input", "credentials", "payment", "authority",
                                        "unavailable_external_state"), "unsupported blocker kind")
        for field in ("reason", "external_dependency", "resume_trigger"):
            nonempty(blocker.get(field), f"blocker.{field}")
        evidence_list(blocker.get("evidence"), root, "blocker.evidence")
        return "yield_blocked", ["Recorded external blocker: " + blocker["reason"],
                                  "Resume when: " + blocker["resume_trigger"]], 0

    action = outcome.get("next_action")
    require(isinstance(action, dict), "active outcome requires next_action")
    nonempty(action.get("description"), "next_action.description")
    require(action.get("trigger") in ("ready", "run_terminal"), "unknown next_action trigger")
    execution = outcome.get("execution")
    require(isinstance(execution, dict), "active outcome requires execution")
    require(execution.get("mode") in ("active", "waiting"), "unknown execution mode")
    if execution["mode"] == "active" or action["trigger"] == "ready":
        return "continue_work", ["Overall outcome remains active; stage/report completion is insufficient.",
                                 "Next action: " + action["description"]], 2

    if execution.get("independent_work_remaining") is True:
        return "continue_work", ["Independent work remains available while the run executes."], 2
    require(execution.get("independent_work_remaining") is False,
            "waiting requires an explicit independent_work_remaining=false")
    for field in ("run_id", "owner_session", "supervisor_session", "monitor_id"):
        nonempty(execution.get(field), f"execution.{field}")
    require(type(execution.get("attempt")) is int and execution["attempt"] > 0,
            "execution.attempt must be a positive integer")
    require(execution["owner_session"] != execution["supervisor_session"],
            "waiting requires a distinct supervisor session")
    required = {
        "supervisor_ack": ("supervisor_ack", "acknowledged"),
        "monitor_registration": ("monitor_registration", "active"),
        "return_wake_receipt": ("return_wake", "verified"),
    }
    for name, (kind, expected_status) in required.items():
        receipt = waiting_receipt(execution.get(name), root, name, execution, outcome_id, now, max_age)
        require(receipt.get("kind") == kind, f"{name}: incorrect receipt kind")
        require(receipt.get("status") == expected_status, f"{name}: insufficient receipt status")
        if name == "return_wake_receipt":
            nonempty(receipt.get("verification_ref"), f"{name}.verification_ref")
    return "yield_waiting", ["Exact-run monitoring, supervisor ACK and return route records verified.",
                             "Overall outcome remains active; continue on run terminal evidence."], 0


def main(argv=None):
    parser = JsonArgumentParser(description=__doc__, epilog=SCHEMA_HELP, allow_abbrev=False,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("state_path", nargs="?", type=Path,
                        help="Existing project state or outcome JSON (also accepts --state)")
    parser.add_argument("--state", type=Path, help="Existing project state or outcome JSON")
    parser.add_argument("--max-receipt-age-seconds", type=int, default=3600,
                        help="Freshness ceiling for waiting evidence (default: 3600)")
    parser.add_argument("--now", help="Explicit ISO 8601 check time for deterministic offline tests")
    result = {"schema_version": 1, "limitation": LIMITATION}
    try:
        args = parser.parse_args(argv)
        require(bool(args.state) != bool(args.state_path), "provide exactly one state path")
        state_path = args.state or args.state_path
        require(args.max_receipt_age_seconds > 0, "max receipt age must be positive")
        now = timestamp(args.now, "now") if args.now else datetime.now(timezone.utc)
        result["checked_at"] = now.isoformat()
        document = read_json(state_path.read_bytes(), "state")
        outcome = document.get("overall_outcome", document)
        require(isinstance(outcome, dict), "overall_outcome must be an object")
        result["outcome_id"] = outcome.get("id")
        disposition, reasons, code = check(outcome, state_path.resolve().parent, now,
                                          args.max_receipt_age_seconds)
        result.update(disposition=disposition, reasons=reasons)
    except (Invalid, OSError) as exc:
        result.update(disposition="invalid", reasons=[str(exc)])
        code = 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
