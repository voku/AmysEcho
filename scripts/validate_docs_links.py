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
FENCED_CODE_BLOCK_START_RE = re.compile(r"^[ \t]*([`~]{3,})")


def normalize_link(link: str) -> str:
    link = link.strip()
    if link.startswith('<') and link.endswith('>'):
        link = link[1:-1].strip()
    return unquote(link).split('#', 1)[0].split('?', 1)[0]


def strip_fenced_code_blocks(text: str) -> tuple[str, bool]:
    stripped_lines: list[str] = []
    pending_fence_lines: list[str] = []
    active_fence_char = ''
    active_fence_len = 0

    for line in text.splitlines(keepends=True):
        fence_match = FENCED_CODE_BLOCK_START_RE.match(line)
        if active_fence_char:
            pending_fence_lines.append(line)
            if (
                fence_match
                and fence_match.group(1).startswith(active_fence_char)
                and len(fence_match.group(1)) >= active_fence_len
            ):
                active_fence_char = ''
                active_fence_len = 0
                pending_fence_lines = []
            continue

        if fence_match:
            active_fence_char = fence_match.group(1)[0]
            active_fence_len = len(fence_match.group(1))
            pending_fence_lines = [line]
            continue

        stripped_lines.append(line)

    if pending_fence_lines:
        stripped_lines.extend(pending_fence_lines)

    return ''.join(stripped_lines), bool(pending_fence_lines)


def is_external(link: str) -> bool:
    return (
        link.startswith('http://')
        or link.startswith('https://')
        or link.startswith('mailto:')
        or link.startswith('#')
    )


def validate() -> tuple[list[tuple[Path, str]], list[Path], list[Path]]:
    broken: list[tuple[Path, str]] = []
    encoding_warnings: list[Path] = []
    fence_warnings: list[Path] = []
    for md_file in DOCS_ROOT.rglob('*.md'):
        raw_text = md_file.read_text(encoding='utf-8', errors='replace')
        if '\ufffd' in raw_text:
            encoding_warnings.append(md_file.relative_to(REPO_ROOT))
        text, had_unclosed_fence = strip_fenced_code_blocks(raw_text)
        if had_unclosed_fence:
            fence_warnings.append(md_file.relative_to(REPO_ROOT))
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
    return broken, encoding_warnings, fence_warnings


def main() -> int:
    broken, encoding_warnings, fence_warnings = validate()
    if encoding_warnings:
        print(f'Docs link validation: WARNING (replacement characters detected in {len(encoding_warnings)} markdown file(s)).')
        for md_file in encoding_warnings:
            print(f'- encoding issue detected while reading {md_file}')
    if fence_warnings:
        print(f'Docs link validation: WARNING (unclosed fenced code blocks detected in {len(fence_warnings)} markdown file(s)).')
        for md_file in fence_warnings:
            print(f'- unclosed fenced code block detected in {md_file}')

    if not broken:
        print('Docs link validation: OK (no broken local links found).')
        return 0

    print(f'Docs link validation: FAIL ({len(broken)} broken local links).')
    for md_file, link in broken:
        print(f'- {md_file}: {link}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
