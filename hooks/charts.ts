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

// Our own small Claude mark on the same 16-unit square: the app's terracotta tile and its cream spark, nine
// uneven rays that widen toward rounded tips, as in the logo; legible where the app's own icon blurs.
export const CLAUDE_MARK =
  '<rect width="16" height="16" rx="4.5" fill="#D97757"/>' +
  '<path d="M8.45 7.19L9.93 3.98A0.82 0.82 0 0 0 8.34 3.56L8.02 7.07ZM8.88 7.71L13.17 5.74A0.82 0.82 0 0 0 12.30 4.35L8.65 7.34ZM8.89 8.27L12.73 9.07A0.82 0.82 0 0 0 12.82 7.43L8.91 7.83ZM8.42 8.82L10.12 11.69A0.82 0.82 0 0 0 11.36 10.62L8.76 8.53ZM7.91 8.92L7.96 13.64A0.82 0.82 0 0 0 9.59 13.41L8.34 8.86ZM7.28 8.59L4.41 11.40A0.82 0.82 0 0 0 5.72 12.39L7.63 8.85ZM7.08 8.08L2.17 9.14A0.82 0.82 0 0 0 2.71 10.69L7.22 8.50ZM7.31 7.38L4.52 5.22A0.82 0.82 0 0 0 3.75 6.67L7.10 7.77ZM7.80 7.09L6.33 2.72A0.82 0.82 0 0 0 4.86 3.43L7.41 7.29Z" fill="#FAF6EF"/><circle cx="8" cy="8" r="1.1" fill="#FAF6EF"/>'

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
