import { Context, Z3LowLevel } from 'z3-solver';

export interface GrilopsContext<Name extends string> {
  lowLevel: Z3LowLevel['Z3'];
  context: Context<Name>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T extends abstract new (...args: any) => any> = new (
  ...args: ConstructorParameters<T>
) => T;

export function zip<T>(...args: T[][]): T[][] {
  const min = Math.min(...args.map(a => a.length));
  return Array.from({ length: min }, (_, i) => args.map(a => a[i]));
}
