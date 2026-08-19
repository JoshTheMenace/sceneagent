#!/usr/bin/env python3
"""Persist and enforce the evidence-gated scene-building workflow."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STAGES = [
    ("brief", {"brief"}),
    ("contract", {"contract"}),
    ("blockout", {"build", "arrival"}),
    ("composition", {"arrival", "context", "reverse"}),
    ("art-direction", {"arrival", "detail"}),
    ("story-detail", {"detail", "route"}),
    ("interaction-runtime", {"build", "runtime", "performance"}),
    ("final-review", {"arrival", "context", "detail", "reverse", "review"}),
]
ACTIONS = {"continue", "revise-contract", "revise-code", "request-input", "stop"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read state: {exc}") from exc


def save(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(path)


def stage_name(state: dict[str, Any]) -> str:
    return STAGES[state["stage_index"]][0]


def required(state: dict[str, Any]) -> set[str]:
    return STAGES[state["stage_index"]][1]


def summary(state: dict[str, Any]) -> dict[str, Any]:
    stage = stage_name(state)
    evidence = state["evidence"].get(stage, {})
    missing = sorted(required(state) - evidence.keys())
    return {
        "name": state["name"],
        "status": state["status"],
        "stage": stage,
        "stage_index": state["stage_index"],
        "required_evidence": sorted(required(state)),
        "recorded_evidence": evidence,
        "missing_evidence": missing,
        "stage_corrections": state["stage_corrections"].get(stage, 0),
        "total_corrections": state["total_corrections"],
        "limits": state["limits"],
        "last_decision": state["history"][-1] if state["history"] else None,
    }


def command_init(args: argparse.Namespace) -> int:
    if args.state.exists() and not args.force:
        print(f"state already exists: {args.state}", file=sys.stderr)
        return 2
    state = {
        "schema_version": 1,
        "name": args.name,
        "created_at": now(),
        "updated_at": now(),
        "status": "active",
        "stage_index": 0,
        "evidence": {},
        "stage_corrections": {},
        "total_corrections": 0,
        "limits": {
            "stage_corrections": args.max_stage_corrections,
            "total_corrections": args.max_total_corrections,
        },
        "history": [],
    }
    save(args.state, state)
    print(json.dumps(summary(state), indent=2))
    return 0


def command_status(args: argparse.Namespace) -> int:
    state = load(args.state)
    print(json.dumps(summary(state), indent=2, ensure_ascii=False))
    return 3 if state["status"] == "stopped" else 0


def command_record(args: argparse.Namespace) -> int:
    state = load(args.state)
    if state["status"] not in {"active", "waiting"}:
        print(f"cannot record evidence while status is {state['status']}", file=sys.stderr)
        return 2
    artifact = args.path.resolve()
    if not artifact.exists():
        print(f"evidence path does not exist: {artifact}", file=sys.stderr)
        return 2
    stage = stage_name(state)
    state["evidence"].setdefault(stage, {})[args.kind] = str(artifact)
    state["updated_at"] = now()
    save(args.state, state)
    print(json.dumps(summary(state), indent=2, ensure_ascii=False))
    return 0


def command_decide(args: argparse.Namespace) -> int:
    state = load(args.state)
    if state["status"] not in {"active", "waiting"}:
        print(f"cannot decide while status is {state['status']}", file=sys.stderr)
        return 2
    action = args.action
    stage = stage_name(state)
    stage_evidence = state["evidence"].get(stage, {})
    missing = sorted(required(state) - stage_evidence.keys())
    missing.extend(
        f"{kind} (path missing)"
        for kind, path in stage_evidence.items()
        if kind in required(state) and not Path(path).exists()
    )
    if action == "continue" and missing:
        print(f"cannot continue; missing evidence: {', '.join(missing)}", file=sys.stderr)
        return 2

    event = {"at": now(), "stage": stage, "action": action, "summary": args.summary}
    state["history"].append(event)

    if action == "continue":
        if state["stage_index"] == len(STAGES) - 1:
            state["status"] = "complete"
        else:
            state["stage_index"] += 1
            state["status"] = "active"
    elif action in {"revise-contract", "revise-code"}:
        state["total_corrections"] += 1
        state["stage_corrections"][stage] = state["stage_corrections"].get(stage, 0) + 1
        if action == "revise-contract":
            state["stage_index"] = 1
            for later_stage, _ in STAGES[1:]:
                state["evidence"].pop(later_stage, None)
        else:
            state["evidence"].pop(stage, None)
        state["status"] = "active"
        if (
            state["stage_corrections"][stage] > state["limits"]["stage_corrections"]
            or state["total_corrections"] > state["limits"]["total_corrections"]
        ):
            state["status"] = "stopped"
            state["history"].append({"at": now(), "stage": stage, "action": "stop", "summary": "correction limit reached"})
    elif action == "request-input":
        state["status"] = "waiting"
    else:
        state["status"] = "stopped"

    state["updated_at"] = now()
    save(args.state, state)
    print(json.dumps(summary(state), indent=2, ensure_ascii=False))
    return 3 if state["status"] == "stopped" else 0


def command_resume(args: argparse.Namespace) -> int:
    state = load(args.state)
    if state["status"] != "waiting":
        print(f"cannot resume while status is {state['status']}", file=sys.stderr)
        return 2
    state["status"] = "active"
    state["updated_at"] = now()
    state["history"].append({"at": now(), "stage": stage_name(state), "action": "resume", "summary": args.summary})
    save(args.state, state)
    print(json.dumps(summary(state), indent=2, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init")
    init.add_argument("--state", type=Path, required=True)
    init.add_argument("--name", required=True)
    init.add_argument("--max-stage-corrections", type=int, default=3)
    init.add_argument("--max-total-corrections", type=int, default=8)
    init.add_argument("--force", action="store_true")
    init.set_defaults(func=command_init)

    status = sub.add_parser("status")
    status.add_argument("--state", type=Path, required=True)
    status.set_defaults(func=command_status)

    record = sub.add_parser("record")
    record.add_argument("--state", type=Path, required=True)
    record.add_argument("--kind", required=True)
    record.add_argument("--path", type=Path, required=True)
    record.set_defaults(func=command_record)

    decide = sub.add_parser("decide")
    decide.add_argument("--state", type=Path, required=True)
    decide.add_argument("--action", choices=sorted(ACTIONS), required=True)
    decide.add_argument("--summary", required=True)
    decide.set_defaults(func=command_decide)

    resume = sub.add_parser("resume")
    resume.add_argument("--state", type=Path, required=True)
    resume.add_argument("--summary", required=True)
    resume.set_defaults(func=command_resume)

    return args.func(args) if (args := parser.parse_args()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
