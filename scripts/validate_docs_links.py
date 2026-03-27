#!/usr/bin/env python3
"""Validate local markdown links under docs/.

Checks only local relative links in markdown files. External URLs are skipped.
Exit code 1 when broken links are found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DOCS_ROOT = Path('docs')
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def normalize_link(link: str) -> str:
    link = link.strip()
    if link.startswith('<') and link.endswith('>'):
        link = link[1:-1].strip()
    return link.split('#', 1)[0].split('?', 1)[0]


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
        text = md_file.read_text(encoding='utf-8', errors='ignore')
        for match in LINK_RE.finditer(text):
            raw_link = normalize_link(match.group(1))
            if not raw_link or is_external(raw_link):
                continue
            target = (md_file.parent / raw_link).resolve() if not raw_link.startswith('/') else Path(raw_link)
            if not target.exists():
                broken.append((md_file, raw_link))
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
