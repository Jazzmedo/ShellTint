"""Reads the builder's published generations and serves CSS blocks in chunks."""

import json
import re
from urllib.parse import urlparse

from .protocol import MAX_MESSAGE_BYTES, split_for_message

SITE_CSS_BUDGET = 800 * 1024
MAX_HASHES = 1000
BLOCK_HASH_RE = re.compile(r"^[0-9a-f]{16,64}$")


def index_key(root):
    """Identity of the published index, cheap enough to check every tick."""
    index = root / "current" / "index.json"
    try:
        st = index.stat()
        return (str(index.resolve()), st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def load_index(key):
    if not key:
        return None
    try:
        with open(key[0], "r", encoding="utf-8") as f:
            index = json.load(f)
    except (OSError, ValueError):
        return None
    return index if isinstance(index, dict) and index.get("format") == 1 else None


def find_block(root, block_hash):
    """The block in the current generation, else in an older one still on disk.

    Older generations matter while a page still shows their CSS: removing a
    sheet needs its exact text.
    """
    if not isinstance(block_hash, str) or not BLOCK_HASH_RE.match(block_hash):
        return None
    name = f"{block_hash}.css"
    candidate = root / "current" / "blocks" / name
    if candidate.is_file():
        return candidate
    try:
        generations = sorted((d for d in root.iterdir() if d.name.startswith("gen-")), reverse=True)
    except OSError:
        return None
    for gen in generations:
        candidate = gen / "blocks" / name
        if candidate.is_file():
            return candidate
    return None


def parse_site_list(lines):
    """The extension's site-list grammar, as index matchers.

    A bare hostname (or any URL without a path) becomes a domain matcher that
    covers subdomains; a URL with a path becomes a prefix matcher for exactly
    that path; comments and junk lines are dropped.
    """
    out, seen = [], set()
    for raw in lines or []:
        line = str(raw).strip()
        if not line or line.startswith("#"):
            continue
        text = line if re.match(r"^[a-z][a-z0-9+.-]*://", line, re.I) else f"https://{line}"
        parsed = urlparse(text)
        if not parsed.hostname or re.search(r"\s", line):
            continue
        path = parsed.path.rstrip("/")
        if path:
            matcher = {"t": "url-prefix", "v": f"{parsed.scheme}://{parsed.netloc}{path}"}
        else:
            matcher = {"t": "domain", "v": parsed.hostname.lower()}
        key = f"{matcher['t']} {matcher['v']}"
        if key not in seen:
            seen.add(key)
            out.append(matcher)
    return out


def with_site_instances(index, settings):
    """Merge the user's self-hosted domains into the index matchers.

    The extension also adds these from its own settings, but only for browsers
    that carry them; merging here means a fresh or never-synced browser styles
    the user's instances straight from the shared mirror.
    """
    if not isinstance(index, dict) or not isinstance(index.get("styles"), list):
        return index
    by_id = settings.get("siteInstances") if isinstance(settings, dict) else None
    if not by_id:
        return index
    matchers_by_id = {site_id: parse_site_list(lines) for site_id, lines in by_id.items()}
    styles = []
    changed = False
    for style in index["styles"]:
        if not isinstance(style, dict):
            styles.append(style)
            continue
        extra = matchers_by_id.get(style.get("id"))
        if extra:
            blocks = []
            for block in style.get("blocks", []):
                existing = {(m.get("t"), m.get("v")) for m in block.get("matchers", [])}
                add = [m for m in extra if (m["t"], m["v"]) not in existing]
                if add:
                    block = {**block, "matchers": list(block.get("matchers", [])) + add}
                    changed = True
                blocks.append(block)
            style = {**style, "blocks": blocks}
        styles.append(style)
    return {**index, "styles": styles} if changed else index


def styles_for_blocks(index, hashes):
    """Style ids owning these blocks, for blocks the builder only indexed.

    A full build compiles just the styles this browser has used; the rest carry
    their sites but no CSS until a page asks for one.
    """
    if not isinstance(index, dict):
        return []
    wanted = {h for h in hashes if isinstance(h, str)}
    out = []
    for style in index.get("styles") or []:
        if not isinstance(style, dict):
            continue
        blocks = style.get("blocks") or []
        if any(isinstance(b, dict) and b.get("hash") in wanted for b in blocks):
            style_id = style.get("id")
            if isinstance(style_id, str) and style_id not in out:
                out.append(style_id)
    return out


def site_css_messages(root, req_id, hashes):
    """ST_SITE_CSS messages answering one request; the last is marked final."""
    piece_limit = SITE_CSS_BUDGET - 4096
    items, size, missing = [], 0, []

    def message(final):
        out = {"type": "ST_SITE_CSS", "reqId": req_id, "items": items, "final": final}
        if final:
            out["missing"] = missing
        return out

    for block_hash in hashes[:MAX_HASHES]:
        path = find_block(root, block_hash)
        if path is None:
            if isinstance(block_hash, str) and BLOCK_HASH_RE.match(block_hash):
                missing.append(block_hash)
            continue
        try:
            css = path.read_text(encoding="utf-8")
        except OSError:
            missing.append(block_hash)
            continue
        pieces = split_for_message(css, piece_limit)
        for i, piece in enumerate(pieces):
            cost = len(json.dumps(piece)) + 256
            if items and size + cost > SITE_CSS_BUDGET:
                yield message(False)
                items, size = [], 0
            item = {"hash": block_hash, "css": piece}
            if len(pieces) > 1:
                item["part"], item["parts"] = i, len(pieces)
            items.append(item)
            size += cost
    yield message(True)


def fits_in_message(obj):
    return len(json.dumps(obj, separators=(",", ":")).encode()) < MAX_MESSAGE_BYTES - 1024
