#!/usr/bin/env python3
"""Download landing images from Figma MCP asset URLs and save as WebP."""
import io
import json
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

# Figma frame 1129:2 — mapped to repo filenames
DOWNLOADS = {
    "hero-main.webp": "https://www.figma.com/api/mcp/asset/c7da1e3f-402a-4471-be82-6e752bde5056.png",
    "audience-bg.webp": "https://www.figma.com/api/mcp/asset/6102b1d3-21bc-445e-885d-2087bddb02b5.png",
    "card-01.webp": "https://www.figma.com/api/mcp/asset/b65a5ec4-7c96-48c1-9358-3cba4effcd27.png",
    "card-02.webp": "https://www.figma.com/api/mcp/asset/b2a36483-14b1-429d-a1db-6ad68dffeafa.png",
    "card-03.webp": "https://www.figma.com/api/mcp/asset/cc92ffbe-46ba-492c-ab49-23e78e411d37.png",
    "card-04.webp": "https://www.figma.com/api/mcp/asset/c96e907e-6d6a-445c-8cc7-a323e720042a.png",
    "path-a.webp": "https://www.figma.com/api/mcp/asset/4d157819-5c13-4a82-9bc0-87bfc8cc674f.png",
    "path-b.webp": "https://www.figma.com/api/mcp/asset/0ab93b92-eb25-464b-9aeb-3430f22c0f6c.png",
    "program-photo.webp": "https://www.figma.com/api/mcp/asset/abed94c9-9998-4982-b343-c497319e494c.png",
    "skill/s1.webp": "https://www.figma.com/api/mcp/asset/b20a030f-3bd8-4d56-a933-e085dc71e9ab.png",
    "skill/s2.webp": "https://www.figma.com/api/mcp/asset/47e4a0e7-986b-49e3-9a35-6546e688cf6e.png",
    "skill/s3.webp": "https://www.figma.com/api/mcp/asset/bc8cf2d0-1892-42d2-a580-4200d17436c6.png",
    "skill/s4.webp": "https://www.figma.com/api/mcp/asset/cb4ccc17-4408-4e9a-ade8-6acb0439316b.png",
    "skill/s5.webp": "https://www.figma.com/api/mcp/asset/edf509b3-e5a0-488d-8862-db15d629cbc6.png",
    "speaker/hero.webp": "https://www.figma.com/api/mcp/asset/8da46566-126c-4076-8bfb-45257af22152.png",
    "reviews/accent-line.webp": "https://www.figma.com/api/mcp/asset/6bbb5f64-009a-4fd2-b5d3-30b7afc81d04.png",
    "reviews/olga.webp": "https://www.figma.com/api/mcp/asset/3bbfb99d-c873-4263-96f7-85d105550917.png",
    "reviews/dasha.webp": "https://www.figma.com/api/mcp/asset/a359c443-1eea-485c-8230-951955b4764f.png",
    "reviews/stas.webp": "https://www.figma.com/api/mcp/asset/b063f108-437d-42fd-a4c3-9ed8636ec249.png",
    "faq-photo.webp": "https://www.figma.com/api/mcp/asset/43bcb100-2d3b-42d6-865d-3a77da5cb186.png",
    "final/img-tl.webp": "https://www.figma.com/api/mcp/asset/c28a8f4f-9b16-45d9-911d-7f84669b0bcc.png",
    "final/img-bl.webp": "https://www.figma.com/api/mcp/asset/5f6c8cf4-abfe-4cc0-857e-4c3664e1e3e2.png",
    "final/img-tr.webp": "https://www.figma.com/api/mcp/asset/045e944a-ab4d-4fe2-a470-f51a168d44d9.png",
    "final/img-br.webp": "https://www.figma.com/api/mcp/asset/9e58da59-75c9-4e69-8594-8e8714f75949.png",
}

FORMAT_MOSAIC_URL = "https://www.figma.com/api/mcp/asset/1a2fb90a-a28e-4191-b867-899a48bfdb10.png"


def fetch_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; bi13-asset-sync/1.0)"})
    with urlopen(req) as resp:
        return resp.read()


def save_webp(img: Image.Image, dest: Path, quality: int = 85) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    img.save(dest, "WEBP", quality=quality, method=6)


def png_url_to_webp(url: str, dest: Path) -> None:
    data = fetch_bytes(url)
    img = Image.open(io.BytesIO(data))
    save_webp(img, dest)


def split_mosaic(url: str) -> list[str]:
    data = fetch_bytes(url)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    cw, ch = w // 3, h // 3
    out_dir = ASSETS / "format"
    out_dir.mkdir(parents=True, exist_ok=True)
    names = []
    idx = 1
    for row in range(3):
        for col in range(3):
            tile = img.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
            name = f"g{idx}.webp"
            save_webp(tile, out_dir / name)
            names.append(f"format/{name}")
            idx += 1
    save_webp(img, out_dir / "mosaic.webp")
    names.append("format/mosaic.webp")
    return names


def main() -> int:
    updated = []
    for rel, url in DOWNLOADS.items():
        dest = ASSETS / rel
        png_url_to_webp(url, dest)
        updated.append(rel)
        print(f"OK {rel}")

    updated.extend(split_mosaic(FORMAT_MOSAIC_URL))
    print("OK format mosaic → g1–g9 + mosaic.webp")

    manifest = ROOT / "scripts" / ".figma-assets-manifest.json"
    manifest.write_text(json.dumps({"frame": "1129:2", "updated": updated}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
