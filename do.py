from pathlib import Path

p = Path("docs/app.js")
s = p.read_text()

s = s.replace(
    "const MIN_ZOOM = 0.004;",
    "const MIN_ZOOM = 0.00016;"
)

p.write_text(s)