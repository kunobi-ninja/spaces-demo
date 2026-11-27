/*
 * Las losetas ilustradas como imágenes, para dibujarlas en un canvas: se pinta
 * cada una (sin girar) en un SVG oculto, se serializa y se rasteriza una vez.
 */

import * as React from 'react'
import { LosetaIlustrada } from './LosetaIlustrada'
import { TIPOS } from './losetas'

const LADO = 256

/** Las imágenes de todas las losetas por id, o null mientras se preparan. */
export function useAtlas(): { atlas: Map<string, CanvasImageSource> | null; oculto: React.ReactNode } {
  const ref = React.useRef<HTMLDivElement>(null)
  const [atlas, setAtlas] = React.useState<Map<string, CanvasImageSource> | null>(null)

  React.useEffect(() => {
    const caja = ref.current
    if (!caja || atlas) return
    let vivo = true
    const urls: string[] = []
    const svgs = [...caja.querySelectorAll<SVGSVGElement>('svg[data-loseta]')]
    Promise.all(
      svgs.map(
        (svg) =>
          new Promise<[string, CanvasImageSource] | null>((listo) => {
            try {
              const copia = svg.cloneNode(true) as SVGSVGElement
              copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
              copia.setAttribute('width', String(LADO))
              copia.setAttribute('height', String(LADO))
              const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: 'image/svg+xml' }))
              urls.push(url)
              const img = new Image()
              img.onload = () => {
                const lienzo = document.createElement('canvas')
                lienzo.width = LADO
                lienzo.height = LADO
                lienzo.getContext('2d')?.drawImage(img, 0, 0, LADO, LADO)
                listo([svg.dataset.loseta!, lienzo])
              }
              img.onerror = () => listo(null)
              img.src = url
            } catch {
              listo(null)
            }
          }),
      ),
    ).then((pares) => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      if (vivo) setAtlas(new Map(pares.filter((p): p is [string, CanvasImageSource] => !!p)))
    })
    return () => {
      vivo = false
    }
  }, [atlas])

  const oculto = atlas ? null : (
    <div ref={ref} aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {TIPOS.map((t) => (
        <span key={t.id} data-id={t.id}>
          <LosetaIlustrada id={t.id} tam={LADO} marca={t.id} />
        </span>
      ))}
    </div>
  )
  return { atlas, oculto }
}
