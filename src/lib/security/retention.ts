/** Date (ISO) avant laquelle une entrée du journal est supprimée. */
export function retentionCutoff(retentionDays: number, now = new Date()): string {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}
