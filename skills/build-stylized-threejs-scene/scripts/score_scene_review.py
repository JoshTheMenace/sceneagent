#!/usr/bin/env python3
"""Aggregate an evaluator-authored scene review and enforce public gates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


WEIGHTS = {
    "composition": 0.22,
    "sense_of_place": 0.18,
    "art_direction": 0.16,
    "exploration_story": 0.14,
    "runtime_traversal": 0.12,
    "maintainability": 0.10,
    "performance": 0.08,
}
REQUIRED_GATES = {
    "build",
    "artifacts",
    "multi_view",
    "traversal",
    "runtime",
    "asset_policy",
    "accessibility",
    "performance",
    "provenance",
}
TOP_CATEGORIES = {"composition", "sense_of_place", "art_direction"}
DECISIONS = {"continue", "revise-contract", "revise-code", "request-input", "stop"}


def is_score(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1


def evaluate(data: Any) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(data, dict):
        return {"accepted": False, "errors": ["review root must be an object"], "warnings": []}
    for key in ("scene", "skill_version", "highest_impact_defect"):
        if not isinstance(data.get(key), str) or not data[key].strip() or data[key].lower().startswith("replace"):
            errors.append(f"{key} must be a completed non-placeholder string")

    gates = data.get("gates")
    if not isinstance(gates, dict):
        errors.append("gates must be an object")
        gates = {}
    for gate in sorted(REQUIRED_GATES):
        if gate not in gates:
            errors.append(f"gates.{gate} is required")
        elif not isinstance(gates[gate], bool):
            errors.append(f"gates.{gate} must be boolean")
    failed_gates = sorted(gate for gate in REQUIRED_GATES if gates.get(gate) is False)

    artifacts = data.get("artifacts_opened")
    if not isinstance(artifacts, list) or len(artifacts) < 4 or not all(isinstance(path, str) and path.strip() for path in artifacts):
        errors.append("artifacts_opened must list at least four inspected artifacts")

    scores = data.get("scores")
    if not isinstance(scores, dict):
        errors.append("scores must be an object")
        scores = {}
    for category in WEIGHTS:
        if category not in scores:
            errors.append(f"scores.{category} is required")
        elif not is_score(scores[category]):
            errors.append(f"scores.{category} must be between 0 and 1")

    evidence = data.get("evidence")
    if not isinstance(evidence, dict):
        warnings.append("evidence should cite observations for each score")
        evidence = {}
    for category in WEIGHTS:
        note = evidence.get(category)
        if not isinstance(note, str) or not note.strip() or note.lower().startswith("replace"):
            errors.append(f"evidence.{category} must contain evaluator observations")

    decision = data.get("decision")
    if decision not in DECISIONS:
        errors.append(f"decision must be one of {', '.join(sorted(DECISIONS))}")
    if not is_score(data.get("confidence")):
        errors.append("confidence must be between 0 and 1")
    if not isinstance(data.get("limitations"), list):
        errors.append("limitations must be an array")

    valid_scores = all(is_score(scores.get(category)) for category in WEIGHTS)
    weighted_score = sum(scores.get(category, 0) * weight for category, weight in WEIGHTS.items()) if valid_scores else 0
    low_categories = sorted(category for category in WEIGHTS if is_score(scores.get(category)) and scores[category] < 0.55)
    weak_top = sorted(category for category in TOP_CATEGORIES if is_score(scores.get(category)) and scores[category] < 0.70)
    score_pass = valid_scores and weighted_score >= 0.78 and not low_categories and not weak_top
    gate_pass = not failed_gates and all(gates.get(gate) is True for gate in REQUIRED_GATES)
    accepted = not errors and gate_pass and score_pass

    if accepted and decision != "continue":
        warnings.append("all public thresholds pass but evaluator decision is not continue")
    if not accepted and decision == "continue":
        errors.append("decision cannot be continue while gates or score thresholds fail")
        accepted = False

    return {
        "accepted": accepted,
        "weighted_score": round(weighted_score, 4),
        "threshold": 0.78,
        "failed_gates": failed_gates,
        "low_categories": low_categories,
        "weak_priority_categories": weak_top,
        "decision": decision,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("review", type=Path)
    parser.add_argument("--out", type=Path, help="also write the result as JSON")
    args = parser.parse_args()
    try:
        data = json.loads(args.review.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"accepted": False, "errors": [str(exc)]}, indent=2))
        return 2

    result = evaluate(data)
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    print(rendered, end="")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered, encoding="utf-8")
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
