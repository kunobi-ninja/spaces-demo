import * as React from 'react'

/** Un texto con partes **en negrita**, como fragmentos de React. */
export function Rico({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/).map((parte, i) => (parte.startsWith('**') ? <b key={i}>{parte.slice(2, -2)}</b> : parte))}
    </>
  )
}
