function canonicalNumber(value: number) { if (!Number.isFinite(value)) throw new TypeError('Non-finite number is not a valid render snapshot'); return JSON.stringify(value); }
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'undefined') return '';
  if (Array.isArray(value)) return `[${value.map((entry) => typeof entry === 'undefined' ? 'null' : canonicalize(entry)).join(',')}]`;
  if (typeof value !== 'object') throw new TypeError(`Unsupported render snapshot value: ${typeof value}`);
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().filter((key) => typeof object[key] !== 'undefined').map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
}
