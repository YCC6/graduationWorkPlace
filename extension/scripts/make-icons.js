/**
 * 生成扩展图标 PNG（无第三方依赖，手写 PNG 编码）
 * 用法：node extension/scripts/make-icons.js
 *
 * 图案：蓝色渐变圆角方块 + 白色书签，16px 下仍可辨识。
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------------- CRC32 ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------- PNG 组装 ---------------- */

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array，长度 = w*h*4 */
function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // 每行前加一个 filter byte(0 = None)
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy
      ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
      : Buffer.from(rgba.slice(y * w * 4, (y + 1) * w * 4)).copy(
          raw,
          y * (w * 4 + 1) + 1
        );
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 绘制 ---------------- */

const SS = 4; // 超采样倍数，用于抗锯齿

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 判断点是否在圆角矩形内 */
function inRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * 书签形状：顶部矩形，底部中间一个 V 形缺口
 * 归一化坐标（0~1）
 */
function inBookmark(nx, ny) {
  const left = 0.31;
  const right = 0.69;
  const top = 0.22;
  const bottom = 0.78;
  const notchDepth = 0.16;

  if (nx < left || nx > right || ny < top || ny > bottom) return false;

  // 底部 V 形缺口：越靠中间，缺口越深
  const midX = (left + right) / 2;
  const distFromMid = Math.abs(nx - midX) / ((right - left) / 2); // 0(中心)~1(边缘)
  const notchY = bottom - notchDepth * (1 - distFromMid);

  return ny <= notchY;
}

function renderIcon(size) {
  const S = size * SS;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      // 超采样
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;

          const inBg = inRoundRect(px, py, S, S, S * 0.22);
          if (!inBg) continue;

          const nx = px / S;
          const ny = py / S;

          let r;
          let g;
          let b;

          if (inBookmark(nx, ny)) {
            // 白色书签
            r = 255;
            g = 255;
            b = 255;
          } else {
            // 蓝色对角渐变 #2563eb → #1d4ed8
            const t = (nx + ny) / 2;
            r = lerp(0x25, 0x1d, t);
            g = lerp(0x63, 0x4e, t);
            b = lerp(0xeb, 0xd8, t);
          }

          rSum += r;
          gSum += g;
          bSum += b;
          aSum += 255;
        }
      }

      const n = SS * SS;
      const idx = (y * size + x) * 4;
      const alpha = aSum / n;

      if (alpha > 0) {
        // 用覆盖到的子样本数做颜色平均（避免边缘发暗）
        const covered = aSum / 255;
        rgba[idx] = Math.round(rSum / covered);
        rgba[idx + 1] = Math.round(gSum / covered);
        rgba[idx + 2] = Math.round(bSum / covered);
        rgba[idx + 3] = Math.round(alpha);
      } else {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  return encodePng(rgba, size, size);
}

/* ---------------- 输出 ---------------- */

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });

[16, 32, 48, 128].forEach((size) => {
  const png = renderIcon(size);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ ${file} (${png.length} bytes)`);
});

console.log("图标生成完毕");
