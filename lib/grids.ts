// This module supports constructing and working with grids of cells.

import { Arith, Bool, Solver } from 'z3-solver';
import { Lattice, Neighbor, Point, PointString } from './geometry';
import { SymbolSet } from './symbols';
import { GrilopsContext } from './utils';

export default function grids<Name extends string>({
  context,
}: GrilopsContext<Name>) {
  /**
   * A grid of cells that can be solved to contain specific symbols.
   */
  return class SymbolGrid {
    private static _instanceIndex = 0;

    private _lattice: Lattice;
    private _symbolSet: SymbolSet;
    private _solver: Solver<Name>;
    private _grid: Map<PointString, Arith<Name>>;

    /**
     * @param lattice The structure of the grid.
     * @param symbolSet The set of symbols to be filled into the grid.
     * @param solver A `Solver` object. If undefined, a `Solver` will be constructed.
     */
    public constructor(
      lattice: Lattice,
      symbolSet: SymbolSet,
      solver: Solver<Name> | undefined = undefined
    ) {
      this._lattice = lattice;
      this._symbolSet = symbolSet;
      this._solver = solver ?? new context.Solver();
      this._grid = new Map();
      for (const p of lattice.points) {
        const v = context.Int.const(
          `sg_${SymbolGrid._instanceIndex}_${p.y}-${p.x}`
        );
        this._solver.add(
          v.ge(symbolSet.minIndex()),
          v.le(symbolSet.maxIndex())
        );
        this._grid.set(p.toString(), v);
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
     * Returns an expression for whether this cell contains this value.
     * @param p The location of the given cell.
     * @param value The value to satisfy the expression.
     * @returns An expression that's true if and only if the cell at p contains
     * this value.
     */
    public cellIs(p: Point, value: number) {
      return this._grid.get(p.toString())!.eq(value);
    }

    /**
     * Returns an expression for whether this cell contains one of these values.
     * @param p The location of the given cell.
     * @param values The set of values to satisfy the expression.
     * @returns An expression that's true if and only if the cell at p contains
     * one of these values.
     */
    public cellIsOneOf(p: Point, values: number[]) {
      const cell = this._grid.get(p.toString())!;
      return context.Or(...values.map(v => cell.eq(v)));
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
      this._solver.add(context.Or(...orTerms));
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
      const result = new Map<PointString, number>();
      for (const [pString, cell] of this._grid.entries()) {
        result.set(pString, Number(model.eval(cell)));
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
      hookFunction: ((p: Point, i: number) => string) | undefined
    ) {
      const model = this._solver.model();
      const labelWidth = Math.max(
        ...[...this.symbolSet.symbols.values()].map(s => s.label.length)
      );

      const printFunction = (p: Point) => {
        const cell = this._grid.get(p.toString())!;
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
  };
}