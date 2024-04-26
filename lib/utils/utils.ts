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

export function* combinations<T>(choices: T[], length: number): Generator<T[]> {
  if (length === 0) {
    yield [];
  } else {
    for (let i = 0; i < choices.length; i++) {
      const first = choices[i];
      for (const rest of combinations(choices.slice(i + 1), length - 1)) {
        yield [first, ...rest];
      }
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createDefualtMap(base: new <K, V>(...args: any) => Map<K, V>) {
  return class DefaultMap<K, V> extends base<K, V> {
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
  };
}

export interface KeyedMapConstructor<T> {
  new (): Map<T, any>;
  new <V>(entries?: readonly (readonly [T, V])[] | null): Map<T, V>;
  readonly prototype: Map<T, any>;
}

export function createStringMap<T, Key extends string>(
  toString: (item: T) => Key,
  fromString: (key: Key) => T
): KeyedMapConstructor<T> {
  return class StringMap extends Map<T, unknown> {
    public get(key: T): unknown {
      return super.get(toString(key) as unknown as T);
    }

    public has(key: T): boolean {
      return super.has(toString(key) as unknown as T);
    }

    public set(key: T, value: unknown): this {
      return super.set(toString(key) as unknown as T, value);
    }

    public delete(key: T): boolean {
      return super.delete(toString(key) as unknown as T);
    }

    public forEach(
      callbackfn: (value: unknown, key: T, map: Map<T, unknown>) => void,
      thisArg?: any
    ): void {
      super.forEach(
        (value, key, map) =>
          callbackfn(value, fromString(key as unknown as Key), map),
        thisArg
      );
    }

    constructor(entries?: Iterable<readonly [T, unknown]> | null) {
      super(
        [...(entries ?? [])].map(([k, v]) => [toString(k) as unknown as T, v])
      );
    }
  };
}

export interface KeyedSetConstructor<T> {
  new (values?: readonly T[] | null): Set<T>;
  readonly prototype: Set<any>;
}

export function createStringSet<T, Key extends string>(
  toString: (item: T) => Key,
  fromString: (key: Key) => T
): KeyedSetConstructor<T> {
  return class StringSet extends Set<T> {
    public has(key: T): boolean {
      return super.has(toString(key) as unknown as T);
    }

    public add(value: T): this {
      return super.add(toString(value) as unknown as T);
    }

    public delete(value: T): boolean {
      return super.delete(toString(value) as unknown as T);
    }

    public forEach(
      callbackfn: (value: T, value2: T, set: Set<T>) => void,
      thisArg?: any
    ): void {
      super.forEach(
        (value, value2, set) =>
          callbackfn(
            fromString(value as unknown as Key),
            fromString(value2 as unknown as Key),
            set
          ),
        thisArg
      );
    }

    constructor(values?: readonly T[] | null) {
      super([...(values ?? [])].map(v => toString(v) as unknown as T));
    }
  };
}
