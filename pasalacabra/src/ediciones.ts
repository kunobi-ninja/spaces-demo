// Cada edición del juego en un solo sitio: sus preguntas (data/preguntas.<idioma>.json, con su
// abecedario y sus niveles) y su corrector. Para añadir una: su archivo en data/ y una entrada aquí.

import en from '../data/preguntas.en.json'
import es from '../data/preguntas.es.json'
import it from '../data/preguntas.it.json'
import { descifrar } from './cifrado'
import { checkEnglish } from './ingles'
import { correggiItaliano } from './italiano'
import { esCorrecta } from './normalizar'
import type { Pregunta } from './reglas'

export type Nivel = 'facil' | 'medio' | 'dificil' | 'experto'
export type Idioma = 'es' | 'en' | 'it'

/**
 * Una pregunta tal como está en el archivo, bajo su letra. Las respuestas aceptadas van cifradas
 * (`cifrar(['abeja'])` de cifrado.ts) para no destripar el juego; una lista en claro también vale.
 */
type PreguntaEnArchivo = { tipo: 'empieza' | 'contiene'; pista: string; respuestas: string | string[] }

type Archivo = {
  /** El nombre del idioma en ese idioma: «Español», «English». */
  nombre: string
  /** Las letras de la rueda, en orden. */
  letras: string
  niveles: Record<string, { nombre: string; preguntas: Record<string, PreguntaEnArchivo[]> }>
}

type BancoNivel = { nombre: string; banco: readonly Pregunta[] }
type Niveles = { facil: BancoNivel } & Partial<Record<Nivel, BancoNivel>>

export type Edicion = {
  idioma: Idioma
  nombre: string
  letras: readonly string[]
  niveles: Niveles
  corregir: (respuesta: string, aceptadas: readonly string[]) => boolean
}

function leer(idioma: Idioma, archivo: Archivo, corregir: Edicion['corregir']): Edicion {
  const niveles = Object.fromEntries(
    Object.entries(archivo.niveles).map(([clave, { nombre, preguntas }]) => [clave, {
      nombre,
      banco: Object.entries(preguntas).flatMap(([letra, lista]) => lista.map(({ tipo, pista, respuestas }) => ({
        letra,
        tipo,
        pista,
        respuestas: typeof respuestas === 'string' ? descifrar<string[]>(respuestas) : respuestas,
      }))),
    }]),
  ) as Niveles
  return { idioma, nombre: archivo.nombre, letras: [...archivo.letras], niveles, corregir }
}

export const EDICIONES: Record<Idioma, Edicion> = {
  es: leer('es', es as Archivo, esCorrecta),
  en: leer('en', en as Archivo, checkEnglish),
  it: leer('it', it as Archivo, correggiItaliano),
}

export const IDIOMAS = Object.keys(EDICIONES) as Idioma[]

/** La edición de un idioma (`pt-BR`, `en`): la de su idioma base si la hay; si no, la española. */
export function edicionPara(idioma: string | null | undefined): Edicion {
  const base = idioma?.toLowerCase().split(/[-_]/)[0]
  return base && Object.hasOwn(EDICIONES, base) ? EDICIONES[base as Idioma] : EDICIONES.es
}
