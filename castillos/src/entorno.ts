/*
 * ¿Se ve la página desde el enlace web (https) o dentro de Kunobi (kunobi-mdx:)?
 * En la web no llegan las otras páginas del Space ni se guarda nada entre visitas.
 */

export const enWeb = (): boolean => typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
