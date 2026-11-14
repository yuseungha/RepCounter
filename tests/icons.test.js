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

/* 왼쪽 위 첫 픽셀의 RGB. 첫 줄 첫 픽셀은 PNG 필터 종류와 상관없이 원래 값 그대로 저장된다 */
function firstPixel(file) {
  const buf = read(file);
  const chunks = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") chunks.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = require("node:zlib").inflateSync(Buffer.concat(chunks));
  return [raw[1], raw[2], raw[3]]; // raw[0]은 줄마다 붙는 필터 종류 바이트
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

test("icon background is a clean neutral gray", () => {
  for (const file of ["icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"]) {
    const [r, g, b] = firstPixel(file);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 6, file + " corner is not gray: " + [r, g, b]);
    assert.ok(r >= 120 && r <= 245, file + " corner gray is too dark or white: " + r);
  }
  const svg = read("icons/icon.svg").toString("utf8");
  assert.doesNotMatch(svg, /id="bg"/, "background gradient should be gone");
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
