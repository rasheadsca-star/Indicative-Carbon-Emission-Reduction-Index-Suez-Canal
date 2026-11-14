#!/usr/bin/env python3
"""Offline, standard-library full-repository Claude handoff ZIP builder.

Includes all tracked working-tree source and checked-in binary assets.
Excludes git history, npm installation, runtime temp data and prior output ZIPs.
Manifest hashes every included file. No external dependencies or API calls.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
from datetime import datetime, timezone
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "CERI-SC-CLAUDE-HANDOFF.zip"
IGNORED_DIRS = {".git", "node_modules", "dist", ".next", ".cache",
                "__pycache__", ".venv", "venv", ".pytest_cache"}
IGNORED_SUFFIXES = {".pyc", ".pyo", ".log", ".tmp", ".bak"}
IGNORED_FILES = {".DS_Store", "Thumbs.db", ".env", ".env.local", ".env.production",
                 ".env.development", "id_rsa", "id_ed25519"}
MANDATORY_FILES = [
    "README.md", "index.html", "decision-room.html", "voyage-evidence.html",
    "official-statistics.html", "worker.js", "package.json", "package-lock.json",
    "ais-lab/app.mjs", "ais-lab/core.mjs", "ais-lab/reconciliation.mjs",
    "src/voyage-audit.mjs", "src/ais-sca-voyage-pipeline.mjs",
    "data/sca-official-monthly-2024-2025.json",
    "data/sca-2026-official-announcements.json",
    "CLAUDE_HANDOFF/CLAUDE_MASTER_PROMPT.md",
    "CLAUDE_HANDOFF/STATE_AND_BLOCKERS.md",
    "CLAUDE_HANDOFF/DATA_SOURCES.md",
    "CLAUDE_HANDOFF/ACCEPTANCE_CRITERIA.md",
    "CLAUDE_HANDOFF/README.md",
]
SUSPICIOUS_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}
SUSPICIOUS_NAMES = {"credentials.json", "secrets.json", "service-account.json"}
PROJECT_ROOT = "CERI-SC-CLAUDE-HANDOFF"

def included_files():
    all_paths = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        parts = rel.parts
        if any(part in IGNORED_DIRS for part in parts):
            continue
        if path.name in IGNORED_FILES or path.suffix.lower() in IGNORED_SUFFIXES:
            continue
        if path.suffix.lower() in SUSPICIOUS_SUFFIXES or path.name.lower() in SUSPICIOUS_NAMES:
            raise SystemExit(f"Potential secret/private key file found; refusing ZIP: {rel}")
        all_paths.append((rel.as_posix(), path))
    return sorted(all_paths)

def stable_write(zf, archive_path, contents):
    meta = ZipInfo(archive_path, date_time=(2026, 11, 14, 0, 0, 0))
    meta.compress_type = ZIP_DEFLATED
    meta.external_attr = 0o644 << 16
    zf.writestr(meta, contents, compress_type=ZIP_DEFLATED, compresslevel=8)

def main():
    paths = included_files()
    names = set(name for name, _ in paths)
    missing = [name for name in MANDATORY_FILES if name not in names]
    if missing:
        raise SystemExit("Missing canonical files: " + ", ".join(missing))
    commit = os.environ.get("GITHUB_SHA")
    if not commit:
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        except Exception:
            commit = "unknown"
    records = []
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, "w") as zf:
        for name, path in paths:
            raw = path.read_bytes()
            records.append({"path": name, "bytes": len(raw), "sha256": sha256(raw).hexdigest()})
            stable_write(zf, f"{PROJECT_ROOT}/{name}", raw)
        manifest = "".join(f"{entry['sha256']}  {entry['path']}\n" for entry in records)
        manifest_bytes = manifest.encode("utf-8")
        stable_write(zf, f"{PROJECT_ROOT}/MANIFEST-SHA256.txt", manifest_bytes)
        metadata = {
            "type": "complete-repository-working-tree-snapshot",
            "source_repository": "rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal",
            "source_commit": commit,
            "source_files": len(records),
            "source_bytes": sum(record["bytes"] for record in records),
            "sha256_manifest_sha256": sha256(manifest_bytes).hexdigest(),
            "notes": [
                "Complete source and versioned public snapshots; no Git history, node_modules, credentials or verified real-time AIS feed",
                "Synthetic examples are not actual Suez transit records",
                "Check README.md and CLAUDE_HANDOFF/CLAUDE_MASTER_PROMPT.md first",
            ],
        }
        stable_write(zf, f"{PROJECT_ROOT}/PACKAGE-METADATA.json",
                     json.dumps(metadata, indent=2, ensure_ascii=False).encode("utf-8"))
    with ZipFile(OUTPUT) as zf:
        files = set(zf.namelist())
        for name in MANDATORY_FILES:
            assert f"{PROJECT_ROOT}/{name}" in files
        for entry in records:
            actual = sha256(zf.read(f"{PROJECT_ROOT}/{entry['path']}")).hexdigest()
            if actual != entry["sha256"]:
                raise SystemExit("ZIP checksum mismatch: " + entry["path"])
        assert zf.testzip() is None
    print(json.dumps({"zip": str(OUTPUT), "sha256": sha256(OUTPUT.read_bytes()).hexdigest(),
                      "file_count": len(records), "bytes": OUTPUT.stat().st_size,
                      "source_commit": commit}, indent=2))

if __name__ == "__main__":
    main()
