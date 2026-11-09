export type Admission = Readonly<{ acquire: (tenantId: string) => (() => void) | null }>;

/** In-process, immediate admission only. Share across gateway instances in one
 * process. No waiting queue; NOT a distributed quota, identity, or billing store. */
export function createAdmissionController(limits: { maxConcurrent: number; maxPerTenant: number }): Admission {
  const { maxConcurrent, maxPerTenant } = limits;
  if (![maxConcurrent, maxPerTenant].every(n => Number.isSafeInteger(n) && n > 0 && n <= 10000) || maxPerTenant > maxConcurrent) {
    throw new TypeError("Invalid admission limits");
  }
  let active = 0;
  const tenants = new Map<string, number>();
  return Object.freeze({
    acquire(tenantId: string) {
      const count = tenants.get(tenantId) ?? 0;
      if (active >= maxConcurrent || count >= maxPerTenant) return null;
      active++; tenants.set(tenantId, count + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true; active--;
        const remaining = (tenants.get(tenantId) ?? 1) - 1;
        if (remaining === 0) tenants.delete(tenantId); else tenants.set(tenantId, remaining);
      };
    }
  });
}
