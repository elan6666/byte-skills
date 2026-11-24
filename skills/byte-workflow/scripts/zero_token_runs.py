"""Local display registration and bounded, identity-aware Byte run observation."""

import fcntl
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
from datetime import datetime, timezone
import sys


def update_run(project, entry, **changes):
    """Merge a single verified run under a lock without replacing neighboring runs."""
    state = Path(project).resolve() / ".byte-os"
    state.mkdir(exist_ok=True, mode=0o700)
    if state.is_symlink():
        raise ValueError("linked Byte state directory")
    path = state / "active-runs.json"
    lock_path = state / "active-runs.lock"
    with os.fdopen(os.open(lock_path, os.O_CREAT | os.O_NOFOLLOW | os.O_RDWR, 0o600), "r+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if path.is_symlink():
            raise ValueError("linked active-runs registry")
        document = json.loads(path.read_text()) if path.is_file() else {"runs": []}
        rows = document["runs"]
        key = entry["id"], entry["attempt"]
        same = [row for row in rows if (row.get("id"), row.get("attempt", 1)) == key]
        if len(same) > 1:
            raise ValueError("duplicate run identity in active-runs registry")
        if same:
            row = same[0]
            for field in ("host", "pid", "start_ticks", "command_sha256", "done_file", "log_file", "owner_session"):
                if row.get(field) is not None and entry.get(field) != row[field]:
                    raise ValueError(f"existing run {key[0]} has a different {field}")
            if row.get("status") in {"done", "failed"}:
                return row
            previous = dict(row)
            row.update({k: v for k, v in entry.items() if v is not None})
        else:
            row = dict(entry, status="running")
            rows.append(row)
            previous = None
        row.update(changes)
        if "terminal_event" in changes:
            identity = json.dumps(key, ensure_ascii=False)
            name = f"byte-run-{hashlib.sha256(identity.encode()).hexdigest()[:24]}.json"
            relative = Path(".byte-os/coordination/receipts") / name
            dest = Path(project).resolve() / relative
            for parent in (dest.parent.parent, dest.parent):
                parent.mkdir(exist_ok=True, mode=0o700)
                if parent.is_symlink():
                    raise ValueError("linked terminal receipt directory")
            evidence = {
                "run_id": row["id"], "attempt": row["attempt"], "status": row["status"],
                "owner_session": row["owner_session"], "event": row["terminal_event"],
            }
            try:
                with dest.open("x", encoding="utf-8") as stream:
                    json.dump(evidence, stream, indent=2, ensure_ascii=False)
                    stream.write("\n")
            except FileExistsError:
                if dest.is_symlink() or json.loads(dest.read_text()) != evidence:
                    raise ValueError("conflicting terminal run evidence") from None
            row["terminal_verification"] = str(relative)
        if row != previous:
            row["updated_at"] = datetime.now(timezone.utc).isoformat()
            with tempfile.NamedTemporaryFile(mode="w", dir=state, delete=False) as stream:
                tmp = Path(stream.name)
                json.dump(document, stream, indent=2, ensure_ascii=False)
                stream.write("\n")
            os.replace(tmp, path)
        return row


PROBE = r"""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
p=json.loads(sys.argv[1])
def file(name):
    return Path(p[name]) if p.get(name) else None
result=file("done_file")
if result and result.is_file():
    try:
        with result.open("rb") as stream:
            content=stream.read(1048577)
        if len(content)>1048576:
            raise ValueError("completion receipt exceeds 1 MiB")
        expected=p["expect"]
        if expected:
            data=json.loads(content)
            if not isinstance(data,dict) or any(data.get(k)!=v for k,v in expected.items()):
                raise ValueError("completion receipt disagrees with expected fields")
        print(json.dumps({"state":"done_file","path":str(result),"receipt_sha256":hashlib.sha256(content).hexdigest()}))
    except (OSError,ValueError) as error:
        print(json.dumps({"state":"invalid_receipt","detail":str(error)}))
    sys.exit(0)
pid=p["pid"]
if pid and subprocess.run(["ps","-p",str(pid)],capture_output=True).returncode!=0:
    print(json.dumps({"state":"missing_receipt" if result else "exited","pid":pid}))
    sys.exit(0)
if pid and p.get("start_ticks") is not None:
    proc=Path("/proc")/str(pid)
    try:
        start=(proc/"stat").read_text().rsplit(")",1)[1].split()[19]
        command=hashlib.sha256((proc/"cmdline").read_bytes()).hexdigest()
    except (OSError,IndexError):
        start,command=None,None
    if start!=p["start_ticks"] or command!=p["command_sha256"]:
        print(json.dumps({"state":"identity_mismatch","pid":pid}))
        sys.exit(0)
log=file("log_file")
if log and log.is_file():
    with log.open("rb") as stream:
        stream.seek(max(stream.seek(0,2)-131072,0))
        tail=stream.read().decode(errors="replace").replace("\r","\n").splitlines()[-30:]
    matches=[line[:500] for line in tail if re.search(p["error_regex"],line)]
    if matches:
        print(json.dumps({"state":"error_in_log","detail":matches[-3:]}))
        sys.exit(0)
progress=file("progress_file")
token=None
if progress and progress.is_file():
    stat=progress.stat()
    token=[stat.st_mtime_ns,stat.st_size]
print(json.dumps({"state":"running","progress":token}))
"""


def observe(args, expected):
    probe_args = {
        "pid": args.pid, "start_ticks": args.start_ticks, "command_sha256": args.command_sha256,
        "done_file": args.done_file, "log_file": args.log_file, "error_regex": args.error_regex,
        "progress_file": args.progress_file, "expect": expected,
    }
    remote = ["python3", "-c", PROBE, json.dumps(probe_args)]
    command = [sys.executable, *remote[1:]]
    if args.host:
        command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]
        if args.ssh_key:
            command.extend(["-i", str(Path(args.ssh_key).expanduser()), "-o", "IdentitiesOnly=yes"])
        command.extend(["--", args.host, shlex.join(remote)])
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=20)
        if completed.returncode:
            return {"state": "connection_unverified" if args.host else "probe_error"}
        return json.loads(completed.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return {"state": "connection_unverified" if args.host else "probe_error"}
