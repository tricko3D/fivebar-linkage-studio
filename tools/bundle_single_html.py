#!/usr/bin/env python3
"""Bundle Fivebar Linkage Studio into a standalone HTML preview.

Run from the repository root:
    python3 tools/bundle_single_html.py --output fivebar-preview.html

By default, local CSS/JS and the external Lucide script are embedded.
Use --allow-cdn to keep external script URLs without downloading them.
"""
from __future__ import annotations

import argparse
import html
import re
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

LINK_RE = re.compile(r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])[^>]*>', re.I)
SCRIPT_RE = re.compile(r'<script\b[^>]*\bsrc=["\'][^"\']+["\'][^>]*>\s*</script>', re.I | re.S)
ATTR_RE = re.compile(r'([\w-]+)\s*=\s*(["\'])(.*?)\2', re.S)


def attributes(tag: str) -> dict[str, str]:
    return {key.lower(): html.unescape(value) for key, _, value in ATTR_RE.findall(tag)}


def bundle(root: Path, document: str, allow_cdn: bool) -> str:
    root = root.resolve()

    def local_file(value: str) -> Path:
        source = (root / value).resolve()
        if not source.is_relative_to(root):
            raise ValueError(f'Asset escapes repository root: {value}')
        return source

    def stylesheet(match: re.Match[str]) -> str:
        attrs = attributes(match.group())
        href = attrs.get('href')
        if not href:
            return match.group()
        if urlparse(href).scheme:
            if allow_cdn:
                return match.group()
            raise ValueError(f'External stylesheet not bundled: {href}')
        code = local_file(href).read_text(encoding='utf-8')
        code = re.sub(r'</style', r'<\\/style', code, flags=re.I)
        return f'<style data-source="{html.escape(href, quote=True)}">\n{code}\n</style>'

    def javascript(match: re.Match[str]) -> str:
        original = match.group()
        attrs = attributes(original.split('>', 1)[0])
        src = attrs['src']
        url = urlparse(src)
        if url.scheme:
            if allow_cdn:
                return original
            if url.scheme != 'https':
                raise ValueError(f'Non-HTTPS remote script: {src}')
            request = urllib.request.Request(src, headers={
                'User-Agent': 'Fivebar Studio Bundler/1.0',
            })
            with urllib.request.urlopen(request, timeout=25) as response:
                code = response.read().decode('utf-8')
        else:
            code = local_file(src).read_text(encoding='utf-8')
        code = re.sub(r'</script', r'<\\/script', code, flags=re.I)
        onload = attrs.get('onload')
        if onload:
            code += '\n;' + onload + '\n'
        return f'<script data-source="{html.escape(src, quote=True)}">\n{code}\n</script>'

    document = LINK_RE.sub(stylesheet, document)
    return SCRIPT_RE.sub(javascript, document)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'), help='Repository root')
    parser.add_argument('--output', type=Path, default=Path('fivebar-preview.html'))
    parser.add_argument('--allow-cdn', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    document = (root / 'index.html').read_text(encoding='utf-8')
    bundled = bundle(root, document, args.allow_cdn)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(bundled, encoding='utf-8')
    print(f'Created {args.output} ({len(bundled.encode("utf-8")):,} bytes)')


if __name__ == '__main__':
    main()
