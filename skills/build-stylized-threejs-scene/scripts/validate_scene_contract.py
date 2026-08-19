#!/usr/bin/env python3
"""Validate the minimum planning contract for a stylized Three.js vignette."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REQUIRED_TOP_LEVEL = {
    "schema_version",
    "title",
    "promise",
    "experience_seconds",
    "footprint_m",
    "arrival_view",
    "art_direction",
    "landmarks",
    "route",
    "story_details",
    "interactions",
    "constraints",
    "review_cameras",
    "success_criteria",
}


# Matches the unedited template's prompt text ("Replace with…", "Describe…",
# "Define…", "Name the…"), mirroring score_scene_review.py's placeholder check.
PLACEHOLDER = re.compile(r"^\s*(replace|describe|define|name the)\b", re.IGNORECASE)


def is_placeholder(value: Any) -> bool:
    return isinstance(value, str) and bool(PLACEHOLDER.match(value))


def check_placeholder(value: Any, label: str, errors: list[str]) -> None:
    if is_placeholder(value):
        errors.append(f"{label} still contains the template's placeholder text; write the scene's own content")


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_vector(value: Any) -> bool:
    return isinstance(value, list) and len(value) == 3 and all(is_number(v) for v in value)


def is_described(value: Any) -> bool:
    return is_text(value) or isinstance(value, (dict, list)) and bool(value)


def require_keys(value: Any, keys: set[str], label: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"{label} must be an object")
        return
    for key in sorted(keys - value.keys()):
        errors.append(f"{label}.{key} is required")


def validate(data: Any) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(data, dict):
        return ["contract root must be an object"], warnings

    for key in sorted(REQUIRED_TOP_LEVEL - data.keys()):
        errors.append(f"{key} is required")
    if data.get("schema_version") != 1:
        errors.append("schema_version must be 1")

    for key in ("title", "promise"):
        if not is_text(data.get(key)):
            errors.append(f"{key} must be a non-empty string")
        else:
            check_placeholder(data[key], key, errors)

    duration = data.get("experience_seconds")
    if not is_number(duration) or duration <= 0:
        errors.append("experience_seconds must be a positive number")
    elif duration < 30 or duration > 90:
        warnings.append("default vignette duration is 30–90 seconds; explain intentional scope")

    footprint = data.get("footprint_m")
    require_keys(footprint, {"width", "depth", "height"}, "footprint_m", errors)
    if isinstance(footprint, dict):
        for key in ("width", "depth", "height"):
            if not is_number(footprint.get(key)) or footprint[key] <= 0:
                errors.append(f"footprint_m.{key} must be a positive number")

    arrival = data.get("arrival_view")
    require_keys(arrival, {"position", "target", "fov", "composition_intent"}, "arrival_view", errors)
    if isinstance(arrival, dict):
        for key in ("position", "target"):
            value = arrival.get(key)
            if not is_vector(value):
                errors.append(f"arrival_view.{key} must be a three-number array")
        if not is_number(arrival.get("fov")) or not 15 <= arrival.get("fov", 0) <= 100:
            errors.append("arrival_view.fov must be between 15 and 100 degrees")
        if not is_text(arrival.get("composition_intent")):
            errors.append("arrival_view.composition_intent must be a non-empty string")
        else:
            check_placeholder(arrival["composition_intent"], "arrival_view.composition_intent", errors)

    art = data.get("art_direction")
    require_keys(art, {"style", "palette_roles", "lighting_logic", "silhouette_rules", "forbidden_drift"}, "art_direction", errors)
    if isinstance(art, dict):
        if not is_text(art.get("style")):
            errors.append("art_direction.style must be a non-empty string")
        else:
            check_placeholder(art["style"], "art_direction.style", errors)
        if not is_described(art.get("lighting_logic")):
            errors.append("art_direction.lighting_logic must describe the lighting system")
        else:
            check_placeholder(art.get("lighting_logic"), "art_direction.lighting_logic", errors)
        if not isinstance(art.get("palette_roles"), dict) or len(art["palette_roles"]) < 5:
            errors.append("art_direction.palette_roles must define at least five semantic roles")
        for key in ("silhouette_rules", "forbidden_drift"):
            if not isinstance(art.get(key), list) or not art[key]:
                errors.append(f"art_direction.{key} must be a non-empty array")

    landmarks = data.get("landmarks")
    if not isinstance(landmarks, list) or not 3 <= len(landmarks) <= 5:
        errors.append("landmarks must contain three to five entries")
    elif any(not isinstance(item, dict) or not item.get("name") or not item.get("purpose") for item in landmarks):
        errors.append("each landmark must contain name and purpose")

    route = data.get("route")
    require_keys(route, {"start", "beats", "end"}, "route", errors)
    if isinstance(route, dict):
        if not is_described(route.get("start")) or not is_described(route.get("end")):
            errors.append("route.start and route.end must describe their locations")
        beats = route.get("beats")
        if not isinstance(beats, list) or len(beats) < 3 or not all(is_text(v) or isinstance(v, dict) and is_text(v.get("name")) for v in beats):
            errors.append("route.beats must contain at least three named exploration beats")

    story = data.get("story_details")
    require_keys(story, {"macro", "meso", "micro"}, "story_details", errors)
    if isinstance(story, dict):
        for key in ("macro", "meso", "micro"):
            if not isinstance(story.get(key), list) or not story[key]:
                errors.append(f"story_details.{key} must be a non-empty array")

    interactions = data.get("interactions")
    if not isinstance(interactions, list):
        errors.append("interactions must be an array")
    elif len(interactions) > 3:
        warnings.append("default vignettes should use at most three meaningful interactions")
    elif not interactions:
        warnings.append("no interactions defined; confirm that interaction would not improve the promise")
    elif any(not isinstance(item, dict) or not all(is_text(item.get(key)) for key in ("target", "verb", "meaning")) or not is_text(item.get("response") or item.get("immediate_response")) for item in interactions):
        errors.append("each interaction must contain target, verb, response or immediate_response, and meaning")

    constraints = data.get("constraints")
    require_keys(constraints, {"asset_policy", "performance", "runtime"}, "constraints", errors)
    if isinstance(constraints, dict):
        if not is_described(constraints.get("asset_policy")):
            errors.append("constraints.asset_policy must describe allowed and forbidden assets")
        performance = constraints.get("performance")
        if not isinstance(performance, dict) or not performance:
            errors.append("constraints.performance must be a non-empty object")
        elif not any(key in performance for key in ("target_fps", "fps_aspiration", "target")) or not any(key in performance for key in ("max_pixel_ratio", "pixel_ratio_cap", "pixel_ratio_max")):
            errors.append("constraints.performance must declare an FPS target and pixel-ratio cap")
        runtime = constraints.get("runtime")
        if not isinstance(runtime, dict) or not is_text(runtime.get("browser")) or not any(is_described(runtime.get(key)) for key in ("input", "movement", "interaction")):
            errors.append("constraints.runtime must describe browser and input or movement")

    cameras = data.get("review_cameras")
    if not isinstance(cameras, list) or len(cameras) < 4:
        errors.append("review_cameras must include at least arrival, context, detail, and reverse/route views")
    else:
        names = {item.get("name") for item in cameras if isinstance(item, dict)}
        missing_names = {"arrival", "context", "detail"} - names
        if missing_names or not names.intersection({"reverse", "route"}):
            errors.append("review_cameras must name arrival, context, detail, and reverse or route views")
        if any(not isinstance(item, dict) or not is_text(item.get("name")) or not is_vector(item.get("position")) or not is_vector(item.get("target")) for item in cameras):
            errors.append("each review camera must contain a name and three-number position and target")
        for item in cameras:
            if not isinstance(item, dict):
                continue
            name = item.get("name") if is_text(item.get("name")) else "?"
            subject = item.get("subject")
            if not is_text(subject):
                errors.append(f"review camera '{name}' must declare a subject: the Object3D name the camera exists to show (checked by checkAllCameras)")
            else:
                check_placeholder(subject, f"review_cameras['{name}'].subject", errors)

    criteria = data.get("success_criteria")
    if not isinstance(criteria, list) or len(criteria) < 3 or any(not isinstance(v, str) or not v.strip() for v in criteria):
        errors.append("success_criteria must contain at least three observable strings")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", type=Path)
    parser.add_argument("--json", action="store_true", help="print machine-readable output")
    args = parser.parse_args()

    try:
        data = json.loads(args.contract.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [str(exc)], "warnings": []}, indent=2))
        return 2

    errors, warnings = validate(data)
    result = {"valid": not errors, "errors": errors, "warnings": warnings}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("VALID" if not errors else "INVALID")
        for warning in warnings:
            print(f"warning: {warning}")
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
