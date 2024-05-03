/**
 * @module symbols This module supports defining symbols that may be filled into grid cells.
 */

/**
 * A marking that may be filled into a `grilops.grids.SymbolGrid` cell.
 */
export class Symbol {
  private _index: number;
  private _name: string | undefined;
  private _label: string | undefined;

  /**
   * @param index The index value assigned to the symbol.
   * @param name The code-safe name of the symbol.
   * @param label The printable label of the symbol.
   */
  public constructor(index: number, name?: string, label?: string) {
    this._index = index;
    this._name = name;
    this._label = label;
  }

  /**
   * The index value assigned to the symbol.
   */
  public get index(): number {
    return this._index;
  }

  /**
   * The code-safe name of the symbol.
   */
  public get name(): string {
    return this._name ?? this._label ?? this._index.toString();
  }

  /**
   * The printable label of the symbol.
   */
  public get label(): string {
    return this._label ?? this._name ?? this._index.toString();
  }

  public toString(): string {
    return this.label;
  }
}

/**
 * A set of markings that may be filled into a `grilops.grids.SymbolGrid`.
 */
export class SymbolSet {
  private _indexToSymbol = new Map<number, Symbol>();
  private _labelToSymbolIndex = new Map<string, number>();
  public readonly indices: Record<string, number> = {};

  /**
   * @param symbols A list of specifications for the symbols. Each specification
   * may be a code-safe name, a (code-safe name, printable label) tuple, or
   * a (code-safe name, printable label, index value) tuple.
   */
  public constructor(
    symbols: (string | [string, string] | [string, string, number])[]
  ) {
    for (const spec of symbols) {
      if (typeof spec === 'string') {
        const i = this._nextUnusedIndex();
        this._indexToSymbol.set(i, new Symbol(i, spec));
      } else if (Array.isArray(spec)) {
        let [name, label, index] = spec;
        if (spec.length === 3) {
          if (this._indexToSymbol.has(index!)) {
            throw new Error(
              `Index of ${spec.toString()} already used by ${this._indexToSymbol.get(index!)?.toString()}`
            );
          }
        } else if (spec.length === 2) {
          index = this._nextUnusedIndex();
        } else {
          throw new Error(
            `Invalid symbol spec: ${(spec as unknown[]).toString()}`
          );
        }
        this._indexToSymbol.set(index!, new Symbol(index!, name, label));
      } else {
        throw new Error(
          `Invalid symbol spec: ${(spec as unknown[]).toString()}`
        );
      }
    }
    for (const symbol of this._indexToSymbol.values()) {
      this.indices[symbol.name] = symbol.index;
      this._labelToSymbolIndex.set(symbol.label, symbol.index);
    }
  }

  private _nextUnusedIndex() {
    if (this._indexToSymbol.size === 0) {
      return 0;
    }
    return Math.max(...this._indexToSymbol.keys()) + 1;
  }

  /**
   * Appends an additional symbol to this symbol set.
   * @param name The code-safe name of the symbol.
   * @param label The printable label of the symbol.
   */
  public append(
    name: string | undefined = undefined,
    label: string | undefined = undefined
  ) {
    const index = this._nextUnusedIndex();
    const symbol = new Symbol(index, name, label);
    this._indexToSymbol.set(index, symbol);
    this.indices[symbol.name] = symbol.index;
    this._labelToSymbolIndex.set(symbol.label, symbol.index);
  }

  /**
   * Returns the minimum index value of all of the symbols.
   */
  public minIndex(): number {
    return Math.min(...this._indexToSymbol.keys());
  }

  /**
   * Returns the maximum index value of all of the symbols.
   */
  public maxIndex(): number {
    return Math.max(...this._indexToSymbol.keys());
  }

  /**
   * The map of all symbols.
   */
  public get symbols(): Map<number, Symbol> {
    return this._indexToSymbol;
  }

  public toString(): string {
    return `SymbolSet(${[...this._indexToSymbol.values()].join(', ')})`;
  }
}

/**
 * Returns a `SymbolSet` consisting of consecutive letters.
 * @param minLetter The lowest letter to include in the set.
 * @param maxLetter The highest letter to include in the set.
 * @returns A `SymbolSet` consisting of consecutive letters.
 */
export function makeLetterRangeSymbolSet(minLetter: string, maxLetter: string) {
  const symbols = [];
  for (let i = minLetter.charCodeAt(0); i <= maxLetter.charCodeAt(0); i++) {
    symbols.push(String.fromCharCode(i));
  }
  return new SymbolSet(symbols);
}

/**
 * Returns a `SymbolSet` consisting of consecutive numbers.
 *
 * The names of the symbols will be prefixed with S to be consistent with the
 * Python implementation.
 *
 * @param minNumber The lowest number to include in the set.
 * @param maxNumber The highest number to include in the set.
 * @returns A `SymbolSet` consisting of consecutive numbers.
 */
export function makeNumberRangeSymbolSet(minNumber: number, maxNumber: number) {
  const symbols: [string, string, number][] = [];
  for (let i = minNumber; i <= maxNumber; i++) {
    symbols.push(['S' + i.toString(), i.toString(), i]);
  }
  return new SymbolSet(symbols);
}
