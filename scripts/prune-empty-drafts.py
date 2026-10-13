"""Remove only the empty HTML placeholders Quarto emits for unpublished drafts."""
from pathlib import Path
import re

for page in Path("_site/posts").glob("**/*.html"):
    if re.fullmatch(r"\s*<!DOCTYPE html>\s*<html[^>]*>\s*</html>\s*", page.read_text()):
        page.unlink()
