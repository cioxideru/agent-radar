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
