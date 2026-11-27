#!/usr/bin/env python3
"""Generate Scriptable packages from native JavaScript metadata headers."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = {"icon-color": "blue", "icon-glyph": "magic"}


def package(source, name):
    metadata = {}
    for line in source.splitlines():
        if not line.strip():
            continue
        if not line.startswith("//"):
            break
        for field in line[2:].split(";"):
            field = field.strip()
            if not re.match(r"^icon-(color|glyph)\b", field):
                continue
            match = re.fullmatch(r"(icon-color|icon-glyph):\s*([^\s;]+)", field)
            if not match or match[1] in metadata:
                raise ValueError(f"Invalid or duplicate metadata: {field}")
            metadata[match[1]] = match[2]
    icons = DEFAULTS | metadata
    return {
        "always_run_in_app": False,
        "icon": {"color": icons["icon-color"], "glyph": icons["icon-glyph"]},
        "name": name,
        "script": source,
        "share_sheet_inputs": [],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if packages are stale")
    args = parser.parse_args()
    sources = sorted((ROOT / "widgets").glob("*.js")) + [ROOT / "Sync Widgets.js"]
    stale = []
    for path in sources:
        source = path.read_bytes().decode("utf-8")
        output = json.dumps(package(source, path.stem), ensure_ascii=False, indent=2) + "\n"
        target = path.with_suffix(".scriptable")
        data = output.encode("utf-8")
        if target.exists() and target.read_bytes() == data:
            continue
        if args.check:
            stale.append(str(target.relative_to(ROOT)))
        else:
            target.write_bytes(data)
            print(f"Generated {target.relative_to(ROOT)}")
    if stale:
        parser.exit(1, "Stale packages: " + ", ".join(stale) + "\nRun mise run export\n")


if __name__ == "__main__":
    main()
