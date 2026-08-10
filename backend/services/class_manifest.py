import json
import os
import re
import threading
from pathlib import Path

MANIFEST_NAME = "classes.json"


def manifest_path(data_dir: str) -> str:
    return os.path.join(data_dir, MANIFEST_NAME)


def load_manifest(data_dir: str) -> dict:
    path = manifest_path(data_dir)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_manifest(data_dir: str, manifest: dict):
    path = manifest_path(data_dir)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
    except Exception:
        pass


def add_entries(data_dir: str, entries: dict):
    manifest = load_manifest(data_dir)
    manifest.update(entries)
    save_manifest(data_dir, manifest)


def remove_entries(data_dir: str, filenames: list[str]):
    manifest = load_manifest(data_dir)
    for f in filenames:
        manifest.pop(f, None)
    save_manifest(data_dir, manifest)


def remove_by_class(data_dir: str, class_name: str):
    manifest = load_manifest(data_dir)
    to_remove = [f for f, cls in manifest.items() if cls == class_name]
    for f in to_remove:
        manifest.pop(f, None)
    save_manifest(data_dir, manifest)


def rename_entry(data_dir: str, old_name: str, new_name: str, new_class: str):
    manifest = load_manifest(data_dir)
    if old_name in manifest:
        cls = manifest.pop(old_name)
        manifest[new_name] = new_class or cls
        save_manifest(data_dir, manifest)


def fallback_class(filename: str) -> str:
    """Fallback: underscore wala class parse — timestamp (10+ digit) er age sob."""
    stem = filename
    m = re.match(r"^(.*?)_(\d{10,})(_\d+)?(\.[A-Za-z0-9]+)?$", stem)
    if m:
        return m.group(1) or "unknown"
    if "_" in stem:
        return stem.split("_")[0]
    return "unknown"


def get_class(filename: str, data_dir: str, fallback: str = "unknown") -> str:
    """Resolve class for a filename. Manifest first, then smart fallback."""
    manifest = load_manifest(data_dir)
    if filename in manifest:
        return manifest[filename]
    if fallback and fallback != "unknown":
        return fallback
    return fallback_class(filename)
