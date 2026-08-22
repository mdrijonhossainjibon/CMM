"""Rule engine for KB-L captcha tile selection.

Parses a natural language query (e.g. "Select all images containing rabbit and
beach") into a predicate and evaluates it against per-tile object + scene
predictions.

Supported grammar:
  * TOKEN and TOKEN              — both must be present
  * TOKEN or TOKEN               — either must be present
  * "the" prefix is stripped automatically
  * bare terms match our object or scene taxonomy

Both object and scene labels are matched case-insensitively and against
synonyms, so "bunny" matches rabbit and "ocean" matches sea.
"""
from typing import Dict, List, Optional, Tuple
import re

from backend.vision.scene import SCENE_CLASSES, normalize_scene, SCENE_SYNONYMS

OBJECT_CLASSES: List[str] = [
    "rabbit", "cat", "dog", "horse", "bird", "boat", "car",
    "bus", "truck", "chair", "mouse", "person",
]

# object synonyms -> canonical object label
OBJECT_SYNONYMS: Dict[str, str] = {
    "rabbit": "rabbit", "bunny": "rabbit", "hare": "rabbit", "bun": "rabbit",
    "cat": "cat", "kitty": "cat", "kitten": "cat", "feline": "cat",
    "dog": "dog", "puppy": "dog", "pup": "dog", "canine": "dog",
    "horse": "horse", "pony": "horse", "steed": "horse",
    "bird": "bird", "birdie": "bird", "parrot": "bird", "duck": "bird",
    "boat": "boat", "ship": "boat", "vessel": "boat", "sailboat": "boat",
    "car": "car", "automobile": "car", "vehicle": "car", "auto": "car",
    "bus": "bus", "coach": "bus",
    "truck": "truck", "lorry": "truck", "pickup": "truck", "van": "truck",
    "chair": "chair", "seat": "chair",
    "mouse": "mouse", "rat": "mouse", "mice": "mouse",
    "person": "person", "human": "person", "man": "person", "woman": "person",
    "people": "person", "guy": "person",
}


def normalize_object(term: str) -> str:
    t = term.strip().lower()
    if not t:
        return ""
    if t in OBJECT_SYNONYMS:
        return OBJECT_SYNONYMS[t]
    for key, canon in OBJECT_SYNONYMS.items():
        if key in t or t in key:
            return canon
    return t


class Rule:
    def __init__(self, terms: List[str], require_all: bool = True):
        self.terms = terms
        self.require_all = require_all

    def _term_is_object(self, term: str) -> bool:
        return normalize_object(term) in OBJECT_SYNONYMS.values()

    def _term_is_scene(self, term: str) -> bool:
        return normalize_scene(term) in SCENE_SYNONYMS.values() or normalize_scene(term) in SCENE_CLASSES

    def matches(self, object_label: Optional[str], scene_label: Optional[str]) -> Tuple[bool, List[str]]:
        reasons: List[str] = []
        object_label = normalize_object(object_label or "")
        scene_label = normalize_scene(scene_label or "")
        results = []
        for term in self.terms:
            if self._term_is_object(term):
                matched = bool(object_label) and object_label == normalize_object(term)
                if matched:
                    reasons.append(f"object:{object_label}")
            else:
                # scene term (or unknown) — match against scene taxonomy
                matched = bool(scene_label) and scene_label == normalize_scene(term)
                if matched:
                    reasons.append(f"scene:{scene_label}")
            results.append(matched)
        verdict = all(results) if self.require_all else any(results)
        return verdict, reasons


# Aliases so logic stays readable
Conditions = Rule


def strip_articles(term: str) -> str:
    term = term.strip()
    lower = term.lower()
    for prefix in ("images containing ", "image containing ", "all images ", "containing ", "select all "):
        if lower.startswith(prefix):
            term = term[len(prefix):].strip()
            lower = term.lower()
            break
    for prefix in ("the ", "a ", "an "):
        if lower.startswith(prefix):
            term = term[len(prefix):].strip()
            break
    return term


def parse_query(query: str) -> Optional[Rule]:
    """Parse a natural language query into a Rule, or None if no terms found."""
    if not query:
        return None
    text = query.lower()
    # Normalize spaces around "and"/"or"
    text = re.sub(r"\band\b", " AND ", text)
    text = re.sub(r"\bor\b", " OR ", text)
    # tokenize on AND/OR
    parts = re.split(r"\s+(AND|OR)\s+", text)
    require_all = not any(p.strip() == "OR" for p in parts)
    terms = []
    for part in parts:
        p = part.strip()
        if p in ("AND", "OR"):
            continue
        p = strip_articles(p)
        p = re.sub(r"[^a-z ]", "", p)
        if not p:
            continue
        # take the last meaningful word as the term
        words = [w for w in p.split() if w]
        if words:
            terms.append(words[-1])
    if not terms:
        return None
    return Rule(terms=terms, require_all=require_all)


def evaluate_tile(rule: Optional[Rule], object_label: Optional[str], scene_label: Optional[str]) -> Tuple[bool, List[str]]:
    if rule is None:
        return False, []
    return rule.matches(object_label, scene_label)
