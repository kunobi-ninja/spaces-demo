// Reproduce los efectos de Kunobitos con el canal de efectos de Kunobi (@vixi/audio/channels).
// El navegador solo deja sonar audio después de un gesto del jugador, así que
// `desbloquear()` se llama desde los clics y teclas; hasta entonces, `tocar()` no hace nada.

import { AudioChannels } from '@vixi/audio/channels'
import { muestras, type NombreSonido } from './sintesis'

export class Sonidos {
  silencio = false
  private contexto: AudioContext | null = null
  private canales: AudioChannels | null = null
  private buffers = new Map<NombreSonido, AudioBuffer>()

  /** Llamar dentro de un gesto del jugador (clic, Intro, Esc). */
  desbloquear(): void {
    try {
      if (!this.contexto) {
        const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Contexto) return
        this.contexto = new Contexto()
        this.canales = new AudioChannels(this.contexto)
        this.canales.effects.gain.value = 0.8
      }
      if (this.contexto.state === 'suspended') void this.contexto.resume()
    } catch {
      // Sin audio el juego sigue funcionando.
    }
  }

  private ultimo = new Map<NombreSonido, number>()

  /** Toca un efecto; `cadaMs` evita que el mismo efecto se amontone (cavar, pasos…). */
  tocar(nombre: NombreSonido, cadaMs = 0): void {
    if (this.silencio || !this.contexto || !this.canales) return
    const ahora = performance.now()
    if (cadaMs && ahora - (this.ultimo.get(nombre) ?? -1e9) < cadaMs) return
    this.ultimo.set(nombre, ahora)
    try {
      let buffer = this.buffers.get(nombre)
      if (!buffer) {
        const datos = muestras(nombre, this.contexto.sampleRate)
        buffer = this.contexto.createBuffer(1, datos.length, this.contexto.sampleRate)
        buffer.getChannelData(0).set(datos)
        this.buffers.set(nombre, buffer)
      }
      this.canales.play(buffer, 'effects')
    } catch {
      // Un efecto que no suena no debe romper la partida.
    }
  }

  cerrar(): void {
    this.canales?.dispose()
    void this.contexto?.close().catch(() => {})
    this.canales = null
    this.contexto = null
    this.buffers.clear()
  }
}
