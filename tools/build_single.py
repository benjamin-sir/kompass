#!/usr/bin/env python3
"""Baut Kompass als eine einzige HTML-Datei (CSS und JS eingebettet).

    python3 tools/build_single.py            -> dist/kompass.html
    python3 tools/build_single.py --fragment  -> nur der Seiteninhalt ohne <html>/<head>
                                                 (für Vorschauen in Umgebungen, die das Gerüst selbst liefern)

Die Einzeldatei läuft auch per Doppelklick (file://) in Edge oder Chrome,
ohne Server und ohne Installation. Offline-Cache und "Als App installieren"
gibt es nur in der gehosteten Version.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app"


def read(rel):
    return (APP / rel).read_text(encoding="utf-8")


def build(fragment=False):
    html = read("index.html")
    css = read("styles.css")
    scripts = "\n".join(
        "<script>\n" + read(src).replace("</script", "<\\/script") + "\n</script>"
        for src in re.findall(r'<script src="([^"]+)"></script>', html)
    )
    body = re.search(r"<body>(.*?)<script", html, re.S).group(1).strip()
    icon = "data:image/svg+xml," + read("icons/icon.svg").strip().replace("#", "%23").replace('"', "'")

    if fragment:
        return (
            "<title>Kompass</title>\n"
            f'<link rel="icon" href="{icon}">\n'
            f"<style>\n{css}\n</style>\n{body}\n{scripts}\n"
        )
    return (
        '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<title>Kompass</title>\n"
        f'<link rel="icon" href="{icon}">\n'
        f"<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n{scripts}\n</body>\n</html>\n"
    )


if __name__ == "__main__":
    frag = "--fragment" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = pathlib.Path(args[0]) if args else ROOT / "dist" / ("kompass-fragment.html" if frag else "kompass.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(frag), encoding="utf-8")
    print(f"{out} ({out.stat().st_size // 1024} KB)")
