const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p));

/* PNG 머리 부분에서 가로·세로와 색 형식을 읽는다 (IHDR: 너비 16~19, 높이 20~23, 색 형식 25번째 바이트) */
function pngInfo(file) {
  const buf = read(file);
  assert.equal(buf.toString("hex", 0, 8), "89504e470d0a1a0a", file + " is not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

function linkHref(html, rel) {
  const m = html.match(new RegExp('<link[^>]*rel="' + rel + '"[^>]*href="([^"]+)"'));
  return m && m[1];
}

test("png icons have the sizes phones ask for and no transparency", () => {
  for (const [file, size] of [["icons/apple-touch-icon.png", 180], ["icons/icon-192.png", 192], ["icons/icon-512.png", 512]]) {
    const info = pngInfo(file);
    assert.equal(info.width, size, file);
    assert.equal(info.height, size, file);
    // 2 = RGB(투명 없음). iOS는 투명 부분을 검게 칠하므로 불투명이어야 한다
    assert.equal(info.colorType, 2, file + " should be opaque RGB");
  }
});

test("svg source exists and draws a dumbbell", () => {
  const svg = read("icons/icon.svg").toString("utf8");
  assert.match(svg, /<svg[^>]*viewBox="0 0 512 512"/);
  assert.match(svg, /id="dumbbell"/);
});

test("index.html links favicon, apple touch icon and manifest to real files", () => {
  const html = read("index.html").toString("utf8");
  for (const rel of ["icon", "apple-touch-icon", "manifest"]) {
    const href = linkHref(html, rel);
    assert.ok(href, "missing <link rel=\"" + rel + "\">");
    assert.ok(fs.existsSync(path.join(ROOT, href)), rel + " points to missing " + href);
  }
});

test("manifest lists 192 and 512 icons that exist, usable as maskable", () => {
  const manifest = JSON.parse(read("manifest.webmanifest").toString("utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  const sizes = manifest.icons.map((i) => i.sizes).sort();
  assert.deepEqual(sizes, ["192x192", "512x512"]);
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, icon.src)), "missing " + icon.src);
    assert.match(icon.purpose, /maskable/);
    assert.equal(pngInfo(icon.src).width + "x" + pngInfo(icon.src).height, icon.sizes);
  }
});
