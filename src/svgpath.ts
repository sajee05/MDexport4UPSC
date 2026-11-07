/** Minimal SVG path / shape -> absolute M/L/C/Z segments. */
export type Seg =
  | ["M", number, number]
  | ["L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Z"];

export function parsePath(d: string): Seg[] {
  const out: Seg[] = [];
  let i = 0;
  const n = d.length;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lastCtrlX = 0, lastCtrlY = 0, lastCmd = "";
  const ws = () => { while (i < n && /[\s,]/.test(d[i])) i++; };
  const num = (): number => {
    ws();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 32));
    if (!m) throw new Error("bad path");
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const flag = (): number => { ws(); const f = d[i] === "1" ? 1 : 0; i++; return f; };
  const hasNum = () => { ws(); return i < n && /[-+.\d]/.test(d[i]); };

  let cmd = "";
  try {
    while (true) {
      ws();
      if (i >= n) break;
      if (/[A-Za-z]/.test(d[i])) cmd = d[i++];
      else if (!cmd) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "Z") {
        out.push(["Z"]); cx = sx; cy = sy; lastCmd = "Z";
        continue;
      }
      do {
        if (C === "M") {
          let x = num(), y = num();
          if (rel) { x += cx; y += cy; }
          out.push(["M", x, y]); cx = sx = x; cy = sy = y;
          cmd = rel ? "l" : "L"; // subsequent pairs are implicit lineto
          lastCmd = "M";
          break;
        } else if (C === "L") {
          let x = num(), y = num(); if (rel) { x += cx; y += cy; }
          out.push(["L", x, y]); cx = x; cy = y;
        } else if (C === "H") {
          let x = num(); if (rel) x += cx; out.push(["L", x, cy]); cx = x;
        } else if (C === "V") {
          let y = num(); if (rel) y += cy; out.push(["L", cx, y]); cy = y;
        } else if (C === "C") {
          let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
          if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
          out.push(["C", x1, y1, x2, y2, x, y]); lastCtrlX = x2; lastCtrlY = y2; cx = x; cy = y;
        } else if (C === "S") {
          let x2 = num(), y2 = num(), x = num(), y = num();
          if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
          const smooth = lastCmd === "C" || lastCmd === "S";
          const x1 = smooth ? 2 * cx - lastCtrlX : cx, y1 = smooth ? 2 * cy - lastCtrlY : cy;
          out.push(["C", x1, y1, x2, y2, x, y]); lastCtrlX = x2; lastCtrlY = y2; cx = x; cy = y;
        } else if (C === "Q") {
          let qx = num(), qy = num(), x = num(), y = num();
          if (rel) { qx += cx; qy += cy; x += cx; y += cy; }
          out.push(quad(cx, cy, qx, qy, x, y)); lastCtrlX = qx; lastCtrlY = qy; cx = x; cy = y;
        } else if (C === "T") {
          let x = num(), y = num(); if (rel) { x += cx; y += cy; }
          const smooth = lastCmd === "Q" || lastCmd === "T";
          const qx = smooth ? 2 * cx - lastCtrlX : cx, qy = smooth ? 2 * cy - lastCtrlY : cy;
          out.push(quad(cx, cy, qx, qy, x, y)); lastCtrlX = qx; lastCtrlY = qy; cx = x; cy = y;
        } else if (C === "A") {
          const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag();
          let x = num(), y = num(); if (rel) { x += cx; y += cy; }
          arc(out, cx, cy, rx, ry, rot, fa, fs, x, y); cx = x; cy = y;
        } else { i = n; break; }
        lastCmd = C === "L" || C === "H" || C === "V" ? "L" : C;
      } while (hasNum());
    }
  } catch { /* keep what we parsed */ }
  return out;
}

function quad(x0: number, y0: number, qx: number, qy: number, x: number, y: number): Seg {
  return ["C", x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y];
}

function arc(out: Seg[], x1: number, y1: number, rx: number, ry: number, rotDeg: number, fa: number, fs: number, x2: number, y2: number) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) { out.push(["L", x2, y2]); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  if (fs && dth < 0) dth += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
  const step = dth / segs;
  const t = (4 / 3) * Math.tan(step / 4);
  let a = th1;
  for (let s = 0; s < segs; s++) {
    const a2 = a + step;
    const p = (ang_: number, dx_: number, dy_: number) => {
      const ca = Math.cos(ang_), sa = Math.sin(ang_);
      const ex = rx * (ca - dx_ * sa), ey = ry * (sa + dy_ * ca);
      return [cp * ex - sp * ey + cx, sp * ex + cp * ey + cy];
    };
    const c1 = p(a, t, t), c2 = p(a2, -t, -t), e = p(a2, 0, 0);
    out.push(["C", c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
    a = a2;
  }
}

const K = 0.5522847498;
export function ellipseSegs(cx: number, cy: number, rx: number, ry: number): Seg[] {
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry],
    ["C", cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy],
    ["C", cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry],
    ["C", cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy],
    ["Z"],
  ];
}

export function roundRectSegs(x: number, y: number, w: number, h: number, rx: number, ry: number): Seg[] {
  rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0) return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
  return [
    ["M", x + rx, y],
    ["L", x + w - rx, y],
    ["C", x + w - rx + K * rx, y, x + w, y + ry - K * ry, x + w, y + ry],
    ["L", x + w, y + h - ry],
    ["C", x + w, y + h - ry + K * ry, x + w - rx + K * rx, y + h, x + w - rx, y + h],
    ["L", x + rx, y + h],
    ["C", x + rx - K * rx, y + h, x, y + h - ry + K * ry, x, y + h - ry],
    ["L", x, y + ry],
    ["C", x, y + ry - K * ry, x + rx - K * rx, y, x + rx, y],
    ["Z"],
  ];
}

/** Start/end points and tangent angles of a segment list (for SVG markers). */
export function endpoints(segs: Seg[]): { start: [number, number, number]; end: [number, number, number] } | null {
  let first: Seg | undefined, second: Seg | undefined;
  const pts: number[][] = [];
  let cx = 0, cy = 0;
  for (const s of segs) {
    if (s[0] === "M" || s[0] === "L") { pts.push([cx, cy, s[1], s[2]]); cx = s[1]; cy = s[2]; }
    else if (s[0] === "C") { pts.push([s[3], s[4], s[5], s[6], cx, cy]); cx = s[5]; cy = s[6]; }
  }
  void first; void second;
  if (!pts.length) return null;
  const m0 = segs.find((s) => s[0] === "M") as ["M", number, number] | undefined;
  if (!m0) return null;
  // start tangent: towards next drawable segment
  let sa = 0;
  const nxt = segs.find((s, idx) => idx > 0 && (s[0] === "L" || s[0] === "C"));
  if (nxt) {
    const tx = nxt[0] === "C" ? nxt[1] : (nxt as ["L", number, number])[1];
    const ty = nxt[0] === "C" ? nxt[2] : (nxt as ["L", number, number])[2];
    sa = Math.atan2(ty - m0[2], tx - m0[1]);
  }
  // end tangent from the last drawable segment
  let ea = 0, ex = m0[1], ey = m0[2];
  let px = m0[1], py = m0[2];
  for (const s of segs) {
    if (s[0] === "M") { px = s[1]; py = s[2]; ex = px; ey = py; }
    else if (s[0] === "L") { ea = Math.atan2(s[2] - py, s[1] - px); px = ex = s[1]; py = ey = s[2]; }
    else if (s[0] === "C") {
      const fx = s[3] === s[5] && s[4] === s[6] ? s[1] : s[3], fy = s[3] === s[5] && s[4] === s[6] ? s[2] : s[4];
      ea = Math.atan2(s[6] - fy, s[5] - fx); px = ex = s[5]; py = ey = s[6];
    }
  }
  return { start: [m0[1], m0[2], sa], end: [ex, ey, ea] };
}
