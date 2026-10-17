// Small SVG documents for the Svg element: drawn as images, so every color is written in.
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

// One horizontal bar split into parts by value; parts with no value are left out.
export function stackBar(parts: { v: number; color: string }[], w = 360, h = 8) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1
  let x = 0
  const rects = parts
    .filter(p => p.v > 0)
    .map(p => {
      const pw = Math.max(1.5, (p.v / total) * w)
      const r = `<rect x="${x.toFixed(1)}" y="0" width="${pw.toFixed(1)}" height="${h}" fill="${p.color}"/>`
      x += pw
      return r
    })
  return svg(w, h, `<clipPath id="c"><rect width="${w}" height="${h}" rx="${h / 2}"/></clipPath><g clip-path="url(#c)"><rect width="${w}" height="${h}" fill="#8a90a033"/>${rects.join('')}</g>`)
}

// A filled share of a track, 0..1.
export function meter(share: number, color: string, w = 360, h = 8) {
  const f = Math.max(0, Math.min(1, share))
  return svg(w, h, `<rect width="${w}" height="${h}" rx="${h / 2}" fill="#8a90a033"/><rect width="${(f * w).toFixed(1)}" height="${h}" rx="${h / 2}" fill="${color}"/>`)
}

// Area sparkline of a series, faint baseline, the last point marked.
export function sparkline(series: number[], color: string, w = 360, h = 40) {
  if (series.length < 2) return svg(w, h, `<line x1="0" y1="${h - 1}" x2="${w}" y2="${h - 1}" stroke="#8a90a055"/>`)
  const max = Math.max(...series, 1)
  const step = w / (series.length - 1)
  const pts = series.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]!
  return svg(
    w, h,
    `<line x1="0" y1="${h - 1}" x2="${w}" y2="${h - 1}" stroke="#8a90a055"/>` +
      `<path d="${line} L${w} ${h} L0 ${h} Z" fill="${color}" fill-opacity="0.18"/>` +
      `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="${color}"/>`,
  )
}

// Our own small Codex mark on a 16-unit square: the app's blue-violet cloud (a disc ringed by seven round lobes) and a
// white prompt. The app's icon
// files carry a solid plate that turns into a dark or white blob at 10 px.
export const CODEX_MARK =
  '<defs><linearGradient id="cx" gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="0" y2="15"><stop offset="0" stop-color="#b58cff"/><stop offset="1" stop-color="#3d5afe"/></linearGradient></defs>' +
  '<g fill="url(#cx)"><circle cx="8" cy="8" r="5.6"/><circle cx="8.00" cy="3.60" r="3.4"/><circle cx="11.44" cy="5.26" r="3.4"/><circle cx="12.29" cy="8.98" r="3.4"/><circle cx="9.91" cy="11.96" r="3.4"/><circle cx="6.09" cy="11.96" r="3.4"/><circle cx="3.71" cy="8.98" r="3.4"/><circle cx="4.56" cy="5.26" r="3.4"/></g>' +
  '<path d="M5 5.6 L7.6 8 L5 10.4 M8.9 10.5 H11.4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'

// Our own small Claude mark on the same 16-unit square: the app's terracotta tile and its cream spark, eleven
// uneven rays that widen toward rounded tips, as in the logo; legible where the app's own icon blurs.
export const CLAUDE_MARK =
  '<rect width="16" height="16" rx="4.5" fill="#D97757"/>' +
  '<path d="M8.14 7.08L8.30 2.07A0.82 0.82 0 0 0 6.67 2.21L7.70 7.12ZM8.64 7.33L10.90 4.62A0.82 0.82 0 0 0 9.48 3.80L8.26 7.11ZM8.90 7.77L13.31 6.10A0.82 0.82 0 0 0 12.54 4.66L8.69 7.38ZM8.86 8.34L12.62 9.48A0.82 0.82 0 0 0 12.85 7.85L8.92 7.91ZM8.55 8.75L12.05 12.47A0.82 0.82 0 0 0 13.11 11.22L8.83 8.41ZM8.07 8.92L8.51 12.23A0.82 0.82 0 0 0 10.07 11.72L8.49 8.79ZM7.51 8.79L5.50 13.05A0.82 0.82 0 0 0 7.06 13.56L7.93 8.92ZM7.16 8.38L3.65 10.36A0.82 0.82 0 0 0 4.66 11.65L7.43 8.73ZM7.09 7.84L2.08 7.59A0.82 0.82 0 0 0 2.19 9.23L7.12 8.28ZM7.35 7.34L4.72 4.98A0.82 0.82 0 0 0 3.85 6.37L7.12 7.71ZM7.80 7.09L6.33 2.72A0.82 0.82 0 0 0 4.86 3.43L7.41 7.29Z" fill="#FAF6EF"/><circle cx="8" cy="8" r="1.1" fill="#FAF6EF"/>'

// A bold chevron for the fold toggle, pointing down (open) or right (folded), centered in a 12 × 18 box so it
// sits on the text line. Drawn because the text chevrons are either thin or hang off the baseline.
export function chevron(open: boolean, color: string) {
  const d = open ? 'M2.5 7 L6 10.5 L9.5 7' : 'M4.5 5.5 L8 9 L4.5 12.5'
  return svg(12, 18, `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`)
}

// A low pill on a gray rounded track: an optional icon first (an image URL, or SVG markup on a 16-unit square),
// then one square per item in its color, or each group's count as bold digits.
export function chip(parts: { n: number; color: string }[], asCounts: boolean, icon?: string, h = 16) {
  const pad = 6, sq = 9, gap = 2, digit = 7.5, space = 5, ic = h - 3
  let x = icon ? 2 : pad
  const head = !icon ? ''
    : icon.startsWith('<') ? `<svg x="${x}" y="${(h - ic) / 2}" width="${ic}" height="${ic}" viewBox="0 0 16 16">${icon}</svg>`
    : `<image x="${x}" y="${(h - ic) / 2}" width="${ic}" height="${ic}" href="${icon}"/>`
  if (icon) x += ic + 3
  const marks = parts.filter(p => p.n > 0).map(p => {
    if (asCounts) {
      const s = String(p.n)
      const t = `<text x="${x}" y="${h - 4}" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="700" fill="${p.color}">${s}</text>`
      x += s.length * digit + space
      return t
    }
    return Array.from({ length: p.n }, () => {
      const r = `<rect x="${x}" y="${(h - sq) / 2}" width="${sq}" height="${sq}" rx="1.5" fill="${p.color}"/>`
      x += sq + gap
      return r
    }).join('')
  })
  const w = Math.round(x - (asCounts ? space : gap) + pad)
  return { w, h, source: svg(w, h, `<rect width="${w}" height="${h}" rx="${h / 2}" fill="#8a90a033"/>${head}${marks.join('')}`) }
}
