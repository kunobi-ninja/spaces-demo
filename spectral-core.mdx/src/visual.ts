import { Container, Graphics, Rectangle } from 'pixi.js'
import { defineVisual } from '@vixi/vx'
import { fitText, keyframes, safeArea, text } from '@vixi/helpers'
import { createOpticalFilter } from './optics'

interface SpectralProps {
  edition: string
  phases: [string, string, string]
  appear: number
  visible: number
  disperse: number
  spectrum: number
  open: number
  exposed: number
  close: number
  closed: number
}

export const SpectralCore = defineVisual<SpectralProps>({
  name: 'SpectralCore',
  times: { appear: 'at', visible: 'at', disperse: 'at', spectrum: 'at', open: 'at', exposed: 'at', close: 'at', closed: 'at' },
  create(p, ctx) {
    const u = Math.min(ctx.width, ctx.height) / 540
    const inset = ctx.target?.safeArea ?? { top: 0, bottom: 0, left: 0, right: 0 }
    const box = safeArea(ctx.width, ctx.height, {
      top: inset.top + 30 * u, bottom: inset.bottom + 28 * u,
      left: inset.left + 34 * u, right: inset.right + 34 * u,
    })
    const stacked = ctx.height >= ctx.width * 0.9
    const square = Math.abs(ctx.width / ctx.height - 1) < 0.15
    const root = new Container({ label: 'spectral-core' })
    const art = new Container({ label: 'filtered-artwork' })
    art.addChild(new Graphics().rect(0, 0, ctx.width, ctx.height).fill(0x060d18))
    const center: [number, number] = square ? [0.5, 0.65] : stacked ? [0.5, 0.59] : [0.68, 0.52]
    const { filter, uniforms } = createOpticalFilter(ctx.width, ctx.height, center, square ? 3.15 : 2.4)
    art.filterArea = new Rectangle(0, 0, ctx.width, ctx.height)
    art.filters = [filter]
    root.addChild(art)

    const edition = text(p.edition, { font: 'monospace', size: 10 * u, tracking: 1.7 * u, color: 0xacb8c7 })
    edition.position.set(box.x, box.y)
    const headline = fitText(ctx.scene.blocks.find(b => b.tag === 'h1')?.text ?? '', {
      font: 'sans-serif', weight: '700', size: (stacked ? 51 : 69) * u, minSize: 35 * u,
      width: stacked ? box.width : box.width * 0.37,
      height: (stacked ? 85 : 190) * u, maxLines: stacked ? 1 : 2, color: 0xede9dd,
    })
    headline.position.set(box.x, stacked ? box.y + 52 * u : ctx.height * 0.31)
    const detail = fitText(ctx.scene.blocks.find(b => b.tag === 'p')?.text ?? '', {
      font: 'sans-serif', size: 15 * u, minSize: 12 * u,
      width: stacked ? Math.min(box.width, 370 * u) : box.width * 0.29,
      height: 65 * u, maxLines: 3, color: 0x91a6b9,
    })
    detail.position.set(box.x, headline.y + headline.height + 22 * u)
    const phase = text(p.phases[0], { font: 'monospace', size: 10 * u, tracking: 0.5 * u, color: 0xacb8c7 })
    phase.position.set(box.x, box.y + box.height - 12 * u)
    root.addChild(edition, headline, detail, phase)
    const progress = new Graphics().rect(0, 0, 60 * u, 2 * u).fill(0x86b9d0)
    progress.position.set(box.x + box.width - 60 * u, phase.y + 5 * u)
    root.addChild(progress)
    const smooth = (v: number) => v * v * (3 - 2 * v)
    const reveal = keyframes([{ at: 0, value: 0 }, { at: p.appear, value: 0 }, { at: p.visible, value: 1, ease: smooth }])
    const dispersion = keyframes([{ at: 0, value: 0 }, { at: p.disperse, value: 0 }, { at: p.spectrum, value: 2.4, ease: smooth }])
    const opening = keyframes([
      { at: 0, value: 0 }, { at: p.open, value: 0 }, { at: p.exposed, value: 1, ease: smooth },
      { at: p.close, value: 1 }, { at: p.closed, value: 0, ease: smooth },
    ])
    return {
      root,
      seek(t) {
        uniforms.uTime = t
        uniforms.uReveal = reveal(t)
        uniforms.uDispersion = dispersion(t)
        uniforms.uOpening = opening(t)
        filter.enabled = uniforms.uReveal > 0
        phase.text = t < p.open ? p.phases[0] : t < p.close ? p.phases[1] : p.phases[2]
        progress.scale.x = Math.max(0, Math.min(1, t / ctx.scene.duration))
      },
      destroy() {
        art.filters = []
        filter.destroy()
        root.destroy({ children: true })
      },
    }
  },
})
