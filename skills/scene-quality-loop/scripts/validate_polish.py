#!/usr/bin/env python3
import json
import sys
from pathlib import Path

WEIGHTS = {
    "assembly_correctness": 0.30,
    "grounding_contact": 0.20,
    "functional_plausibility": 0.20,
    "detail_completeness": 0.20,
    "inspection_coverage": 0.10,
}
GATES = {"assembly", "grounding", "function", "detail", "coverage"}


def load(root, name, errors):
    path = root / name
    if not path.exists():
        errors.append(f"missing {name}")
        return {}
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"invalid {name}: {error}")
        return {}


def require(condition, message, errors):
    if not condition:
        errors.append(message)


def main():
    if len(sys.argv) != 2:
        print("usage: validate_polish.py <scene-directory>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    errors = []
    inventory = load(root, "detail-inventory.json", errors)
    assemblies_doc = load(root, "assemblies.json", errors)
    cameras_doc = load(root, "inspection-cameras.json", errors)
    review = load(root, "polish-review.json", errors)
    scene_names = {doc.get("scene") for doc in (inventory, assemblies_doc, cameras_doc, review) if doc}
    require(len(scene_names) == 1 and None not in scene_names, "scene ids must match", errors)

    cameras = cameras_doc.get("cameras", [])
    camera_ids = {camera.get("id") for camera in cameras}
    require(len(cameras) >= 4, "at least four inspection cameras required", errors)
    require(len(camera_ids) == len(cameras) and None not in camera_ids, "inspection camera ids must be unique", errors)
    for camera in cameras:
        require(camera.get("kind") in {"orbit", "contact", "reverse", "diagnostic"}, f"invalid camera kind: {camera.get('id')}", errors)
        require(len(camera.get("position", [])) == 3 and len(camera.get("target", [])) == 3, f"camera pose missing: {camera.get('id')}", errors)

    items = inventory.get("items", [])
    item_ids = {item.get("id") for item in items}
    require(items and len(item_ids) == len(items) and None not in item_ids, "detail item ids must be present and unique", errors)
    for item in items:
        require(item.get("scale") in {"macro", "meso", "micro"}, f"invalid detail scale: {item.get('id')}", errors)
        require(item.get("importance") in {"hero", "story", "supporting"}, f"invalid detail importance: {item.get('id')}", errors)
        require(item.get("status") in {"accepted", "omitted"}, f"detail not resolved: {item.get('id')}", errors)
        require(bool(item.get("implementation")), f"detail implementation missing: {item.get('id')}", errors)
        if item.get("importance") in {"hero", "story"}:
            ids = item.get("inspection_camera_ids", [])
            require(ids and all(camera_id in camera_ids for camera_id in ids), f"inspection coverage missing: {item.get('id')}", errors)

    assemblies = assemblies_doc.get("assemblies", [])
    assembly_ids = {assembly.get("id") for assembly in assemblies}
    require(assemblies and len(assembly_ids) == len(assemblies) and None not in assembly_ids, "assembly ids must be present and unique", errors)
    for assembly in assemblies:
        prefix = f"assembly {assembly.get('id')}"
        components = assembly.get("components", [])
        anchors = assembly.get("anchors", [])
        anchor_ids = {anchor.get("id") for anchor in anchors}
        require(len(components) >= 3, f"{prefix} needs at least three components", errors)
        require(bool(assembly.get("support")), f"{prefix} support missing", errors)
        require(len(anchor_ids) == len(anchors) and None not in anchor_ids, f"{prefix} anchor ids invalid", errors)
        require(bool(assembly.get("relationships")), f"{prefix} relationships missing", errors)
        for relation in assembly.get("relationships", []):
            require(relation.get("type") in {"attached", "supported", "aligned", "contained", "driven"}, f"{prefix} relationship type invalid", errors)
            require(relation.get("from") in anchor_ids and relation.get("to") in anchor_ids, f"{prefix} relationship anchor missing", errors)
            require(isinstance(relation.get("tolerance_m"), (int, float)), f"{prefix} tolerance missing", errors)

    gates = review.get("gates", {})
    require(set(gates) == GATES and all(gates.values()), "all polish gates must pass", errors)
    scores = review.get("scores", {})
    require(set(scores) == set(WEIGHTS), "polish score categories do not match", errors)
    for key, value in scores.items():
        require(isinstance(value, (int, float)) and 0 <= value <= 1, f"invalid score: {key}", errors)
        require(value >= 0.70, f"score below 0.70: {key}", errors)
    weighted = sum(scores.get(key, 0) * weight for key, weight in WEIGHTS.items())
    critical = [defect for defect in review.get("defects", []) if defect.get("severity") == "critical" and defect.get("status") != "fixed"]
    require(not critical, "unresolved critical defects", errors)
    require(weighted >= 0.80, "weighted polish score below 0.80", errors)
    if (root / "spatial-contracts.json").exists():
        spatial = load(root, "spatial-report.json", errors)
        require(spatial.get("scene") in scene_names, "spatial report scene id must match", errors)
        require(spatial.get("status") == "pass" and spatial.get("passed") is True, "spatial verification must pass", errors)
        require(bool(spatial.get("source_identity")), "spatial report source identity missing", errors)
        coverage = spatial.get("coverage", {})
        require(coverage.get("unknown") == 0 and not coverage.get("missing"), "spatial contract coverage incomplete", errors)
        require(spatial.get("checks", 0) > 0 and not spatial.get("violations"), "spatial violations unresolved", errors)
    accepted = not errors
    print(json.dumps({"accepted": accepted, "polish_score": round(weighted, 4), "errors": errors}, indent=2))
    return 0 if accepted else 1


if __name__ == "__main__":
    raise SystemExit(main())
