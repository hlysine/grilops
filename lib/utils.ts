import { Context, Z3HighLevel, Z3LowLevel } from 'z3-solver';

export type GrilopsContext<Name extends string> = Z3LowLevel &
  Omit<Z3HighLevel, 'Context'> & { Context: Context<Name> };

export function zip<T>(...args: T[][]): T[][] {
  const min = Math.min(...args.map(a => a.length));
  return Array.from({ length: min }, (_, i) => args.map(a => a[i]));
}
