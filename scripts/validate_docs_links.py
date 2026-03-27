#!/usr/bin/env python3
"""Validate local markdown links under docs/.

Checks only local relative links in markdown files. External URLs are skipped.
Exit code 1 when broken links are found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_ROOT = REPO_ROOT / 'docs'
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
FENCED_CODE_BLOCK_RE = re.compile(
    r"(^|\n)(`{3,}|~{3,})[^\n]*\n.*?\n\2[^\n]*(?=\n|$)",
    re.DOTALL,
)


def normalize_link(link: str) -> str:
    link = link.strip()
    if link.startswith('<') and link.endswith('>'):
        link = link[1:-1].strip()
    return unquote(link).split('#', 1)[0].split('?', 1)[0]


def strip_fenced_code_blocks(text: str) -> str:
    return FENCED_CODE_BLOCK_RE.sub('\n', text)


def is_external(link: str) -> bool:
    return (
        link.startswith('http://')
        or link.startswith('https://')
        or link.startswith('mailto:')
        or link.startswith('#')
    )


def validate() -> list[tuple[Path, str]]:
    broken: list[tuple[Path, str]] = []
    for md_file in DOCS_ROOT.rglob('*.md'):
        text = strip_fenced_code_blocks(md_file.read_text(encoding='utf-8', errors='replace'))
        for match in LINK_RE.finditer(text):
            raw_link = normalize_link(match.group(1))
            if not raw_link or is_external(raw_link):
                continue
            if raw_link.startswith('/'):
                target = (REPO_ROOT / raw_link.lstrip('/')).resolve()
            else:
                target = (md_file.parent / raw_link).resolve()
            if not target.exists():
                broken.append((md_file.relative_to(REPO_ROOT), raw_link))
    return broken


def main() -> int:
    broken = validate()
    if not broken:
        print('Docs link validation: OK (no broken local links found).')
        return 0

    print(f'Docs link validation: FAIL ({len(broken)} broken local links).')
    for md_file, link in broken:
        print(f'- {md_file}: {link}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
