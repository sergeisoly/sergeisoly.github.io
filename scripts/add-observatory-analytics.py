"""Include the site's GoatCounter script in the standalone Observatory build."""

from os import environ
from pathlib import Path


page = Path(environ["QUARTO_PROJECT_OUTPUT_DIR"]) / "piramid-observatory/index.html"
if not page.is_file() and environ.get("QUARTO_PROJECT_RENDER_ALL") != "1":
    raise SystemExit(0)

tracker = Path("_includes/goatcounter.html").read_text(encoding="utf-8")
html = page.read_text(encoding="utf-8")

if tracker not in html:
    if "</head>" not in html or "data-goatcounter=" in html:
        raise SystemExit(f"Cannot add the site's GoatCounter script to {page}")
    page.write_text(html.replace("</head>", tracker + "</head>", 1), encoding="utf-8")
