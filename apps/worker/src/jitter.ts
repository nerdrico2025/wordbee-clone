/**
 * Jitter aleatório em torno de um valor base (padrão ±10%).
 *
 * Extraído de `line-pipeline.ts` (onde nasceu como `jitteredIntervalMs`)
 * quando a distribuição para Páginas do Facebook passou a precisar do mesmo
 * comportamento: várias publicações criadas no mesmo instante não podem
 * disparar todas no mesmo segundo — isso gera rajada simultânea contra o
 * mesmo provedor externo e, no caso do Facebook, parece comportamento
 * automatizado grosseiro. Uma função só, usada nos dois lugares, em vez de
 * duas cópias que podem divergir.
 *
 * `Math.max(0, ...)` é defensivo: com ratio ≤ 1 sobre um base positivo o
 * resultado nunca fica negativo de verdade.
 */
export function jitteredMs(baseMs: number, ratio = 0.1): number {
  const jitter = baseMs * ratio * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(baseMs + jitter));
}
