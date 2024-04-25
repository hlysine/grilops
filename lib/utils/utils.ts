/**
 * @module utils Utility functions and types specific to this Typescript port.
 */

import { Context, Z3LowLevel } from 'z3-solver';

export interface GrilopsContext<Name extends string> {
  z3: Z3LowLevel['Z3'];
  context: Context<Name>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T extends abstract new (...args: any) => any> = new (
  ...args: ConstructorParameters<T>
) => T;

export function zip<T1, T2>(a: T1[], b: T2[]): [T1, T2][];
export function zip<T1, T2, T3>(a: T1[], b: T2[], c: T3[]): [T1, T2, T3][];
export function zip<T>(...args: T[][]): T[][];
export function zip<T>(...args: T[][]): T[][] {
  const min = Math.min(...args.map(a => a.length));
  return Array.from({ length: min }, (_, i) => args.map(a => a[i]));
}

export class DefaultMap<K, V> extends Map<K, V> {
  public default: () => V;

  public get(key: K): V {
    if (!this.has(key)) {
      this.set(key, this.default());
    }
    return super.get(key)!;
  }

  constructor(
    defaultFunc: () => V,
    entries?: readonly (readonly [K, V])[] | null
  ) {
    super(entries);
    this.default = defaultFunc;
  }
}
