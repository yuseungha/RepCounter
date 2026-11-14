"""icons/icon.svg 하나로 홈 화면용 PNG 아이콘 3개를 만든다.

SVG를 Microsoft Edge(헤드리스)로 1024px 크기로 찍은 뒤 Pillow로 줄인다.
크게 찍고 줄이면 가장자리가 부드럽게 나온다.

    python 10_RepCounter/tools/make_icons.py

필요: Windows의 Microsoft Edge, Pillow(pip install pillow)
"""
from pathlib import Path
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
OUTPUTS = {"icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180}
EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]
RENDER = 1024  # 찍는 크기(px). 512 창을 2배 배율로 찍는다


def find_edge() -> Path:
    for path in EDGE_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Microsoft Edge를 찾지 못함")


def render_svg(svg: Path, out_png: Path, work: Path) -> None:
    page = work / "icon.html"
    page.write_text(
        "<!doctype html><meta charset='utf-8'>"
        "<style>html,body{margin:0;overflow:hidden;background:#000}"
        "svg{display:block;width:512px;height:512px}</style>"
        + svg.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    subprocess.run(
        [
            str(find_edge()),
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            f"--user-data-dir={work / 'profile'}",
            "--force-device-scale-factor=2",
            "--window-size=512,512",
            f"--screenshot={out_png}",
            page.as_uri(),
        ],
        check=True,
        capture_output=True,
        timeout=60,
    )


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shot = work / "shot.png"
        render_svg(ICONS / "icon.svg", shot, work)
        with Image.open(shot) as raw:
            if raw.size != (RENDER, RENDER):
                raise SystemExit(f"렌더링 크기가 {raw.size}, 기대값 {(RENDER, RENDER)}")
            base = raw.convert("RGB")  # 투명 없음: iOS는 투명 부분을 검게 칠한다

    for name, size in OUTPUTS.items():
        target = ICONS / name
        base.resize((size, size), Image.LANCZOS).save(target, optimize=True)
        print(f"{target.relative_to(ROOT)}  {size}x{size}")


if __name__ == "__main__":
    main()
