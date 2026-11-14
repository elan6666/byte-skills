#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["PyYAML>=6,<7"]
# ///
"""Local Byte workflow templates and revision-checked, evidence-backed transitions.

No model calls, shell execution, network, scheduler writes or automatic retries.
Receipts are checked for identity and source hashes, not authenticated authorship
or scientific correctness. Use native tools to establish real monitoring.
"""

import argparse
import copy
import hashlib
import json
import math
import os
import re
import shlex
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from continuation_check import Invalid, acceptance_evidence, check, evidence_bytes, nonempty, require, timestamp
from continuation_route import route


ENGINE = "byte-workflow/v1"
IDENTIFIER = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")


def now():
    return datetime.now(timezone.utc).isoformat()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    data = Path(path).read_text(encoding="utf-8")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate JSON key: " + key)
            result[key] = value
        return result
    try:
        return json.loads(data, object_pairs_hook=unique,
                          parse_constant=lambda value: (_ for _ in ()).throw(Invalid("nonfinite JSON")))
    except json.JSONDecodeError:
        try:
            import yaml
        except ImportError as exc:
            raise Invalid("YAML requires PyYAML; run this script with uv run, or supply JSON") from exc
        class UniqueLoader(yaml.SafeLoader):
            pass
        def mapping(loader, node):
            result = {}
            for key_node, value_node in node.value:
                key = loader.construct_object(key_node)
                require(isinstance(key, str) and key not in result, "YAML keys must be unique strings")
                result[key] = loader.construct_object(value_node)
            return result
        UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
        try:
            return yaml.load(data, Loader=UniqueLoader)
        except yaml.YAMLError as exc:
            raise Invalid("invalid YAML: " + str(exc)) from exc


def atomic(path, value):
    atomic_bytes(path, encoded(value))


def atomic_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def locked(path):
    lock = path.with_name(path.name + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise Invalid("state is locked; inspect the owning process before recovering a stale lock") from exc
    try:
        os.write(descriptor, str(os.getpid()).encode())
        os.close(descriptor)
        yield
    finally:
        lock.unlink(missing_ok=True)


def identifier(value, label):
    require(isinstance(value, str) and IDENTIFIER.fullmatch(value), label + " must be a stable lowercase identifier")


def condition_valid(expression, depth=0):
    require(depth < 32, "condition nesting exceeds 32 levels")
    require(isinstance(expression, dict), "condition must be an object")
    if set(expression) in ({"all"}, {"any"}):
        items = next(iter(expression.values()))
        require(isinstance(items, list) and bool(items), "all/any requires a nonempty list")
        for item in items:
            condition_valid(item, depth + 1)
    elif set(expression) == {"overall_accepted"}:
        require(type(expression["overall_accepted"]) is bool, "overall_accepted must be boolean")
    else:
        require(set(expression) == {"fact", "op", "value"}, "condition needs fact/op/value, all, any or overall_accepted")
        nonempty(expression["fact"], "condition.fact")
        require(expression["op"] in ("eq", "ne", "gt", "ge", "lt", "le"), "unsupported condition operator")
        value = expression["value"]
        require(type(value) in (bool, str, int, float) and (type(value) is not float or math.isfinite(value)),
                "condition value must be a finite scalar")
        if expression["op"] not in ("eq", "ne"):
            require(type(value) in (int, float), "ordered comparison needs a numeric threshold")


def evaluate(expression, facts, accepted):
    if "all" in expression:
        return all(evaluate(item, facts, accepted) for item in expression["all"])
    if "any" in expression:
        return any(evaluate(item, facts, accepted) for item in expression["any"])
    if "overall_accepted" in expression:
        return accepted is expression["overall_accepted"]
    key, op, expected = expression["fact"], expression["op"], expression["value"]
    if key not in facts:
        return False
    value = facts[key]
    numeric = type(value) in (int, float) and type(expected) in (int, float)
    if not numeric and type(value) is not type(expected):
        return False
    if numeric and not (math.isfinite(value) and math.isfinite(expected)):
        return False
    if op == "eq":
        return value == expected
    if op == "ne":
        return value != expected
    if not numeric:
        return False
    return {"gt": lambda: value > expected, "ge": lambda: value >= expected,
            "lt": lambda: value < expected, "le": lambda: value <= expected}[op]()


def validate_team(team, steps):
    require(isinstance(team, dict) and set(team) <= {"roles", "monitor"}, "unsupported team field")
    roles = team.get("roles")
    require(isinstance(roles, dict) and {"main", "supervisor"} <= set(roles), "team needs main and supervisor roles")
    for name, role in roles.items():
        identifier(name, "team role")
        require(isinstance(role, dict) and set(role) <= {"title", "harness", "model", "reasoning", "creation", "responsibilities", "steps", "handoff"},
                "unsupported team role field")
        for field in ("title", "harness", "responsibilities", "handoff"):
            nonempty(role.get(field), "team role " + name + "." + field)
        session(role["harness"] + ":role-validation")
        require(role.get("creation") in ("reuse-only", "reuse-or-create"), "unsupported team role creation policy")
        if "model" in role:
            nonempty(role["model"], "team role model")
        if "reasoning" in role:
            require(role["reasoning"] in ("none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"),
                    "unsupported team role reasoning level")
        assignments = role.get("steps", [])
        require(isinstance(assignments, list) and all(isinstance(step, str) and step in steps for step in assignments),
                "team role steps must name existing workflow steps")
        require(len(assignments) == len(set(assignments)), "duplicate team role step")
    if "monitor" in team:
        monitor = team["monitor"]
        require(isinstance(monitor, dict) and set(monitor) == {"kind", "interval_minutes"}, "invalid team monitor")
        require(monitor["kind"] == "heartbeat" and type(monitor["interval_minutes"]) is int and monitor["interval_minutes"] > 0,
                "team monitor requires a heartbeat with a positive minute interval")


def validate(template):
    require(isinstance(template, dict) and type(template.get("schema_version")) is int
            and template["schema_version"] == 1, "template schema_version must be 1")
    require(set(template) <= {"schema_version", "id", "version", "description", "start", "parameters", "acceptance", "steps", "team"}, "unsupported template field; do not silently ignore configuration")
    identifier(template.get("id"), "template.id")
    require(type(template.get("version")) is int and template["version"] > 0, "template.version must be positive")
    steps = template.get("steps")
    require(isinstance(steps, dict) and bool(steps), "steps must be a nonempty mapping")
    require(template.get("start") in steps, "start must identify a step")
    criteria = template.get("acceptance")
    require(isinstance(criteria, list) and bool(criteria), "overall acceptance must be a nonempty list")
    seen = set()
    for criterion in criteria:
        require(isinstance(criterion, dict), "criterion must be an object")
        require(set(criterion) <= {"id", "description", "scope", "checks"}, "unsupported criterion field")
        identifier(criterion.get("id"), "criterion.id")
        require(criterion["id"] not in seen, "duplicate criterion id")
        seen.add(criterion["id"])
        nonempty(criterion.get("description"), "criterion.description")
        require(criterion.get("scope", "iteration") in ("iteration", "workflow"), "invalid criterion scope")
        if "checks" in criterion:
            condition_valid(criterion["checks"])
    for name, step in steps.items():
        identifier(name, "step.id")
        require(name != "done", "done is reserved for overall completion")
        require(isinstance(step, dict) and step.get("owner") in ("main", "supervisor"), "step owner must be main or supervisor")
        require(set(step) <= {"owner", "action", "acceptance", "transitions", "wait_owner", "delegations"}, "unsupported step field")
        nonempty(step.get("action"), "step.action")
        require(step.get("wait_owner") in (None, "supervisor"), "v1 wait_owner is supervisor")
        require(not step.get("wait_owner") or step["owner"] == "main", "long jobs must be launched by main")
        condition_valid(step.get("acceptance"))
        transitions = step.get("transitions")
        require(isinstance(transitions, list) and bool(transitions), "each step needs transitions")
        require(all(isinstance(item, dict) for item in transitions), "transitions must be objects")
        require("when" not in transitions[-1], "last transition must be an explicit fallback")
        for index, transition in enumerate(transitions):
            require(set(transition) <= {"when", "to", "new_iteration"}, "unknown transition field")
            require(transition.get("to") in steps or transition.get("to") == "done", "unknown transition destination")
            require(transition.get("to") != "done" or step["owner"] == "main", "overall completion is main-owned")
            require(type(transition.get("new_iteration", False)) is bool, "new_iteration must be boolean")
            require(not transition.get("new_iteration") or transition["to"] != "done", "done cannot start an iteration")
            require(index == len(transitions) - 1 or "when" in transition, "fallback must be last")
            if "when" in transition:
                condition_valid(transition["when"])
    reachable = set()
    pending = [template["start"]]
    while pending:
        name = pending.pop()
        if name in reachable or name == "done":
            continue
        reachable.add(name)
        pending.extend(t["to"] for t in steps[name]["transitions"])
    require(reachable == set(steps), "workflow has unreachable steps")
    require(any(t["to"] == "done" for s in steps.values() for t in s["transitions"]), "workflow needs a done route")
    parameters = template.get("parameters", {})
    require(isinstance(parameters, dict), "parameters must be a mapping")
    for key, value in parameters.items():
        identifier(key, "parameter name")
        require(type(value) in (str, bool, int, float) and (type(value) is not float or math.isfinite(value)),
                "parameters must be finite scalars")
    for step in steps.values():
        for name in re.findall(r"\$\{([^}]+)\}", step["action"]):
            require(name in parameters, "undefined action parameter: " + name)
    if "team" in template:
        validate_team(template["team"], steps)
    roles = template.get("team", {}).get("roles", {})
    for step in steps.values():
        if "delegations" not in step:
            continue
        tasks = step["delegations"]
        require(isinstance(tasks, dict) and tasks, "delegations must be a nonempty mapping")
        for name, task in tasks.items():
            identifier(name, "delegation ID")
            require(isinstance(task, dict) and set(task) == {"role", "deliverable"}, "delegation needs a role and deliverable")
            role = nonempty(task["role"], "delegation role")
            require(role in roles and role != step["owner"], "delegation needs a distinct team role")
            nonempty(task["deliverable"], "delegation deliverable")
    return template


def session(value):
    harness, separator, native = value.partition(":")
    require(separator and harness in ("codex", "claude", "dsh", "zcode", "pi", "hermes", "kimi", "opencode") and native,
            "session must use a supported harness and exact native-id")
    return value


def template_path(template, home):
    path = Path(template).expanduser()
    return path if path.is_file() else Path(home).expanduser() / template / "workflow.yaml"


def team_plan(template, bindings=None, model_preferences=None):
    team = template.get("team", {})
    bindings = bindings or {}
    model_preferences = model_preferences or {}
    roles = {}
    for name, role in team.get("roles", {}).items():
        entry = dict(role, session=bindings.get(name))
        if model_preferences.get(name):
            entry["model"] = model_preferences[name]
        entry["onboarding_prompt"] = (
            f"You are {role['title']} (Byte workflow role {name}). "
            f"Your responsibilities: {role['responsibilities']}\n\n"
            f"Handoff requirements: {role['handoff']}\n\n"
            "Read the current project's instructions and its pinned Byte workflow once available. "
            "Confirm your native session identity and role, then wait for an authorized assignment. "
            "Use the project's existing coordination and evidence rules. The template alone grants no execution authority."
        )
        roles[name] = entry
    return {"template_id": template["id"], "version": template["version"], "roles": roles,
            "monitor_preference": team.get("monitor"),
            "delegations": {step_id: step["delegations"] for step_id, step in template["steps"].items()
                            if "delegations" in step}}


def team_bindings(template, args, main, supervisor):
    roles = template.get("team", {}).get("roles", {})
    bindings = {"main": main, "supervisor": supervisor}
    for binding in args.role_session:
        name, separator, value = binding.partition("=")
        require(separator and name in roles and name not in bindings, "unknown or duplicate team role binding: " + name)
        bindings[name] = session(value)
    require(len(set(bindings.values())) == len(bindings), "team roles must bind to distinct sessions")
    for name, value in bindings.items():
        if name in roles:
            require(value.split(":", 1)[0] == roles[name]["harness"], "team role harness mismatch: " + name)
    return bindings


def paths(project):
    root = Path(project).expanduser().resolve()
    return root, root / ".byte-os/workflow.yaml", root / ".byte-os/coordination/state.json"


def retired_sources(workflow, root):
    """Verify hash-pinned retirement audits; never exempt a receipt's own bytes."""
    entries = workflow.get("historical_source_invalidations", [])
    require(isinstance(entries, list), "invalid historical source ledger")
    allowed, audits = set(), {}
    for entry in entries:
        require(isinstance(entry, dict) and set(entry) == {"receipt", "source", "audit", "status"}
                and entry["status"] == "invalid_retired", "invalid historical source marker")
        audit_key = digest(encoded(entry["audit"]))
        if audit_key not in audits:
            audit = json.loads(evidence_bytes(entry["audit"], root, "source retirement audit"))
            require(audit.get("kind") == "expired_monitor_source_retirement"
                    and audit.get("status") == "invalid_retired"
                    and audit.get("project") == str(root)
                    and audit.get("instance_sha256") == workflow["instance_sha256"],
                    "source retirement audit identity mismatch")
            before = json.loads(evidence_bytes(audit["previous_state"], root, "repair previous state"))
            old = before["overall_outcome"]
            proof = json.loads(evidence_bytes(audit["repair_evidence"], root, "repair evidence"))
            require(proof.get("kind") == "workflow_evidence_repair" and proof.get("status") == "verified"
                    and proof.get("outcome_id") == old["id"]
                    and proof.get("owner_session") == before["owner_session"]
                    and proof.get("state_sha256") == audit["previous_state"]["sha256"]
                    and proof.get("revision") == old["workflow"]["revision"]
                    and proof.get("authority_ref") == audit["authority_ref"]
                    and proof.get("targets") == audit["targets"]
                    and proof.get("observed_automation_sha256") == audit["snapshot"]["sha256"],
                    "source retirement audit differs from owner evidence")
            for source in proof.get("sources", []):
                evidence_bytes(source, Path(audit["repair_evidence"]["path"]).parent, "repair evidence source")
            require(isinstance(proof.get("sources"), list) and bool(proof["sources"]),
                    "repair evidence needs immutable sources")
            evidence_bytes(audit["snapshot"], root, "repair current automation snapshot")
            evidence_bytes(audit["terminal_receipt"], root, "repair terminal receipt")
            evidence_bytes(audit["handoff"], root, "repair return handoff")
            require(old["workflow"].get("return_pending") is True
                    and old["execution"]["mode"] == "active"
                    and old["workflow"]["returned_run"]["receipt"] == audit["terminal_receipt"]
                    and old["workflow"]["returned_run"]["run_id"] == audit["run_id"]
                    and old["workflow"]["returned_run"]["attempt"] == audit["attempt"],
                    "retirement requires an already returned run")
            audits[audit_key] = audit
        audit = audits[audit_key]
        target = {"receipt": entry["receipt"], "source": entry["source"]}
        require(target in audit["targets"] and entry["receipt"] in workflow["evidence"],
                "retirement marker is not in its immutable audit/history")
        saved = json.loads(evidence_bytes(entry["receipt"], root, "retired receipt"))
        # Each audit carries its own historical run; later iterations cannot revive it.
        require(saved.get("kind") in ("monitor_registration", "return_wake")
                and saved.get("status") == {"monitor_registration": "active", "return_wake": "verified"}[saved["kind"]]
                and saved.get("outcome_id") == audit["outcome_id"]
                and saved.get("run_id") == audit["run_id"]
                and type(saved.get("attempt")) is int and saved["attempt"] == audit["attempt"]
                and entry["source"] in saved.get("sources", [])
                and str(source_path(entry["source"], Path(entry["receipt"]["path"]).parent)) == audit["automation_path"]
                and entry["source"]["sha256"] != audit["snapshot"]["sha256"]
                and timestamp(saved.get("valid_until"), "retired receipt.valid_until")
                < timestamp(audit["checked_at"], "repair checked_at"),
                "retirement can only cover exact expired monitor sources")
        key = digest(encoded(target))
        require(key not in allowed, "duplicate retired source")
        allowed.add(key)
    for key, audit in audits.items():
        declared = [dict(receipt=e["receipt"], source=e["source"]) for e in entries
                    if digest(encoded(e["audit"])) == key]
        require(declared == audit["targets"], "retirement audit target set differs from ledger")
    return allowed


def source_path(source, root):
    path = Path(source["path"])
    return (path if path.is_absolute() else root / path).resolve()


def immutable_state_replacement(target, root):
    """A location change never changes the expected bytes or the original ref."""
    source, replacement = target["source"], target["replacement"]
    require(set(source) == set(replacement) == {"path", "sha256"}
            and source_path(source, Path(target["receipt"]["path"]).parent)
            == root / ".byte-os/coordination/state.json"
            and replacement["sha256"] == source["sha256"],
            "rebind requires the exact state source and identical SHA256")
    path = Path(replacement["path"])
    require(path.is_absolute() and not path.is_symlink() and path.is_file()
            and path.resolve().is_relative_to(root / ".byte-os/coordination/receipts"),
            "replacement must be an immutable receipt snapshot")
    return evidence_bytes(replacement, root, "immutable state replacement")


def terminal_source_tree(terminal_ref, root, outcome_id, run_id, attempt, bindings=None, collect=False):
    """Walk nested source receipts, retaining each exact parent/source edge."""
    bindings = bindings or {}
    targets, seen = [], set()
    def walk(ref, base):
        parent = dict(path=str(source_path(ref, base)), sha256=ref["sha256"])
        key = digest(encoded(parent))
        if key in seen:
            return
        seen.add(key)
        data = evidence_bytes(ref, base, "terminal receipt tree")
        try:
            saved = json.loads(data)
        except (ValueError, UnicodeError):
            return
        if not isinstance(saved, dict):
            return
        sources = saved.get("sources", [])
        require(isinstance(sources, list), "nested receipt sources must be a list")
        for source in sources:
            edge = dict(receipt=parent, source=source)
            binding = bindings.get(digest(encoded(edge)))
            if binding:
                require(saved.get("kind") == "run_terminal" and saved.get("outcome_id") == outcome_id
                        and saved.get("run_id") == run_id and type(saved.get("attempt")) is int
                        and saved["attempt"] == attempt, "rebound receipt run identity mismatch")
                immutable_state_replacement(binding, root)
                if not collect:
                    targets.append(edge)
                continue
            try:
                evidence_bytes(source, source_path(ref, base).parent, "terminal nested source")
            except Invalid:
                require(collect and saved.get("kind") == "run_terminal"
                        and saved.get("outcome_id") == outcome_id
                        and saved.get("run_id") == run_id
                        and type(saved.get("attempt")) is int and saved["attempt"] == attempt
                        and source_path(source, source_path(ref, base).parent)
                        == root / ".byte-os/coordination/state.json",
                        "only exact returned-run terminal state sources may be rebound")
                targets.append(edge)
                continue
            walk(source, source_path(ref, base).parent)
    walk(terminal_ref, root)
    return targets


def rebound_sources(workflow, root):
    entries = workflow.get("source_location_rebindings", [])
    require(isinstance(entries, list), "invalid source rebind ledger")
    bindings, audits = {}, {}
    for entry in entries:
        require(isinstance(entry, dict) and set(entry) == {"receipt", "source", "replacement", "audit"},
                "invalid source rebind marker")
        audit_key = digest(encoded(entry["audit"]))
        if audit_key not in audits:
            audit = json.loads(evidence_bytes(entry["audit"], root, "source rebind audit"))
            require(audit.get("kind") == "identical_source_location_rebind"
                    and audit.get("project") == str(root)
                    and audit.get("instance_sha256") == workflow["instance_sha256"],
                    "source rebind audit identity mismatch")
            before = json.loads(evidence_bytes(audit["previous_state"], root, "source rebind previous state"))
            old, oldflow = before["overall_outcome"], before["overall_outcome"]["workflow"]
            proof = json.loads(evidence_bytes(audit["repair_evidence"], root, "source rebind evidence"))
            require(oldflow.get("return_pending") is True and old["execution"]["mode"] == "active"
                    and oldflow["returned_run"] == audit["returned_run"]
                    and old["id"] == audit["outcome_id"]
                    and oldflow["instance_sha256"] == workflow["instance_sha256"]
                    and before["owner_session"] == audit["main_session"]
                    and audit["main_session"] == load(root / ".byte-os/workflow.yaml")["roles"]["main"]
                    and proof.get("step_id") == oldflow["step"]
                    and proof.get("iteration") == oldflow["iteration"] and proof.get("visit") == oldflow["visit"]
                    and proof.get("kind") == "workflow_source_rebind" and proof.get("status") == "verified"
                    and proof.get("outcome_id") == old["id"]
                    and proof.get("owner_session") == before["owner_session"]
                    and proof.get("revision") == oldflow["revision"]
                    and proof.get("state_sha256") == audit["previous_state"]["sha256"]
                    and proof.get("run_id") == audit["returned_run"]["run_id"]
                    and type(proof.get("attempt")) is int and proof["attempt"] == audit["returned_run"]["attempt"]
                    and proof.get("authority_ref") == audit["authority_ref"]
                    and proof.get("targets") == audit["targets"], "source rebind differs from owner evidence")
            require(isinstance(proof.get("sources"), list) and bool(proof["sources"]), "rebind needs immutable sources")
            for source in proof["sources"]:
                require(source_path(source, Path(audit["repair_evidence"]["path"]).parent)
                        != root / ".byte-os/coordination/state.json", "rebind proof cannot reference live state")
                evidence_bytes(source, Path(audit["repair_evidence"]["path"]).parent, "rebind proof source")
            audits[audit_key] = audit
        target = {k: entry[k] for k in ("receipt", "source", "replacement")}
        require(target in audits[audit_key]["targets"], "source rebind marker differs from audit")
        saved = json.loads(evidence_bytes(entry["receipt"], root, "source rebind original receipt"))
        require(entry["source"] in saved.get("sources", []), "original source is absent from receipt")
        immutable_state_replacement(target, root)
        key = digest(encoded(dict(receipt=entry["receipt"], source=entry["source"])))
        require(key not in bindings, "duplicate source rebind")
        bindings[key] = target
    for key, audit in audits.items():
        declared = [{k: e[k] for k in ("receipt", "source", "replacement")} for e in entries
                    if digest(encoded(e["audit"])) == key]
        require(declared == audit["targets"], "source rebind audit targets differ from ledger")
        returned = audit["returned_run"]
        reached = terminal_source_tree(returned["receipt"], root, audit["outcome_id"],
                                       returned["run_id"], returned["attempt"], bindings)
        require(all(dict(receipt=t["receipt"], source=t["source"]) in reached for t in audit["targets"]),
                "rebound receipt is outside returned terminal sources")
    return bindings


def repair_source_locations(args, root, manifest, state, outcome, workflow, state_bytes):
    require(args.session == manifest["roles"]["main"] and outcome["execution"]["mode"] == "active"
            and workflow.get("return_pending") is True, "rebind requires active main with a pending returned run")
    require(digest(state_bytes) == args.expect_state_sha256, "rebind state SHA256 mismatch")
    nonempty(args.authority_ref, "rebind authority reference")
    proof, ref = receipt(args.evidence, "workflow_source_rebind", outcome, workflow)
    returned = workflow["returned_run"]
    require(proof.get("owner_session") == args.session
            and type(proof.get("revision")) is int and proof["revision"] == workflow["revision"]
            and proof.get("state_sha256") == args.expect_state_sha256
            and proof.get("authority_ref") == args.authority_ref
            and proof.get("run_id") == returned["run_id"]
            and type(proof.get("attempt")) is int and proof["attempt"] == returned["attempt"],
            "rebind evidence owner/revision/state/run mismatch")
    terminal = json.loads(evidence_bytes(returned["receipt"], root, "rebind terminal receipt"))
    require(returned["receipt"] in workflow["evidence"] and terminal.get("kind") == "run_terminal"
            and terminal.get("status") == "verified" and terminal.get("outcome_id") == outcome["id"]
            and terminal.get("run_id") == returned["run_id"]
            and type(terminal.get("attempt")) is int and terminal["attempt"] == returned["attempt"]
            and terminal.get("exit_code") == returned["exit_code"], "rebind terminal identity mismatch")
    bindings = rebound_sources(workflow, root)
    failed = terminal_source_tree(returned["receipt"], root, outcome["id"], returned["run_id"], returned["attempt"], bindings, collect=True)
    targets = proof.get("targets")
    require(isinstance(targets, list) and bool(targets)
            and all(isinstance(t, dict) and set(t) == {"receipt", "source", "replacement"} for t in targets)
            and [{k: t[k] for k in ("receipt", "source")} for t in targets] == failed,
            "rebind needs the exact complete ordered failing-source list")
    for target in targets:
        immutable_state_replacement(target, root)
        require(target["replacement"] in proof["sources"], "replacement must be attached to rebind evidence")
    for source in proof["sources"]:
        require(source_path(source, Path(args.evidence).resolve().parent) != paths(args.project)[2],
                "rebind proof cannot reference live state")
    # Validate the entire existing history with only the proposed exact bindings.
    for target in targets:
        bindings[digest(encoded(dict(receipt=target["receipt"], source=target["source"])))] = target
    verify_history(workflow, root, bindings=bindings)
    terminal_source_tree(returned["receipt"], root, outcome["id"], returned["run_id"], returned["attempt"], bindings)
    return dict(proof=ref, targets=targets)


def commit_source_rebind(args, prepared, root, state, workflow, request_hash, state_bytes, manifest):
    directory = root / ".byte-os/coordination/receipts" / ("workflow-source-rebind-" + request_hash)
    require(not directory.exists(), "rebind artifact directory already exists; inspect prior attempt")
    directory.mkdir(parents=True)
    previous, audit_path = directory / "previous-state.json", directory / "AUDIT.json"
    write_immutable(previous, state_bytes)
    audit = dict(kind="identical_source_location_rebind", project=str(root),
                 outcome_id=state["overall_outcome"]["id"], instance_sha256=workflow["instance_sha256"],
                 main_session=manifest["roles"]["main"], checked_at=now(), authority_ref=args.authority_ref,
                 repair_evidence=prepared["proof"], previous_state=reference(previous),
                 returned_run=copy.deepcopy(workflow["returned_run"]), targets=prepared["targets"])
    write_immutable(audit_path, encoded(audit))
    workflow.setdefault("source_location_rebindings", []).extend(dict(**t, audit=reference(audit_path)) for t in prepared["targets"])
    workflow["evidence"].append(reference(audit_path))
    return state


def verify_history(workflow, root, bindings=None):
    retired = retired_sources(workflow, root)
    bindings = rebound_sources(workflow, root) if bindings is None else bindings
    for ref in workflow["evidence"]:
        data = evidence_bytes(ref, root, "workflow.evidence")
        try:
            saved = json.loads(data)
        except (ValueError, UnicodeError):
            continue
        if isinstance(saved, dict):
            for source in saved.get("sources", []):
                key = digest(encoded(dict(receipt=ref, source=source)))
                if key in bindings:
                    immutable_state_replacement(bindings[key], root)
                elif key not in retired:
                    evidence_bytes(source, Path(ref["path"]).parent, "workflow.evidence.sources")


def history_diagnostics(workflow):
    entries = workflow.get("historical_source_invalidations", [])
    return {"historical_sources_valid": not bool(entries),
            "invalidated_historical_sources": entries}


def sync_handoff(state, handoff):
    """Keep old relay readers aligned with the engine's canonical handoff."""
    outcome = state["overall_outcome"]
    for mapping in (state, outcome, outcome["execution"]):
        mapping.update(current_handoff=handoff["path"], current_handoff_sha256=handoff["sha256"])
        if "baton_owner_session" in mapping:
            mapping["baton_owner_session"] = state["owner_session"]


def run_mirrors(state):
    keys = ("run_id", "attempt", "stage_scope", "active_background_job")
    outcome = state["overall_outcome"]
    return {name: {key: copy.deepcopy(mapping[key]) for key in keys if key in mapping}
            for name, mapping in (("root", state), ("outcome", outcome), ("execution", outcome["execution"]))}


def sync_run_mirrors(state, launch, launch_refs, scope=None):
    """Mirror only identity declared by launch evidence; never infer job metadata."""
    outcome = state["overall_outcome"]
    job = dict(run_id=launch["run_id"], attempt=launch["attempt"],
               process=copy.deepcopy(launch["process"]), launch_receipts=copy.deepcopy(launch_refs))
    if scope is not None:
        nonempty(scope, "stage_scope")
        job["stage_scope"] = scope
    for mapping in (state, outcome, outcome["execution"]):
        mapping.update(run_id=launch["run_id"], attempt=launch["attempt"],
                       active_background_job=copy.deepcopy(job))
        mapping.pop("stage_scope", None)
        if scope is not None:
            mapping["stage_scope"] = scope


def handoff_scope(data):
    text = data.decode("utf-8")
    scopes = []
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate JSON handoff key: " + key)
            result[key] = value
        return result
    try:
        value = json.loads(text, object_pairs_hook=unique)
    except json.JSONDecodeError:
        value = None
    if isinstance(value, dict) and "stage_scope" in value:
        nonempty(value["stage_scope"], "handoff stage_scope")
        scopes.append(value["stage_scope"])
    for line in re.findall(r"^[ \t]*stage_scope:[^\n]*", text, re.MULTILINE):
        match = re.fullmatch(r"[ \t]*stage_scope:[ \t]*([a-z][a-z0-9_-]*)[ \t\r]*", line)
        require(match is not None, "malformed explicit handoff stage_scope")
        scopes.append(match[1])
    scopes += re.findall(r"; scope ([a-z][a-z0-9_-]*)\.", text)
    require(bool(scopes) and len(set(scopes)) == 1,
            "current handoff needs one unambiguous explicit stage_scope")
    return scopes[0]


def repair_run_mirrors(args, root, state, outcome, workflow, state_bytes):
    """Prepare a current-owner metadata repair without changing a running job."""
    execution = outcome["execution"]
    require(execution["mode"] == "waiting" and not workflow.get("return_pending"),
            "run mirror repair requires a waiting run")
    require(digest(state_bytes) == args.expect_state_sha256, "repair state SHA256 mismatch")
    proof, ref = receipt(args.evidence, "run_identity_mirror_repair", outcome, workflow)
    run_id, attempt = execution.get("run_id"), execution.get("attempt")
    nonempty(run_id, "execution.run_id")
    require(type(attempt) is int and attempt > 0, "invalid execution attempt")
    require(proof.get("owner_session") == args.session
            and type(proof.get("revision")) is int and proof["revision"] == workflow["revision"]
            and proof.get("state_sha256") == args.expect_state_sha256
            and proof.get("run_id") == run_id
            and type(proof.get("attempt")) is int and proof["attempt"] == attempt,
            "repair evidence owner/revision/state/run mismatch")
    handoff = {"path": execution.get("current_handoff"), "sha256": execution.get("current_handoff_sha256")}
    evidence_bytes(handoff, root, "current run handoff")
    require(handoff in workflow["evidence"] and proof.get("handoff") == handoff,
            "repair must bind the current recorded handoff")
    require(source_path(handoff, root).is_relative_to(root / ".byte-os/coordination/handoffs"),
            "current handoff must be in coordination/handoffs")
    launches = []
    for item in workflow["evidence"]:
        data = evidence_bytes(item, root, "run launch history")
        try:
            saved = json.loads(data)
        except (ValueError, UnicodeError):
            continue
        if isinstance(saved, dict) and saved.get("kind") == "run_launch" and saved.get("run_id") == run_id:
            require(type(saved.get("attempt")) is int, "invalid recorded launch attempt")
            if saved["attempt"] == attempt:
                launch, launch_ref = receipt(source_path(item, root), "run_launch", outcome, workflow)
                require(launch_ref == item, "recorded launch reference mismatch")
                launches.append((launch, item))
    launch_refs = [item for _, item in launches]
    require(bool(launches) and proof.get("launch_receipts") == launch_refs,
            "repair requires the exact recorded current-run launch receipts")
    launch = launches[0][0]
    process = launch.get("process")
    require(isinstance(process, dict) and process.get("host") and process.get("identity"),
            "launch needs durable process/scheduler identity")
    require(encoded(proof.get("process")) == encoded(process)
            and all(encoded(item.get("process")) == encoded(process) for item, _ in launches),
            "repair process differs from recorded launch")
    scope = proof.get("stage_scope")
    nonempty(scope, "repair stage_scope")
    require(scope == handoff_scope(evidence_bytes(handoff, root, "scope handoff")),
            "repair scope differs from explicit current handoff declaration")
    for item, _ in launches:
        require("stage_scope" not in item or item["stage_scope"] == scope,
                "repair scope differs from recorded launch")
    require(all(item in proof["sources"] for item in launch_refs + [handoff]),
            "repair sources must include every launch and current handoff")
    proposed = copy.deepcopy(state)
    sync_run_mirrors(proposed, launch, launch_refs, scope)
    return dict(proof=ref, handoff=handoff, launches=launch_refs,
                before=run_mirrors(state), after=run_mirrors(proposed), proposed=proposed)


def commit_run_mirror_repair(prepared, root, workflow, request_hash, state_bytes):
    directory = root / ".byte-os/coordination/receipts" / ("run-mirror-repair-" + request_hash)
    require(not directory.exists(), "repair artifact directory already exists; inspect prior attempt")
    directory.mkdir(parents=True)
    previous, audit_path = directory / "previous-state.json", directory / "AUDIT.json"
    write_immutable(previous, state_bytes)
    identity = prepared["after"]["execution"]
    audit = dict(kind="run_identity_mirror_repair_audit", status="verified", checked_at=now(),
                 outcome_id=prepared["proposed"]["overall_outcome"]["id"],
                 instance_sha256=workflow["instance_sha256"], revision=workflow["revision"],
                 owner_session=prepared["proposed"]["owner_session"],
                 run_id=identity["run_id"], attempt=identity["attempt"],
                 repair_evidence=prepared["proof"], previous_state=reference(previous),
                 before=prepared["before"], after=prepared["after"],
                 sources=[prepared["proof"], reference(previous), prepared["handoff"]] + prepared["launches"])
    write_immutable(audit_path, encoded(audit))
    target = prepared["proposed"]
    target["overall_outcome"]["workflow"]["evidence"] += [prepared["proof"], reference(audit_path)]
    return target


def repair_expired_monitor_sources(args, root, manifest, state, outcome, workflow, state_bytes):
    """Prepare one exact returned-run repair; ordinary evidence checks stay strict."""
    require(args.session == manifest["roles"]["main"] and outcome["execution"]["mode"] == "active"
            and workflow.get("return_pending") is True, "repair requires active main with a pending returned run")
    require(digest(state_bytes) == args.expect_state_sha256, "repair state SHA256 mismatch")
    nonempty(args.authority_ref, "repair authority reference")
    proof, ref = receipt(args.evidence, "workflow_evidence_repair", outcome, workflow)
    returned = workflow["returned_run"]
    require(proof.get("owner_session") == args.session
            and type(proof.get("revision")) is int and proof["revision"] == workflow["revision"]
            and proof.get("state_sha256") == args.expect_state_sha256
            and proof.get("authority_ref") == args.authority_ref
            and proof.get("run_id") == returned["run_id"]
            and type(proof.get("attempt")) is int and proof["attempt"] == returned["attempt"],
            "repair evidence owner/revision/state/run mismatch")
    terminal = json.loads(evidence_bytes(returned["receipt"], root, "returned run terminal"))
    require(terminal.get("kind") == "run_terminal" and terminal.get("status") == "verified"
            and terminal.get("outcome_id") == outcome["id"]
            and terminal.get("run_id") == returned["run_id"]
            and type(terminal.get("attempt")) is int and terminal["attempt"] == returned["attempt"]
            and type(terminal.get("exit_code")) is int and terminal["exit_code"] == returned["exit_code"],
            "repair terminal identity mismatch")
    for source in terminal.get("sources", []):
        evidence_bytes(source, Path(returned["receipt"]["path"]).parent, "terminal source")
    require(bool(terminal.get("sources")), "terminal needs strict sources")
    handoff = {"path": state["current_handoff"], "sha256": state["current_handoff_sha256"]}
    evidence_bytes(handoff, root, "canonical return handoff")
    require(handoff in workflow["evidence"] and returned["receipt"] in workflow["evidence"],
            "repair terminal and handoff must already belong to workflow history")
    identifier(manifest["monitor"]["id"], "monitor ID")
    automation = (Path.home() / ".codex/automations" / manifest["monitor"]["id"] / "automation.toml").resolve()
    current = automation.read_bytes()
    require(proof.get("observed_automation_sha256") == digest(current), "automation readback SHA256 mismatch")
    # Repair evidence must itself be immutable, not a new reference to mutable state/config.
    for source in proof["sources"]:
        require(source_path(source, Path(args.evidence).resolve().parent) not in
                (automation, paths(args.project)[2]), "repair evidence sources must be immutable snapshots")
    existing = retired_sources(workflow, root)
    targets, stamp = [], datetime.now(timezone.utc)
    for historical in workflow["evidence"]:
        data = evidence_bytes(historical, root, "workflow.evidence")
        try:
            saved = json.loads(data)
        except (ValueError, UnicodeError):
            continue
        if not isinstance(saved, dict):
            continue
        for source in saved.get("sources", []):
            target = dict(receipt=historical, source=source)
            if digest(encoded(target)) in existing:
                continue
            try:
                evidence_bytes(source, Path(historical["path"]).parent, "workflow.evidence.sources")
            except Invalid:
                require(saved.get("kind") in ("monitor_registration", "return_wake")
                        and saved.get("status") == {"monitor_registration": "active", "return_wake": "verified"}[saved["kind"]]
                        and saved.get("outcome_id") == outcome["id"]
                        and saved.get("run_id") == returned["run_id"]
                        and type(saved.get("attempt")) is int and saved["attempt"] == returned["attempt"]
                        and source_path(source, Path(historical["path"]).parent) == automation
                        and set(source) == {"path", "sha256"}
                        and isinstance(source["sha256"], str)
                        and re.fullmatch(r"[0-9a-f]{64}", source["sha256"])
                        and source["sha256"] != digest(current)
                        and timestamp(saved.get("checked_at"), "expired monitor.checked_at")
                        < timestamp(saved.get("valid_until"), "expired monitor.valid_until") < stamp,
                        "only exact expired returned-run monitor sources can be retired")
                targets.append(target)
    require(bool(targets) and proof.get("targets") == targets,
            "repair requires the exact complete ordered failing-source list")
    proposed = copy.deepcopy(state)
    sync_handoff(proposed, handoff)
    return dict(proof=ref, targets=targets, stamp=stamp.isoformat(), automation=automation,
                current=current, handoff=handoff, terminal=returned["receipt"], proposed=proposed)


def write_immutable(path, data):
    with path.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def commit_monitor_repair(args, prepared, root, state, workflow, request_hash, state_bytes):
    directory = root / ".byte-os/coordination/receipts" / ("workflow-source-repair-" + request_hash)
    require(not directory.exists(), "repair artifact directory already exists; inspect prior attempt")
    directory.mkdir(parents=True)
    snapshot, previous, audit_path = (directory / name for name in ("automation-current.toml", "previous-state.json", "AUDIT.json"))
    write_immutable(snapshot, prepared["current"])
    write_immutable(previous, state_bytes)
    returned = workflow["returned_run"]
    audit = dict(kind="expired_monitor_source_retirement", status="invalid_retired",
                 project=str(root), outcome_id=state["overall_outcome"]["id"],
                 instance_sha256=workflow["instance_sha256"], checked_at=prepared["stamp"],
                 authority_ref=args.authority_ref, repair_evidence=prepared["proof"],
                 previous_state=reference(previous), snapshot=reference(snapshot),
                 automation_path=str(prepared["automation"]), run_id=returned["run_id"],
                 attempt=returned["attempt"], terminal_receipt=prepared["terminal"],
                 handoff=prepared["handoff"], targets=prepared["targets"])
    write_immutable(audit_path, encoded(audit))
    target = prepared["proposed"]
    repaired = target["overall_outcome"]["workflow"]
    repaired.setdefault("historical_source_invalidations", []).extend(
        dict(**item, audit=reference(audit_path), status="invalid_retired") for item in prepared["targets"])
    repaired["evidence"].append(reference(audit_path))
    return target


def opened(project, verify_evidence=True):
    root, manifest_path, state_path = paths(project)
    manifest, state = load(manifest_path), load(state_path)
    require(isinstance(manifest, dict) and isinstance(state, dict), "manifest and state must be mappings")
    outcome = state.get("overall_outcome", {})
    workflow = outcome.get("workflow", {})
    require(workflow.get("engine") == ENGINE, "project is not managed by byte-workflow")
    require(workflow.get("instance_sha256") == digest(manifest_path.read_bytes()), "pinned project workflow changed; do not hot-edit a running definition")
    require(manifest.get("outcome_id") == outcome.get("id"), "instance/outcome identity mismatch")
    validate(manifest["definition"])
    if verify_evidence and outcome.get("status") != "paused":
        verify_history(workflow, root)
    return root, manifest, state, outcome, workflow


def action_for(manifest, step):
    action = manifest["definition"]["steps"][step]["action"]
    return re.sub(r"\$\{([^}]+)\}", lambda m: str(manifest["parameters"][m[1]]), action)


def step_delegations(manifest, workflow):
    tasks = manifest["definition"]["steps"][workflow["step"]].get("delegations", {})
    bindings = manifest.get("team_sessions", manifest["roles"])
    return {name: dict(task, session=bindings.get(task["role"])) for name, task in tasks.items()}


def make_ready(manifest, state, step):
    outcome = state["overall_outcome"]
    role = manifest["definition"]["steps"][step]["owner"]
    owner = manifest["roles"][role]
    state.update(owner=owner.split(":", 1)[0], owner_session=owner, stage=step)
    outcome["next_action"] = {"description": action_for(manifest, step), "trigger": "ready"}
    execution = outcome["execution"]
    execution.pop("next_action", None)
    execution.update(mode="active", owner_session=owner, role=role, independent_work_remaining=True)


def reference(path):
    path = Path(path).expanduser().resolve()
    return {"path": str(path), "sha256": digest(path.read_bytes())}


def receipt(path, kind, outcome, workflow, *, current_step=True):
    ref = reference(path)
    value = load(path)
    require(isinstance(value, dict) and value.get("kind") == kind, "wrong receipt kind: expected " + kind)
    require(value.get("outcome_id") == outcome["id"], "receipt outcome mismatch")
    require(value.get("status") == "verified", "receipt must be verified from actual outputs")
    if current_step:
        require(value.get("step_id") == workflow["step"], "receipt step mismatch")
        require(type(value.get("iteration")) is int and value["iteration"] == workflow["iteration"], "receipt iteration mismatch")
        require(type(value.get("visit")) is int and value["visit"] == workflow["visit"], "receipt visit mismatch")
    sources = value.get("sources")
    require(isinstance(sources, list) and bool(sources), "receipt needs source artifacts")
    for source in sources:
        evidence_bytes(source, Path(path).resolve().parent, "receipt.sources")
        if kind == "acceptance_verification":
            require(not any(source_path(source, Path(path).resolve().parent) == Path(e["receipt"]["path"]).resolve()
                            and source["sha256"] == e["receipt"]["sha256"]
                            for e in workflow.get("historical_source_invalidations", [])),
                    "retired monitoring cannot serve as scientific acceptance evidence")
    return value, ref


def delegated_results(manifest, outcome, workflow, step_result, step_receipt_path):
    tasks = step_delegations(manifest, workflow)
    if not tasks:
        return {}
    results = step_result.get("delegated_results")
    require(isinstance(results, dict) and results.keys() == tasks.keys(),
            "advance requires verified returns for every declared delegation")
    refs, task_ids = {}, set()
    for name, task in tasks.items():
        expected_session = nonempty(task["session"], "bound specialist for " + name)
        evidence_bytes(results[name], step_receipt_path.parent, "delegated result receipt")
        path = source_path(results[name], step_receipt_path.parent)
        returned, ref = receipt(path, "delegated_result", outcome, workflow)
        require(returned.get("delegation_id") == name and returned.get("role") == task["role"]
                and returned.get("session") == expected_session,
                "delegated return role, session or task mismatch: " + name)
        task_id = nonempty(returned.get("task_id"), "native delegation task ID")
        require(task_id not in task_ids, "each delegation needs its own native task ID")
        native = returned.get("native_return")
        require(native in returned["sources"] and any(source_path(item, path.parent) != source_path(native, path.parent)
                                                        for item in returned["sources"]),
                "delegated return needs native return evidence and a separate output or failure artifact")
        task_ids.add(task_id)
        refs[name] = ref
    return refs


def overall_accepted(outcome, root):
    if any(item["status"] != "met" for item in outcome["acceptance"]):
        return False
    for item in outcome["acceptance"]:
        acceptance_evidence(item["evidence"], root, outcome["id"], item["id"])
    return True


def clear_iteration_acceptance(outcome):
    for item in outcome["acceptance"]:
        if item.get("scope", "iteration") == "iteration":
            item.update(status="pending")
            item.pop("evidence", None)


def current_facts(workflow, facts):
    require(isinstance(facts, dict), "facts must be a mapping")
    for key, value in facts.items():
        require(isinstance(key, str) and type(value) in (bool, str, int, float)
                and (type(value) is not float or math.isfinite(value)), "facts must contain finite scalars")
    return dict(facts, **{"workflow.iteration": workflow["iteration"], "workflow.runs": len(workflow["used_runs"])})


def active_guidance(workflow):
    return [item for item in workflow.get("user_guidance", {}).values()
            if item["scope"] == "outcome" or item["iteration"] == workflow["iteration"]]


def mutate(args):
    _, _, state_path = paths(args.project)
    with locked(state_path):
        state_bytes = state_path.read_bytes()
        repairing = args.command == "repair-expired-monitor-sources"
        mirror_repair = args.command == "repair-run-mirrors"
        source_rebind = args.command == "repair-source-locations"
        root, manifest, state, outcome, workflow = opened(args.project, verify_evidence=args.command not in ("pause", "repair-expired-monitor-sources", "repair-source-locations"))
        require(args.session in manifest["roles"].values(), "actor is not in this workflow")
        payload = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()
                   if k not in ("expect_revision", "event_id", "project", "check_only")}
        for key in ("evidence", "handoff", "supervisor_ack", "monitor_registration", "return_wake_receipt"):
            if payload.get(key):
                payload[key] = reference(payload[key])
        request_hash = digest(encoded(payload))
        prior = next((e for e in workflow["events"] if e["id"] == args.event_id), None)
        if prior:
            require(prior["request_sha256"] == request_hash, "event ID was already used for a different request")
            return {"idempotent": True, "revision": workflow["revision"], "outcome_id": outcome["id"]}
        require(workflow["revision"] == args.expect_revision, "stale revision; reread status before writing")
        command = args.command
        if command not in ("pause", "resume"):
            require(outcome["status"] == "active", "workflow is not active")
            require(state.get("owner_session") == args.session, "actor does not own the project baton")
        step = manifest["definition"]["steps"][workflow["step"]]
        execution = outcome["execution"]
        event_details = {}
        if repairing:
            prepared = repair_expired_monitor_sources(args, root, manifest, state, outcome, workflow, state_bytes)
            preview = {"check_only": args.check_only, "outcome_id": outcome["id"],
                       "revision": workflow["revision"], "retired_source_count": len(prepared["targets"]),
                       "targets": prepared["targets"], "historical_sources_valid": False,
                       "handoff_mirrors": {"before": {name: {k: mapping.get(k) for k in ("current_handoff", "current_handoff_sha256", "baton_owner_session")}
                                                        for name, mapping in (("root", state), ("outcome", outcome), ("execution", execution))},
                                           "after": prepared["handoff"]}}
            require(state_path.read_bytes() == state_bytes, "state changed during repair inspection")
            require(prepared["automation"].read_bytes() == prepared["current"], "automation changed during repair inspection")
            if args.check_only:
                return dict(preview, changed=False)
            state = commit_monitor_repair(args, prepared, root, state, workflow, request_hash, state_bytes)
            outcome, workflow = state["overall_outcome"], state["overall_outcome"]["workflow"]
        elif source_rebind:
            prepared = repair_source_locations(args, root, manifest, state, outcome, workflow, state_bytes)
            require(state_path.read_bytes() == state_bytes, "state changed during rebind inspection")
            if args.check_only:
                return dict(check_only=True, changed=False, revision=workflow["revision"], targets=prepared["targets"])
            state = commit_source_rebind(args, prepared, root, state, workflow, request_hash, state_bytes, manifest)
        elif mirror_repair:
            prepared = repair_run_mirrors(args, root, state, outcome, workflow, state_bytes)
            require(state_path.read_bytes() == state_bytes, "state changed during repair inspection")
            if args.check_only:
                return dict(check_only=True, changed=False, revision=workflow["revision"],
                            before=prepared["before"], after=prepared["after"])
            state = commit_run_mirror_repair(prepared, root, workflow, request_hash, state_bytes)
            outcome, workflow = state["overall_outcome"], state["overall_outcome"]["workflow"]
        elif command == "record-guidance":
            require(args.session == manifest["roles"]["main"] and execution["mode"] == "active",
                    "only active main can record user guidance")
            summary = nonempty(args.summary, "guidance summary")
            require(len(summary) <= 1600, "guidance summary must fit in 1600 characters")
            guidance = {"event_id": args.event_id, "scope": args.scope, "summary": summary,
                        "request_ref": nonempty(args.request_ref, "explicit user instruction reference"),
                        "iteration": workflow["iteration"]}
            workflow.setdefault("user_guidance", {})[args.scope] = guidance
            event_details["guidance"] = guidance
        elif command == "advance":
            require(execution["mode"] == "active" and args.session == manifest["roles"][step["owner"]], "advance requires the active step owner")
            require(not workflow.get("return_pending"), "main must acknowledge substantive continuation before advancing")
            value, ref = receipt(args.evidence, "step_result", outcome, workflow)
            returns = delegated_results(manifest, outcome, workflow, value, Path(ref["path"]))
            facts = current_facts(workflow, value.get("facts", {}))
            if step.get("wait_owner"):
                require(workflow.get("returned_run"), "experiment step needs a verified run return")
                facts = dict(facts, exit_code=workflow["returned_run"]["exit_code"])
            require(evaluate(step["acceptance"], facts, overall_accepted(outcome, root)), "step acceptance is unmet")
            combined = dict(workflow.get("facts", {}), **facts)
            combined.update({"workflow.iteration": workflow["iteration"], "workflow.runs": len(workflow["used_runs"])})
            accepted = overall_accepted(outcome, root)
            transition = next((item for item in step["transitions"]
                               if "when" not in item or evaluate(item["when"], combined, accepted)), None)
            require(transition is not None, "no matching transition")
            destination = transition["to"]
            workflow["evidence"].append(ref)
            if returns:
                workflow["evidence"].extend(returns.values())
                event_details["delegated_results"] = returns
            event_details["step_receipt"] = ref
            event_details["guidance_event_ids"] = [item["event_id"] for item in active_guidance(workflow)]
            workflow["facts"] = combined
            if destination == "done":
                require(accepted, "done requires verified overall acceptance")
                outcome["status"] = "complete"
                workflow["finished_at"] = now()
                outcome["next_action"] = {"description": "Overall acceptance verified; disable the outcome monitor", "trigger": "ready"}
            else:
                if transition.get("new_iteration"):
                    workflow["iteration"] += 1
                    workflow["facts"] = {}
                    clear_iteration_acceptance(outcome)
                workflow.update(step=destination, visit=workflow["visit"] + 1)
                workflow.pop("returned_run", None)
                make_ready(manifest, state, destination)
        elif command == "accept":
            require(args.session == manifest["roles"]["main"] and execution["mode"] == "active", "only active main verifies overall criteria")
            item = next((c for c in outcome["acceptance"] if c["id"] == args.criterion), None)
            require(item is not None, "unknown criterion")
            value, ref = receipt(args.evidence, "acceptance_verification", outcome, workflow, current_step=False)
            require(value.get("criterion_id") == args.criterion, "criterion receipt mismatch")
            if item.get("scope", "iteration") == "iteration":
                require(type(value.get("iteration")) is int and value["iteration"] == workflow["iteration"], "criterion belongs to another iteration")
            definition = next(c for c in manifest["definition"]["acceptance"] if c["id"] == args.criterion)
            if "checks" in definition:
                require(evaluate(definition["checks"], current_facts(workflow, value.get("facts", {})), False), "criterion thresholds not met")
            acceptance_evidence([ref], root, outcome["id"], args.criterion)
            item.update(status="met", evidence=[ref])
        elif command == "start-run":
            require(args.session == manifest["roles"]["main"] and step.get("wait_owner") == "supervisor", "step is not a main-launched supervisor wait")
            nonempty(manifest["monitor"]["id"], "long waits require a pinned native monitor ID")
            require(execution["mode"] == "active" and not workflow.get("return_pending"), "a run is already waiting or pending acceptance")
            nonempty(args.run_id, "run_id")
            require(args.attempt > 0, "attempt must be positive")
            identity = (args.run_id, args.attempt)
            require(list(identity) not in workflow["used_runs"], "run/attempt already used; never relaunch for notification recovery")
            value, ref = receipt(args.evidence, "run_launch", outcome, workflow)
            require(value.get("run_id") == args.run_id and type(value.get("attempt")) is int and value["attempt"] == args.attempt, "launch identity mismatch")
            require(isinstance(value.get("process"), dict) and value["process"].get("host") and value["process"].get("identity"), "launch needs durable process/scheduler identity")
            handoff = reference(args.handoff)
            require(Path(args.handoff).resolve().is_relative_to(root / ".byte-os/coordination/handoffs"), "handoff must be in project coordination/handoffs")
            if "stage_scope" in value:
                nonempty(value["stage_scope"], "launch stage_scope")
                require(value["stage_scope"] == handoff_scope(evidence_bytes(handoff, root, "launch scope handoff")),
                        "launch scope differs from explicit handoff declaration")
            main_session, supervisor = manifest["roles"]["main"], manifest["roles"]["supervisor"]
            previous_mirrors = run_mirrors(state)
            execution.update(mode="waiting", run_id=args.run_id, attempt=args.attempt,
                             owner_session=main_session, supervisor_session=supervisor,
                             monitor_id=manifest["monitor"]["id"], independent_work_remaining=False,
                             monitor_status="unarmed")
            for name in ("supervisor_ack", "monitor_registration", "return_wake_receipt"):
                execution.pop(name, None)
            outcome["next_action"] = {"description": "Verify current run terminal and return to main", "trigger": "run_terminal"}
            state.update(owner=supervisor.split(":", 1)[0], owner_session=supervisor, stage="supervise")
            sync_handoff(state, handoff)
            sync_run_mirrors(state, value, [ref], value.get("stage_scope"))
            if any(previous_mirrors.values()):
                workflow.setdefault("run_mirror_history", []).append(
                    dict(command="start-run", launch_receipt=ref, previous=previous_mirrors))
            workflow["used_runs"].append(list(identity))
            clear_iteration_acceptance(outcome)
            workflow["evidence"] += [ref, handoff]
            workflow.pop("returned_run", None)
        elif command == "arm-run":
            require(args.session == manifest["roles"]["supervisor"] and execution["mode"] == "waiting",
                    "only the current supervisor can acknowledge and arm its run")
            for name in ("supervisor_ack", "monitor_registration", "return_wake_receipt"):
                execution[name] = reference(getattr(args, name))
                require(not any(e["receipt"] == execution[name] for e in workflow.get("historical_source_invalidations", [])),
                        "retired historical monitoring cannot arm a run")
                if name in ("monitor_registration", "return_wake_receipt"):
                    saved = load(getattr(args, name))
                    live = (Path.home() / ".codex/automations" / manifest["monitor"]["id"] / "automation.toml").resolve()
                    for source in saved.get("sources", []):
                        require(source_path(source, Path(execution[name]["path"]).parent) not in (live, state_path),
                                "monitor sources require immutable snapshots, not live automation/state")
                        evidence_bytes(source, Path(execution[name]["path"]).parent, "monitor snapshot source")
            disposition, _, _ = check(outcome, root, datetime.now(timezone.utc), 3600)
            require(disposition == "yield_waiting", "run monitoring/return route is not armed")
            execution["monitor_status"] = "recorded_active"
            workflow["evidence"] += [execution[name] for name in ("supervisor_ack", "monitor_registration", "return_wake_receipt")]
        elif command == "record-readiness":
            require(args.session == manifest["roles"]["supervisor"] and execution["mode"] == "waiting",
                    "the waiting owner records verified independent main-work completion")
            value, ref = receipt(args.evidence, "main_readiness", outcome, workflow)
            require(value.get("main_session") == manifest["roles"]["main"]
                    and value.get("independent_work_remaining") is False, "requires actual main readiness, not a convenient flag change")
            require(value.get("run_id") == execution["run_id"] and type(value.get("attempt")) is int
                    and value["attempt"] == execution["attempt"], "readiness run identity mismatch")
            execution["independent_work_remaining"] = False
            workflow["evidence"].append(ref)
        elif command == "return-run":
            require(args.session == manifest["roles"]["supervisor"] and execution["mode"] == "waiting", "only the waiting supervisor returns a run")
            value, ref = receipt(args.evidence, "run_terminal", outcome, workflow)
            require(value.get("run_id") == execution["run_id"] and type(value.get("attempt")) is int
                    and value["attempt"] == execution["attempt"], "terminal run/attempt mismatch")
            require(type(value.get("exit_code")) is int, "terminal needs an actual exit code")
            handoff = reference(args.handoff)
            require(Path(args.handoff).resolve().is_relative_to(root / ".byte-os/coordination/handoffs"), "return handoff must be in coordination/handoffs")
            workflow["returned_run"] = {"run_id": execution["run_id"], "attempt": execution["attempt"], "exit_code": value["exit_code"], "receipt": ref}
            workflow["return_pending"] = True
            workflow["evidence"] += [ref, handoff]
            make_ready(manifest, state, workflow["step"])
            sync_handoff(state, handoff)
            execution["main_continuation"] = "pending"
        elif command == "ack-return":
            require(args.session == manifest["roles"]["main"] and workflow.get("return_pending"), "no pending main return")
            value, ref = receipt(args.evidence, "main_continuation", outcome, workflow)
            returned = workflow["returned_run"]
            require(value.get("run_id") == returned["run_id"] and type(value.get("attempt")) is int
                    and value["attempt"] == returned["attempt"], "continuation run identity mismatch")
            native = value.get("executed_action", {})
            require(isinstance(native, dict) and native.get("command") and native.get("result_ref"), "a message ACK is not an executed main action")
            require(type(native.get("exit_code")) is int, "main action needs an observed exit code")
            require(native["result_ref"] in value["sources"], "executed action must be a source attachment")
            actual = json.loads(evidence_bytes(native["result_ref"], Path(args.evidence).resolve().parent, "executed action"))
            require(isinstance(actual, dict) and actual.get("kind") == "command_result"
                    and actual.get("status") == "completed" and actual.get("session") == args.session
                    and actual.get("command") == native["command"] and actual.get("exit_code") == native["exit_code"],
                    "executed action does not match its command result")
            workflow["return_pending"] = False
            workflow["evidence"].append(ref)
            execution["main_continuation"] = "verified"
        elif command == "record-run":
            require(args.session == manifest["roles"]["main"] and step.get("wait_owner") == "supervisor"
                    and execution["mode"] == "active", "short run result requires main-owned experiment step")
            require(not workflow.get("return_pending"), "acknowledge the prior handback first")
            value, ref = receipt(args.evidence, "run_terminal", outcome, workflow)
            require(value.get("wait_mode") == "same_task" and value.get("owner_session") == args.session,
                    "record-run is for a bounded same-task wait; long jobs need start-run/return-run")
            nonempty(value.get("run_id"), "run_id")
            require(type(value.get("attempt")) is int and value["attempt"] > 0, "attempt must be positive")
            require(type(value.get("exit_code")) is int, "terminal needs an actual exit code")
            identity = [value["run_id"], value["attempt"]]
            require(identity not in workflow["used_runs"], "run/attempt already consumed")
            workflow["used_runs"].append(identity)
            clear_iteration_acceptance(outcome)
            workflow["returned_run"] = {"run_id": value["run_id"], "attempt": value["attempt"], "exit_code": value["exit_code"], "receipt": ref}
            workflow["evidence"].append(ref)
        elif command == "pause":
            require(outcome["status"] == "active", "only an active workflow can pause")
            nonempty(args.request_ref, "explicit user pause reference")
            pause = {"kind": "user_pause_request", "requested_by": "user", "outcome_id": outcome["id"], "request_ref": args.request_ref}
            target = root / ".byte-os/coordination/receipts" / ("pause-" + uuid.uuid4().hex + ".json")
            atomic(target, pause)
            outcome.update(status="paused", pause_request=reference(target))
        elif command == "block":
            value, ref = receipt(args.evidence, "external_block", outcome, workflow)
            require(value.get("independent_work_remaining") is False, "continue independent work before declaring an external block")
            require(value.get("blocker_kind") in ("user_input", "credentials", "payment", "authority", "unavailable_external_state"), "unsupported external blocker")
            for key in ("reason", "external_dependency", "resume_trigger"):
                nonempty(value.get(key), key)
            outcome.update(status="blocked", blocker={
                "kind": value["blocker_kind"], "reason": value["reason"],
                "external_dependency": value["external_dependency"], "resume_trigger": value["resume_trigger"],
                "independent_work_remaining": False, "evidence": [ref]})
            workflow["evidence"].append(ref)
        elif command == "resume":
            require(outcome["status"] in ("paused", "blocked"), "workflow is not paused or blocked")
            nonempty(args.request_ref, "explicit user resume reference")
            verify_history(workflow, root)
            if outcome["status"] == "blocked":
                require(args.evidence is not None, "external blockage needs resolution evidence")
                _, ref = receipt(args.evidence, "external_resolution", outcome, workflow)
                workflow["evidence"].append(ref)
            outcome["status"] = "active"
            outcome["resume_request_ref"] = args.request_ref
        else:
            raise Invalid("unsupported mutation")
        workflow["revision"] += 1
        workflow["events"].append({"id": args.event_id, "command": command, "actor": args.session,
                                   "request_sha256": request_hash, "revision": workflow["revision"],
                                   "at": now(), **event_details})
        if repairing:
            verify_history(workflow, root)
            require(state_path.read_bytes() == state_bytes, "state changed before repair commit")
            require(prepared["automation"].read_bytes() == prepared["current"], "automation changed before repair commit")
        if source_rebind:
            verify_history(workflow, root)
            require(state_path.read_bytes() == state_bytes, "state changed before rebind commit")
        if mirror_repair:
            verify_history(workflow, root)
            require(state_path.read_bytes() == state_bytes, "state changed before repair commit")
        atomic(state_path, state)
        return {"revision": workflow["revision"], "outcome_id": outcome["id"], "status": outcome["status"],
                "step": workflow["step"], "iteration": workflow["iteration"], "owner_session": state["owner_session"]}


def init(args):
    source = template_path(args.template, args.home)
    template = validate(load(source))
    main_session, supervisor = session(args.main_session), session(args.supervisor_session)
    require(main_session != supervisor, "main and supervisor must be distinct")
    bindings = team_bindings(template, args, main_session, supervisor)
    nonempty(args.authority_ref, "authority reference")
    nonempty(args.objective, "objective")
    require(not args.continuous or args.monitor_id, "continuous mode needs one authorized monitor ID")
    default_interval = template.get("team", {}).get("monitor", {}).get("interval_minutes", 20)
    interval = args.interval_minutes if args.interval_minutes is not None else default_interval
    require(interval > 0, "interval must be positive")
    parameters = copy.deepcopy(template.get("parameters", {}))
    for binding in args.param:
        key, separator, value = binding.partition("=")
        require(separator and key in parameters, "unknown or invalid parameter: " + key)
        parameters[key] = value
    root, snapshot_path, state_path = paths(args.project)
    with locked(state_path):
        require(not snapshot_path.exists(), "project already has a pinned workflow; do not overwrite it")
        state = load(state_path) if state_path.exists() else {}
        require(isinstance(state, dict), "existing project state must be an object")
        require(not state.get("overall_outcome"), "existing outcome requires explicit migration, not init")
        require(state.get("owner_session") in (None, main_session), "another session owns project state")
        outcome_id = template["id"] + "-" + uuid.uuid4().hex[:12]
        snapshot = {"schema_version": 1, "outcome_id": outcome_id, "template_sha256": digest(source.read_bytes()),
                    "definition": template, "parameters": parameters, "roles": {"main": main_session, "supervisor": supervisor},
                    "model_preferences": {"main": args.main_model, "supervisor": args.supervisor_model},
                    "monitor": {"continuous": args.continuous, "id": args.monitor_id, "interval_minutes": interval}}
        if "team" in template:
            snapshot["team_sessions"] = bindings
        acceptance = [dict(c, status="pending") for c in template["acceptance"]]
        state["overall_outcome"] = {
            "schema_version": 1, "id": outcome_id, "objective": args.objective, "authority_ref": args.authority_ref,
            "status": "active", "acceptance": acceptance,
            "execution": {"mode": "active", "supervisor_session": supervisor, "monitor_id": args.monitor_id, "monitor_status": "unverified"},
            "workflow": {"engine": ENGINE, "instance_sha256": digest(encoded(snapshot)), "revision": 0,
                         "step": template["start"], "iteration": 1, "visit": 1, "events": [], "evidence": [], "facts": {}, "used_runs": []},
        }
        make_ready(snapshot, state, template["start"])
        atomic(snapshot_path, snapshot)
        try:
            atomic(state_path, state)
        except OSError:
            # This file was created exclusively by the current locked init.
            snapshot_path.unlink()
            raise
    return {"outcome_id": outcome_id, "project": str(root), "revision": 0,
            "step": template["start"], "monitor_status": "unverified"}


def adopt(args):
    """Explicit owner-run migration of a live legacy outcome, without run submission."""
    source = template_path(args.template, args.home)
    template = validate(load(source))
    main_session, supervisor = session(args.main_session), session(args.supervisor_session)
    require(main_session != supervisor, "main and supervisor must be distinct")
    bindings = team_bindings(template, args, main_session, supervisor)
    nonempty(args.authority_ref, "explicit migration authority reference")
    nonempty(args.event_id, "migration event ID")
    require(args.interval_minutes > 0, "interval must be positive")
    nonempty(args.monitor_id, "existing monitor ID")
    root, snapshot_path, state_path = paths(args.project)
    with locked(state_path):
        require(not snapshot_path.exists(), "pinned workflow already exists; inspect status instead of repeating migration")
        before = state_path.read_bytes()
        require(digest(before) == args.expect_state_sha256, "legacy state changed; reread and obtain a fresh owner checkpoint")
        state = load(state_path)
        outcome = state.get("overall_outcome")
        require(isinstance(outcome, dict) and outcome.get("status") == "active", "adopt requires an existing active outcome")
        require(not outcome.get("workflow"), "outcome already has workflow metadata")
        require(state.get("owner_session") == args.session and args.session in (main_session, supervisor),
                "only the exact current baton owner can adopt")
        execution = outcome.get("execution")
        require(isinstance(execution, dict), "legacy execution must be an object")
        require(args.step in template["steps"], "migration step is not in the template")
        step = template["steps"][args.step]
        waiting = execution.get("mode") == "waiting"
        if waiting:
            require(args.session == supervisor and step.get("wait_owner") == "supervisor", "waiting migration must preserve supervisor-owned run")
            require(execution.get("supervisor_session") == supervisor, "legacy supervisor differs from binding")
            require(execution.get("owner_session") == main_session, "legacy run main differs from binding")
            require(execution.get("monitor_id") == args.monitor_id, "migration must reuse the existing monitor")
        else:
            require(execution.get("mode") == "active", "unsupported legacy execution mode")
            require(args.session == {"main": main_session, "supervisor": supervisor}[step["owner"]], "active migration must preserve step owner")
        previous = {item["id"]: item for item in outcome["acceptance"]}
        proposed = {item["id"]: item for item in template["acceptance"]}
        require(set(previous) == set(proposed), "migration cannot add/drop overall acceptance criteria")
        for key in previous:
            require(previous[key]["description"] == proposed[key]["description"], "migration cannot rewrite acceptance descriptions")
        effective_action = execution.get("next_action", outcome.get("next_action"))
        require(isinstance(effective_action, dict) and effective_action.get("trigger") == ("run_terminal" if waiting else "ready"),
                "legacy next action is inconsistent with its execution mode")
        nonempty(effective_action.get("description"), "legacy next action")
        evidence = load(args.evidence)
        require(isinstance(evidence, dict) and evidence.get("kind") == "workflow_adoption" and evidence.get("status") == "verified", "requires a verified workflow_adoption receipt")
        require(evidence.get("outcome_id") == outcome["id"] and evidence.get("owner_session") == args.session
                and evidence.get("state_sha256") == args.expect_state_sha256, "adoption receipt identity/state mismatch")
        require(evidence.get("coordination_writes_quiescent") is True, "coordinate a safe state-write boundary before adopting")
        sources = evidence.get("sources")
        require(isinstance(sources, list) and bool(sources), "adoption needs immutable source evidence")
        for attachment in sources:
            require(Path(attachment.get("path", "")).resolve() != state_path, "use immutable receipts, not the mutable state as an evidence source")
            evidence_bytes(attachment, Path(args.evidence).resolve().parent, "adoption.sources")
        if waiting:
            require(evidence.get("run_id") == execution.get("run_id") and type(evidence.get("attempt")) is int
                    and evidence["attempt"] == execution.get("attempt"), "adoption run/attempt mismatch")
        parameters = copy.deepcopy(template.get("parameters", {}))
        for binding in args.param:
            key, separator, value = binding.partition("=")
            require(separator and key in parameters, "unknown or invalid parameter: " + key)
            parameters[key] = value
        snapshot = {"schema_version": 1, "outcome_id": outcome["id"], "template_sha256": digest(source.read_bytes()),
                    "definition": template, "parameters": parameters, "roles": {"main": main_session, "supervisor": supervisor},
                    "model_preferences": {"main": None, "supervisor": None},
                    "monitor": {"continuous": args.continuous, "id": args.monitor_id, "interval_minutes": args.interval_minutes}}
        if "team" in template:
            snapshot["team_sessions"] = bindings
        archive = root / ".byte-os/coordination/receipts" / ("pre-workflow-" + uuid.uuid4().hex + ".json")
        archive.parent.mkdir(parents=True, exist_ok=True)
        with archive.open("xb") as stream:
            stream.write(before)
            stream.flush()
            os.fsync(stream.fileno())
        iteration = outcome.get("iteration", 1)
        require(type(iteration) is int and iteration > 0, "legacy iteration must be positive")
        workflow = {"engine": ENGINE, "instance_sha256": digest(encoded(snapshot)), "revision": 0,
                    "step": args.step, "iteration": iteration, "visit": 1, "facts": {},
                    "events": [{"id": args.event_id, "command": "adopt", "actor": args.session,
                                "request_sha256": args.expect_state_sha256, "revision": 0, "at": now()}],
                    "evidence": [reference(archive), reference(args.evidence)],
                    "used_runs": [[execution["run_id"], execution["attempt"]]] if waiting else [],
                    "adoption": {"authority_ref": args.authority_ref, "previous_state": reference(archive),
                                 "preserved_next_action": copy.deepcopy(effective_action), "past_steps_replayed": False}}
        outcome["workflow"] = workflow
        outcome["next_action"] = copy.deepcopy(effective_action)
        execution.pop("next_action", None)
        execution["role"] = step["owner"]
        # Preserve outcome ID, objective, criteria/evidence, run identities,
        # independent-work flag, baton, stage and every unrelated legacy field.
        atomic(snapshot_path, snapshot)
        try:
            require(digest(state_path.read_bytes()) == args.expect_state_sha256, "state changed during migration; no state was committed")
            atomic(state_path, state)
        except (OSError, Invalid):
            snapshot_path.unlink()
            raise
    return {"adopted": True, "outcome_id": outcome["id"], "step": args.step, "revision": 0,
            "owner_session": state["owner_session"], "mode": execution["mode"],
            "previous_state": str(archive), "run_relaunched": False, "past_steps_replayed": False}


def upgrade(args):
    """Pin a new definition at a ready main-owned checkpoint, preserving the outcome."""
    nonempty(args.authority_ref, "explicit upgrade authority reference")
    nonempty(args.event_id, "upgrade event ID")
    source = template_path(args.template, args.home)
    template_bytes = source.read_bytes()
    template = validate(load(source))
    require(source.read_bytes() == template_bytes, "target template changed during read")
    _, manifest_path, state_path = paths(args.project)
    with locked(state_path):
        before, previous_manifest = state_path.read_bytes(), manifest_path.read_bytes()
        root, manifest, state, outcome, workflow = opened(args.project)
        require(digest(before) == args.expect_state_sha256 and workflow["revision"] == args.expect_revision,
                "workflow state changed; reread the owner checkpoint")
        require(outcome["status"] == "active" and state["owner_session"] == args.session == manifest["roles"]["main"],
                "upgrade requires the active main-owned checkpoint")
        execution = outcome["execution"]
        require(execution["mode"] == "active" and outcome["next_action"]["trigger"] == "ready"
                and not workflow.get("return_pending") and not workflow.get("returned_run"),
                "finish the current run or pending handback before upgrading")
        step = workflow["step"]
        require(step in template["steps"] and template["steps"][step]["owner"] == "main",
                "target must preserve the current step and owner")
        require(template["acceptance"] == manifest["definition"]["acceptance"],
                "upgrade must preserve the overall acceptance contract")
        require(template.get("parameters", {}).keys() == manifest["parameters"].keys(),
                "upgrade must preserve project parameter bindings")
        require(template != manifest["definition"], "target definition is already pinned")
        require(not any(event["id"] == args.event_id for event in workflow["events"]), "event ID already used")
        bindings = team_bindings(template, args, manifest["roles"]["main"], manifest["roles"]["supervisor"])
        require(all(bindings.get(role) == session_id for role, session_id in manifest.get("team_sessions", {}).items()),
                "upgrade must preserve existing role bindings")
        required_roles = {task["role"] for spec in template["steps"].values() for task in spec.get("delegations", {}).values()}
        require(required_roles <= bindings.keys(), "bind all delegated roles before upgrading")
        snapshot = dict(manifest, definition=template, template_sha256=digest(template_bytes), team_sessions=bindings)
        if args.interval_minutes is not None:
            require(args.interval_minutes > 0, "monitor interval must be positive")
            snapshot["monitor"] = dict(manifest["monitor"], interval_minutes=args.interval_minutes)
        result = {"outcome_id": outcome["id"], "template_id": template["id"], "revision": workflow["revision"] + 1,
                  "iteration": workflow["iteration"], "step": step, "visit": workflow["visit"], "bindings": bindings,
                  "monitor": snapshot["monitor"], "changed": False}
        if args.check_only:
            return result
        require(state_path.read_bytes() == before and manifest_path.read_bytes() == previous_manifest,
                "project changed during upgrade inspection")
        archive = root / ".byte-os/coordination/receipts" / ("pre-upgrade-" + uuid.uuid4().hex)
        archive.mkdir(parents=True)
        write_immutable(archive / "workflow.yaml", previous_manifest)
        write_immutable(archive / "state.json", before)
        backups = [reference(archive / name) for name in ("workflow.yaml", "state.json")]
        workflow["instance_sha256"] = digest(encoded(snapshot))
        workflow["revision"] = result["revision"]
        workflow["evidence"].extend(backups)
        workflow["events"].append({"id": args.event_id, "command": "upgrade", "actor": args.session,
                                   "revision": workflow["revision"], "at": now(), "authority_ref": args.authority_ref,
                                   "request_sha256": digest(encoded(snapshot)), "previous": backups})
        outcome["next_action"] = dict(outcome["next_action"], description=action_for(snapshot, step))
        atomic(manifest_path, snapshot)
        try:
            require(state_path.read_bytes() == before, "state changed before upgrade commit")
            atomic(state_path, state)
        except (Invalid, OSError):
            atomic_bytes(manifest_path, previous_manifest)
            raise
        return dict(result, changed=True, backups=backups)


def wake_checkpoint(outcome, workflow, state):
    return {
        "outcome_id": outcome["id"],
        "revision": workflow["revision"],
        "step": workflow["step"],
        "iteration": workflow["iteration"],
        "owner_session": state["owner_session"],
    }


def monitor_prompt(root, manifest, state, outcome, workflow, caller, main_status):
    monitor = manifest["monitor"]
    require(monitor["continuous"], "this instance has no continuous monitoring authorization")
    require(outcome["status"] == "active", "do not arm a nonactive workflow")
    main, supervisor = manifest["roles"]["main"], manifest["roles"]["supervisor"]
    script = Path(__file__).resolve()
    command = f"uv run {shlex.quote(str(script))}"
    project = shlex.quote(str(root))
    result = {
        "monitor_id": monitor["id"],
        "interval_minutes": monitor["interval_minutes"],
        "target_session": supervisor,
        "status": "requires_native_registration",
    }
    prompt = (
        f"Continue authorized workflow {outcome['id']} in {root}. "
        f"Read the project's current instructions, {script.parent.parent / 'SKILL.md'}, and workflow status. "
        "Confirm the actual caller identity. "
        f"Run {command} route --project {project} --caller-session '<actual current harness:session-id>'. "
        f"For inspect_main, observe {main} using native chat status, then rerun the same command with "
        "--main-status active or idle and --wake-only. Use unknown for approval, user input or uncertain status. "
        "A handed-off run is checked directly without polling main.\n\n"
        "watch_main: exit quietly while main is working. inspect_main: reconcile the blocker. "
        "resume_main: use the target_session and wake checkpoint from route --wake-only. "
        "Append the checkpoint to this base prompt and apply the target and updated prompt to the same native heartbeat. "
        "Preserve cadence and notification settings, "
        "read back the result, and verify that main actually starts work. If the active heartbeat still targets the supervisor, "
        "resume_main requires retargeting even when revision is unchanged or the preceding lead turn already did work. "
        "The lead must reconcile any pending specialist returns before deciding whether a step is ready to advance. "
        f"continue_main: re-read the current owner, revision and evidence, then restore the supervisor target "
        f"and base prompt from {command} monitor-prompt --project {project}. "
        "Read the lead role instructions and any current step delegations. For an assigned specialist's work, "
        "reconcile the original task and return evidence or dispatch the missing bounded assignment. "
        "The lead frames questions, reviews evidence, and records decisions. Record substantive progress. "
        "An older wake summary is context only.\n\n"
        "supervise_run: check only the handed-off run and attempt once, preferably using machine-readable "
        "status or terminal receipts. End a healthy tick quietly. Return a terminal result, failure, or required "
        "decision once through the existing Byte Bridge task. Main verifies the result and continues the next step. "
        "For a pending return, verify that run and record the executed action with ack-return before advancing. "
        "After a verified long-run handoff, main may yield when no independent work is ready. "
        "continue_supervisor/dispatch_supervisor: handle the configured supervisor-owned step. "
        "stop_monitor: pause the existing heartbeat after verified completion, explicit pause, or a concrete "
        "external blocker with no independent work. Read back native changes.\n\n"
        "Keep the overall objective active across short requests. Answer or finish the short request, then resume "
        "the current authorized action under the same outcome. Apply scope changes and pauses to the work the user "
        "specified. For a durable instruction, update the affected project guidance and record it in the workflow "
        "with record-guidance. Reconcile instructions that were recorded only in project docs. Read active guidance "
        "before each step. Preserve active run and handoff identities. Use revision-checked transitions with actual "
        "evidence. Delivery and acknowledgement alone do not advance a step. Keep the heartbeat quiet when unchanged."
    )
    if caller is not None:
        decision = route(state, root, outcome_id=outcome["id"], main=main,
                         supervisor=supervisor, caller=caller, main_status=main_status)
        result["action"] = decision["action"]
        if decision["action"] == "resume_main":
            return_pending = workflow.get("return_pending", False)
            next_action = (
                "Independently verify the returned run and record substantive continuation with ack-return."
                if return_pending else decision["next_action"]
            )
            if len(next_action) > 1600:
                next_action = next_action[:1600] + "… (read the full action from workflow status)"
            wake = dict(wake_checkpoint(outcome, workflow, state), next_action=next_action)
            if guidance := active_guidance(workflow):
                wake["user_guidance"] = guidance
            if tasks := step_delegations(manifest, workflow):
                wake["delegations"] = tasks
            if return_pending:
                returned = workflow["returned_run"]
                wake["returned_run"] = {key: returned[key] for key in ("run_id", "attempt", "exit_code", "receipt")}
                wake["return_handoff"] = {
                    "path": state["current_handoff"], "sha256": state["current_handoff_sha256"],
                }
            elif workflow["evidence"]:
                wake["latest_workflow_evidence"] = workflow["evidence"][-1]
            result.update(target_session=decision["target_session"], wake=wake)
            prompt += "\n\nCurrent wake summary (check against live workflow state):\n"
            prompt += json.dumps(wake, ensure_ascii=False, sort_keys=True)
    result["prompt"] = prompt
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", default=str(Path.home() / ".byte/workflows"), help="Local reusable template library")
    commands = parser.add_subparsers(dest="command", required=True)
    install = commands.add_parser("install-template")
    install.add_argument("--file", type=Path, help="Omit to install shipped templates without overwriting custom copies")
    commands.add_parser("list-templates")
    planner = commands.add_parser("team-plan", help="Read a reusable team or a project's pinned roster without creating chats")
    plan_source = planner.add_mutually_exclusive_group(required=True)
    plan_source.add_argument("--template")
    plan_source.add_argument("--project")
    validator = commands.add_parser("validate")
    validator.add_argument("--file", required=True, type=Path)
    initializer = commands.add_parser("init")
    initializer.add_argument("--template", required=True)
    initializer.add_argument("--objective", required=True)
    initializer.add_argument("--authority-ref", required=True)
    initializer.add_argument("--main-session", required=True)
    initializer.add_argument("--supervisor-session", required=True)
    initializer.add_argument("--main-model", help="Requested preference, not verified runtime provenance")
    initializer.add_argument("--supervisor-model", help="Requested preference, not verified runtime provenance")
    initializer.add_argument("--monitor-id")
    initializer.add_argument("--continuous", action="store_true")
    initializer.add_argument("--interval-minutes", type=int)
    initializer.add_argument("--role-session", action="append", default=[], metavar="ROLE=HARNESS:ID")
    initializer.add_argument("--param", action="append", default=[])
    adopter = commands.add_parser("adopt", help="Explicit current-owner migration; preserves a live run and existing acceptance")
    adopter.add_argument("--template", required=True)
    adopter.add_argument("--authority-ref", required=True)
    adopter.add_argument("--main-session", required=True)
    adopter.add_argument("--supervisor-session", required=True)
    adopter.add_argument("--session", required=True)
    adopter.add_argument("--expect-state-sha256", required=True)
    adopter.add_argument("--step", required=True)
    adopter.add_argument("--evidence", required=True, type=Path)
    adopter.add_argument("--event-id", required=True)
    adopter.add_argument("--monitor-id", required=True)
    adopter.add_argument("--continuous", action="store_true")
    adopter.add_argument("--interval-minutes", type=int, default=20)
    adopter.add_argument("--param", action="append", default=[])
    adopter.add_argument("--role-session", action="append", default=[], metavar="ROLE=HARNESS:ID")
    upgrader = commands.add_parser("upgrade", help="Migrate a pinned workflow at a coordinated main-owned checkpoint")
    for field in ("template", "session", "authority-ref", "expect-state-sha256", "event-id"):
        upgrader.add_argument("--" + field, required=True)
    upgrader.add_argument("--expect-revision", type=int, required=True)
    upgrader.add_argument("--interval-minutes", type=int)
    upgrader.add_argument("--role-session", action="append", default=[], metavar="ROLE=HARNESS:ID")
    upgrader.add_argument("--check-only", action="store_true")
    for name in ("status", "doctor", "route", "monitor-prompt", "export"):
        commands.add_parser(name)
    commands.choices["route"].add_argument("--caller-session", required=True)
    commands.choices["route"].add_argument("--main-status", choices=("active", "idle", "unknown"), default="unknown")
    commands.choices["route"].add_argument("--wake-only", action="store_true",
                                          help="Omit the action description and include a compact checkpoint on resume_main")
    commands.choices["monitor-prompt"].add_argument("--caller-session", help="Actual caller for a live wake summary")
    commands.choices["monitor-prompt"].add_argument("--main-status", choices=("active", "idle", "unknown"),
                                                    default="unknown", help="Fresh native main chat observation")
    commands.choices["monitor-prompt"].add_argument("--wake-only", action="store_true",
                                                    help="Emit compact routing and checkpoint metadata for a custom heartbeat prompt")
    commands.choices["export"].add_argument("--output", required=True, type=Path)
    for name in ("advance", "record-guidance", "accept", "start-run", "arm-run", "record-readiness", "return-run", "record-run", "ack-return", "block", "pause", "resume", "repair-expired-monitor-sources", "repair-run-mirrors", "repair-source-locations"):
        sub = commands.add_parser(name)
        sub.add_argument("--session", required=True)
        sub.add_argument("--expect-revision", type=int, required=True)
        sub.add_argument("--event-id", required=True)
        if name in ("advance", "accept", "start-run", "record-readiness", "return-run", "record-run", "ack-return", "block", "repair-expired-monitor-sources", "repair-run-mirrors", "repair-source-locations"):
            sub.add_argument("--evidence", required=True, type=Path)
        if name in ("repair-expired-monitor-sources", "repair-run-mirrors", "repair-source-locations"):
            sub.add_argument("--expect-state-sha256", required=True)
            sub.add_argument("--check-only", action="store_true")
        if name in ("repair-expired-monitor-sources", "repair-source-locations"):
            sub.add_argument("--authority-ref", required=True)
        if name in ("start-run", "return-run"):
            sub.add_argument("--handoff", required=True, type=Path)
        if name == "accept":
            sub.add_argument("--criterion", required=True)
        if name == "start-run":
            sub.add_argument("--run-id", required=True)
            sub.add_argument("--attempt", type=int, default=1)
        if name == "arm-run":
            for field in ("supervisor-ack", "monitor-registration", "return-wake-receipt"):
                sub.add_argument("--" + field, required=True, type=Path)
        if name in ("pause", "resume", "record-guidance"):
            sub.add_argument("--request-ref", required=True)
        if name == "record-guidance":
            sub.add_argument("--scope", choices=("outcome", "iteration"), required=True)
            sub.add_argument("--summary", required=True, help="Consolidated effective guidance for the scope")
        if name == "resume":
            sub.add_argument("--evidence", type=Path)
    for name, sub in commands.choices.items():
        if name not in ("install-template", "list-templates", "validate", "team-plan"):
            sub.add_argument("--project", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "validate":
            template = validate(load(args.file))
            result = {"valid": True, "id": template["id"], "steps": len(template["steps"])}
        elif args.command == "list-templates":
            result = {"templates": sorted(p.parent.name for p in Path(args.home).expanduser().glob("*/workflow.yaml"))}
        elif args.command == "team-plan":
            if args.template:
                result = team_plan(validate(load(template_path(args.template, args.home))))
            else:
                _, manifest, _, _, _ = opened(args.project)
                result = team_plan(manifest["definition"], manifest.get("team_sessions", manifest["roles"]),
                                   manifest.get("model_preferences"))
        elif args.command == "install-template":
            sources = [args.file] if args.file else sorted((Path(__file__).resolve().parents[1] / "templates").glob("*.yaml"))
            installed = []
            for source in sources:
                template = validate(load(source))
                destination = Path(args.home).expanduser() / template["id"] / "workflow.yaml"
                require(not destination.exists(), "template already exists; preserve customizations or use a new template id")
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("xb") as stream:
                    stream.write(source.read_bytes())
                installed.append(str(destination))
            result = {"installed": installed}
        elif args.command == "init":
            result = init(args)
        elif args.command == "adopt":
            result = adopt(args)
        elif args.command == "upgrade":
            result = upgrade(args)
        elif args.command in ("status", "doctor", "route", "monitor-prompt", "export"):
            root, manifest, state, outcome, workflow = opened(args.project)
            if args.command == "status":
                result = {"outcome_id": outcome["id"], "status": outcome["status"], "revision": workflow["revision"],
                          "step": workflow["step"], "iteration": workflow["iteration"], "visit": workflow["visit"],
                          "owner_session": state["owner_session"], "next_action": outcome["next_action"],
                          "user_guidance": active_guidance(workflow),
                          "delegations": step_delegations(manifest, workflow),
                          "return_pending": workflow.get("return_pending", False), "monitor": manifest["monitor"],
                          "acceptance": outcome["acceptance"], **history_diagnostics(workflow)}
            elif args.command == "doctor":
                for ref in workflow["evidence"]:
                    evidence_bytes(ref, root, "workflow.evidence")
                disposition, reasons, _ = check(outcome, root, datetime.now(timezone.utc), 3600)
                result = {"consistent": True, "disposition": disposition, "reasons": reasons,
                          "native_scheduler_verified": False, "limitation": "Local records only; reread the app monitor and observe scheduling separately.",
                          **history_diagnostics(workflow)}
            elif args.command == "route":
                result = route(state, root, outcome_id=outcome["id"], main=manifest["roles"]["main"],
                               supervisor=manifest["roles"]["supervisor"], caller=args.caller_session, main_status=args.main_status)
                if args.wake_only:
                    result.pop("next_action", None)
                    if result["action"] == "resume_main":
                        result["wake"] = wake_checkpoint(outcome, workflow, state)
            elif args.command == "export":
                require(not args.output.exists(), "export target already exists")
                with args.output.open("xb") as stream:
                    stream.write(encoded(manifest["definition"]))
                result = {"exported": str(args.output), "bindings_exported": False}
            else:
                require(args.caller_session is not None or args.main_status == "unknown",
                        "a native main status requires the actual caller session")
                result = monitor_prompt(root, manifest, state, outcome, workflow, args.caller_session, args.main_status)
                if args.wake_only:
                    result.pop("prompt")
                    if "wake" in result:
                        result["wake"] = wake_checkpoint(outcome, workflow, state)
        else:
            nonempty(args.event_id, "event ID")
            result = mutate(args)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (Invalid, OSError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({"error": str(exc), "changed": False}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
