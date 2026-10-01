from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "sobers-pizza" / "official-products"
DIST = ROOT / "dist" / "assets" / "sobers-pizza" / "official-products"
MAX_EDGE = 1200


def optimize(source: Path, destination: Path) -> None:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=82, method=6, optimize=True)


for png in SOURCE.glob("*.png"):
    webp = png.with_suffix(".webp")
    optimize(png, webp)
    optimize(png, DIST / webp.name)

