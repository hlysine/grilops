/**
 * @module grids This module supports constructing and working with grids of cells.
 */

import { Arith, Bool, Optimize, Solver } from 'z3-solver';
import { Lattice, Neighbor, Point, PointMap } from './geometry';
import { SymbolSet } from './symbols';
import { GrilopsContext } from './utils/utils';

/**
 * A grid of cells that can be solved to contain specific symbols.
 */
export class SymbolGrid<
  Name extends string,
  const Core extends Solver<Name> | Optimize<Name> =
    | Solver<Name>
    | Optimize<Name>,
> {
  private static _instanceIndex = 0;

  public readonly ctx: GrilopsContext<Name>;
  private _lattice: Lattice;
  private _symbolSet: SymbolSet;
  private _solver: Core;
  private _grid: Map<Point, Arith<Name>>;

  /**
   * @param context The context in which to construct the grid.
   * @param lattice The structure of the grid.
   * @param symbolSet The set of symbols to be filled into the grid.
   * @param solver A `Solver` object. If undefined, a `Solver` will be constructed.
   */
  public constructor(
    context: GrilopsContext<Name>,
    lattice: Lattice,
    symbolSet: SymbolSet,
    solver: Core | undefined = undefined
  ) {
    this.ctx = context;
    this._lattice = lattice;
    this._symbolSet = symbolSet;
    this._solver = solver ?? (new this.ctx.context.Solver() as Core);
    this._grid = new PointMap<Arith<Name>>();
    for (const p of lattice.points) {
      const v = this.ctx.context.Int.const(
        `sg_${SymbolGrid._instanceIndex}_${p.y}-${p.x}`
      );
      this._solver.add(v.ge(symbolSet.minIndex()), v.le(symbolSet.maxIndex()));
      this._grid.set(p, v);
    }
  }

  /**
   * The `Solver` object associated with this `SymbolGrid`.
   */
  public get solver() {
    return this._solver;
  }

  /**
   * The `grilops.symbols.SymbolSet` associated with this `SymbolGrid`.
   */
  public get symbolSet() {
    return this._symbolSet;
  }

  /**
   * The grid of cells.
   */
  public get grid() {
    return this._grid;
  }

  /**
   * The lattice of points in the grid.
   */
  public get lattice() {
    return this._lattice;
  }

  /**
   * Returns a list of cells that share an edge with the given cell.
   * @param p The location of the given cell.
   * @returns A `Neighbor[]` representing the cells sharing
   * an edge with the given cell.
   */
  public edgeSharingNeighbors(p: Point): Neighbor<Name>[] {
    return this._lattice.edgeSharingNeighbors(this._grid, p);
  }

  /**
   * Returns the cells that share a vertex with the given cell.
   *
   * In other words, returns a list of cells orthogonally and diagonally
   * adjacent to the given cell.
   * @param p The location of the given cell.
   * @returns A `Neighbor[]` representing the cells sharing
   * a vertex with the given cell.
   */
  public vertexSharingNeighbors(p: Point): Neighbor<Name>[] {
    return this._lattice.vertexSharingNeighbors(this._grid, p);
  }

  /**
   * Returns the cell at the given point.
   * @param p The location of the cell.
   * @returns The cell at the given point.
   */
  public cellAt(p: Point) {
    return this._grid.get(p)!;
  }

  /**
   * Returns an expression for whether this cell contains this value.
   * @param p The location of the given cell.
   * @param value The value to satisfy the expression.
   * @returns An expression that's true if and only if the cell at p contains
   * this value.
   */
  public cellIs(p: Point, value: number) {
    return this._grid.get(p)!.eq(value);
  }

  /**
   * Returns an expression for whether this cell contains one of these values.
   * @param p The location of the given cell.
   * @param values The set of values to satisfy the expression.
   * @returns An expression that's true if and only if the cell at p contains
   * one of these values.
   */
  public cellIsOneOf(p: Point, values: number[]) {
    const cell = this._grid.get(p)!;
    return this.ctx.context.Or(...values.map(v => cell.eq(v)));
  }

  /**
   * Returns true if the puzzle has a solution, false otherwise.
   */
  public async solve() {
    return (await this._solver.check()) === 'sat';
  }

  /**
   * Returns true if the solution to the puzzle is unique, false otherwise.
   *
   * Should be called only after `SymbolGrid.solve` has already completed
   * successfully.
   */
  public async isUnique() {
    const model = this._solver.model();
    const orTerms: Bool<Name>[] = [];
    for (const cell of this._grid.values()) {
      orTerms.push(cell.neq(model.eval(cell)));
    }
    this._solver.add(this.ctx.context.Or(...orTerms));
    return (await this._solver.check()) === 'unsat';
  }

  /**
   * Returns the solved symbol grid.
   *
   * Should be called only after `SymbolGrid.solve` has already completed
   * successfully.
   */
  public solvedGrid() {
    const model = this._solver.model();
    const result = new PointMap<number>();
    for (const [p, cell] of this._grid.entries()) {
      result.set(p, Number(model.eval(cell)));
    }
    return result;
  }

  /**
   * Prints the solved grid using symbol labels.
   *
   * Should be called only after `SymbolGrid.solve` has already completed
   * successfully.
   * @param hookFunction A function implementing custom symbol display
   * behavior, or None. If this function is provided, it will be called for
   * each cell in the grid, with the arguments p (`Point`)
   * and the symbol index for that cell (`number`). It may return a string to
   * print for that cell, or None to keep the default behavior.
   */
  public toString(
    hookFunction?: ((p: Point, i: number) => string) | undefined
  ) {
    const model = this._solver.model();
    const labelWidth = Math.max(
      ...[...this.symbolSet.symbols.values()].map(s => s.label.length)
    );

    const printFunction = (p: Point) => {
      const cell = this._grid.get(p)!;
      const i = Number(model.eval(cell));
      let label: string | undefined;
      if (hookFunction) {
        label = hookFunction(p, i);
      }
      if (label === undefined) {
        label = this.symbolSet.symbols.get(i)?.label.padStart(labelWidth);
      }
      return label;
    };

    return this._lattice.toString(printFunction, ' '.repeat(labelWidth));
  }
}

export default function grids<Name extends string>(
  context: GrilopsContext<Name>
): {
  /**
   * A grid of cells that can be solved to contain specific symbols.
   */
  SymbolGrid: new <Core extends Solver<Name> | Optimize<Name> = Solver<Name>>(
    lattice: Lattice,
    symbolSet: SymbolSet,
    solver?: Core | undefined
  ) => SymbolGrid<Name, Core>;
} {
  return {
    SymbolGrid: function <
      Core extends Solver<Name> | Optimize<Name> = Solver<Name>,
    >(
      lattice: Lattice,
      symbolSet: SymbolSet,
      solver: Core | undefined = undefined
    ) {
      return new SymbolGrid(context, lattice, symbolSet, solver);
    },
  } as never;
}
