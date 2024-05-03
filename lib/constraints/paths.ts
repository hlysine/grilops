/**
 * @module paths This module supports puzzles where paths are filled into the grid.
 *
 * These paths may be either closed (loops) or open ("terminated" paths).
 */

import { Arith, Bool } from 'z3-solver';
import {
  DefaultDirectionMap,
  Direction,
  DirectionMap,
  DirectionString,
  Lattice,
  Point,
  PointMap,
} from '../geometry';
import { SymbolSet } from '../symbols';
import { combinations, createStringMap } from '../utils/utils';
import { SymbolGrid } from '../grids';

const DirectionTupleMap = createStringMap<
  [Direction, Direction],
  `${DirectionString}+${DirectionString}`
>(
  item => `${item[0].toString()}+${item[1].toString()}`,
  key => {
    const parts = key.split('+');
    return [
      Direction.fromString(parts[0] as DirectionString),
      Direction.fromString(parts[1] as DirectionString),
    ];
  }
);

/**
 * A `SymbolSet` consisting of symbols that may form paths.
 *
 * Additional symbols (e.g. a `Symbol` representing an empty
 * space) may be added to this `SymbolSet` by calling
 * `SymbolSet.append` after it's constructed.
 */
export class PathSymbolSet extends SymbolSet {
  private readonly _includeTerminals: boolean;
  private readonly _symbolsForDirection: Map<Direction, number[]>;
  private readonly _symbolForDirectionPair: Map<[Direction, Direction], number>;
  private readonly _terminalForDirection: Map<Direction, number>;

  private _maxPathSegmentSymbolIndex = 0;
  private _maxPathTerminalSymbolIndex = 0;

  /**
   * @param lattice The structure of the grid.
   * @param includeTerminals If true, create symbols for path terminals.
   * Defaults to true.
   */
  public constructor(lattice: Lattice, includeTerminals = true) {
    super([]);
    this._includeTerminals = includeTerminals;

    this._symbolsForDirection = new DefaultDirectionMap(() => []);
    this._symbolForDirectionPair = new DirectionTupleMap<number>();
    this._terminalForDirection = new DirectionMap<number>();

    const dirs = lattice.edgeSharingDirections();

    [...combinations(dirs, 2)].forEach(([di, dj], idx) => {
      const lbl = lattice.labelForDirectionPair(di, dj);
      this.append(di.name + dj.name, lbl);
      this._symbolsForDirection.get(di)!.push(idx);
      this._symbolsForDirection.get(dj)!.push(idx);
      this._symbolForDirectionPair.set([di, dj], idx);
      this._symbolForDirectionPair.set([dj, di], idx);
      this._maxPathSegmentSymbolIndex = idx;
    });

    if (includeTerminals) {
      dirs.forEach(d => {
        this.append(d.name, lattice.labelForDirection(d));
        const idx = this.maxIndex();
        this._symbolsForDirection.get(d)!.push(idx);
        this._terminalForDirection.set(d, idx);
        this._maxPathTerminalSymbolIndex = idx;
      });
    }
  }

  /**
   * Returns true if the given symbol represents part of a path.
   * @param symbol An `Arith` expression representing a symbol.
   * @returns A true `Bool` if the symbol represents part of a path.
   */
  public isPath<Name extends string>(symbol: Arith<Name>): Bool<Name> {
    if (this._includeTerminals) {
      return symbol.lt(this._maxPathTerminalSymbolIndex + 1);
    }
    return symbol.lt(this._maxPathSegmentSymbolIndex + 1);
  }

  /**
   * Returns true if the given symbol represents a non-terminal path segment.
   * @param symbol An `Arith` expression representing a symbol.
   * @returns A true `Bool` if the symbol represents a non-terminal path segment.
   */
  public isPathSegment<Name extends string>(symbol: Arith<Name>): Bool<Name> {
    return symbol.lt(this._maxPathSegmentSymbolIndex + 1);
  }

  /**
   * Returns true if the given symbol represents a path terminal.
   * @param symbol An `Arith` expression representing a symbol.
   * @returns A true `Bool` if the symbol represents a path terminal.
   */
  public isTerminal<Name extends string>(symbol: Arith<Name>): Bool<Name> {
    if (!this._includeTerminals) {
      return symbol.ctx.Bool.val(false);
    }
    return symbol.ctx.And(
      symbol.gt(this._maxPathSegmentSymbolIndex),
      symbol.lt(this._maxPathTerminalSymbolIndex + 1)
    );
  }

  /**
   * Returns the symbols with one arm going in the given direction.
   * @param d The given direction.
   * @returns A `number[]` of symbol indices corresponding to symbols with one
   * arm going in the given direction.
   */
  public symbolsForDirection(d: Direction): number[] {
    return this._symbolsForDirection.get(d)!;
  }

  /**
   * Returns the symbol with arms going in the two given directions.
   * @param d1 The first given direction.
   * @param d2 The second given direction.
   * @returns The symbol index for the symbol with one arm going in each of the
   * two given directions.
   */
  public symbolForDirectionPair(d1: Direction, d2: Direction): number {
    return this._symbolForDirectionPair.get([d1, d2])!;
  }

  /**
   * Returns the symbol that terminates the path from the given direction.
   * @param d The given direction.
   * @returns The symbol index for the symbol that terminates the path from the
   * given direction.
   */
  public terminalForDirection(d: Direction): number | undefined {
    return this._terminalForDirection.get(d);
  }
}

/**
 * Creates constraints for ensuring symbols form connected paths.
 */
export class PathConstrainer<Name extends string> {
  private static _instanceIndex = 0;

  private readonly _symbolGrid: SymbolGrid<Name>;
  private readonly _complete: boolean;
  private readonly _allowTerminatedPaths: boolean;
  private readonly _allowLoops: boolean;
  private readonly _pathInstanceGrid: Map<Point, Arith<Name>>;
  private readonly _pathOrderGrid: Map<Point, Arith<Name>>;

  private _numPaths: Arith<Name> | null;

  /**
   * @param symbolGrid The grid to constrain.
   * @param complete If true, every cell must be part of a path. Defaults to
   * false.
   * @param allowTerminatedPaths If true, finds paths that are terminated
   * (not loops). Defaults to true.
   * @param allowLoops If true, finds paths that are loops. Defaults to true.
   */
  public constructor(
    symbolGrid: SymbolGrid<Name>,
    complete = false,
    allowTerminatedPaths = true,
    allowLoops = true
  ) {
    PathConstrainer._instanceIndex += 1;

    this._symbolGrid = symbolGrid;
    this._complete = complete;
    this._allowTerminatedPaths = allowTerminatedPaths;
    this._allowLoops = allowLoops;
    this._numPaths = null;

    this._pathInstanceGrid = new PointMap(
      [...this._symbolGrid.grid.keys()].map(p => [
        p,
        this._symbolGrid.ctx.context.Int.const(
          `pcpi-${PathConstrainer._instanceIndex}-${p.y}-${p.x}`
        ),
      ])
    );
    this._pathOrderGrid = new PointMap(
      [...this._symbolGrid.grid.keys()].map(p => [
        p,
        this._symbolGrid.ctx.context.Int.const(
          `pcpo-${PathConstrainer._instanceIndex}-${p.y}-${p.x}`
        ),
      ])
    );

    this._addPathEdgeConstraints();
    this._addPathInstanceGridConstraints();
    this._addPathOrderGridConstraints();
    this._addAllowTerminatedPathsConstraints();
  }

  private _addPathEdgeConstraints() {
    const solver = this._symbolGrid.solver;
    const sym = this._symbolGrid.symbolSet as PathSymbolSet;

    for (const [p, cell] of this._symbolGrid.grid) {
      for (const d of this._symbolGrid.lattice.edgeSharingDirections()) {
        const np = p.translate(d.vector);
        const dirSyms = sym.symbolsForDirection(d);
        const ncell = this._symbolGrid.grid.get(np);
        if (ncell !== undefined) {
          const oppositeSyms = sym.symbolsForDirection(
            this._symbolGrid.lattice.oppositeDirection(d)
          );
          const cellPointsDir = solver.ctx.Or(...dirSyms.map(s => cell.eq(s)));
          const neighborPointsOpposite = solver.ctx.Or(
            ...oppositeSyms.map(s => ncell.eq(s))
          );
          solver.add(solver.ctx.Implies(cellPointsDir, neighborPointsOpposite));
        } else {
          for (const s of dirSyms) {
            solver.add(cell.neq(s));
          }
        }
      }
    }
  }

  private _addPathInstanceGridConstraints() {
    const solver = this._symbolGrid.solver;
    const sym = this._symbolGrid.symbolSet as PathSymbolSet;

    for (const [p, pi] of this._pathInstanceGrid) {
      if (this._complete) {
        solver.add(pi.ge(0));
      } else {
        solver.add(pi.ge(-1));
      }
      solver.add(pi.lt(this._symbolGrid.grid.size));

      const cell = this._symbolGrid.grid.get(p)!;
      solver.add(sym.isPath(cell).eq(pi.neq(-1)));
      const pointIndex = this._symbolGrid.lattice.pointToIndex(p)!;
      if (pointIndex === undefined) throw new Error('pointIndex is undefined');
      solver.add(this._pathOrderGrid.get(p)!.eq(0).eq(pi.eq(pointIndex)));
      for (const d of this._symbolGrid.lattice.edgeSharingDirections()) {
        const dirSyms = sym.symbolsForDirection(d);
        const np = p.translate(d.vector);
        const ncell = this._symbolGrid.grid.get(np);
        if (ncell !== undefined) {
          const cellPointsDir = solver.ctx.Or(...dirSyms.map(s => cell.eq(s)));
          solver.add(
            solver.ctx.Implies(
              cellPointsDir,
              pi.eq(this._pathInstanceGrid.get(np)!)
            )
          );
        }
      }
    }
  }

  private *_allDirectionPairs() {
    const dirs = this._symbolGrid.lattice.edgeSharingDirections();
    let idx = 0;
    for (const [di, dj] of combinations(dirs, 2)) {
      yield [idx, di, dj] as const;
      idx += 1;
    }
  }

  private _addPathOrderGridConstraints() {
    const solver = this._symbolGrid.solver;
    const sym = this._symbolGrid.symbolSet as PathSymbolSet;

    for (const [p, po] of this._pathOrderGrid) {
      if (this._complete) {
        solver.add(po.ge(0));
      } else {
        solver.add(po.ge(-1));
      }

      const cell = this._symbolGrid.grid.get(p)!;
      solver.add(sym.isPath(cell).eq(po.neq(-1)));

      for (const d of this._symbolGrid.lattice.edgeSharingDirections()) {
        const s = sym.terminalForDirection(d);
        if (s === undefined) continue;
        const np = p.translate(d.vector);
        if (this._pathOrderGrid.has(np)) {
          solver.add(
            solver.ctx.Implies(
              cell.eq(s),
              solver.ctx.Or(
                solver.ctx.And(po.eq(0), this._pathOrderGrid.get(np)!.eq(1)),
                solver.ctx.And(
                  po.gt(0),
                  this._pathOrderGrid.get(np)!.eq(po.sub(1))
                )
              )
            )
          );
        }
      }

      for (const [idx, d1, d2] of this._allDirectionPairs()) {
        const pi = p.translate(d1.vector);
        const pj = p.translate(d2.vector);
        if (this._pathOrderGrid.has(pi) && this._pathOrderGrid.has(pj)) {
          solver.add(
            solver.ctx.Implies(
              cell.eq(idx),
              this._pathOrderGrid.get(pi)!.neq(this._pathOrderGrid.get(pj)!)
            )
          );
          solver.add(
            solver.ctx.Implies(
              solver.ctx.And(cell.eq(idx), po.gt(0)),
              solver.ctx.Or(
                solver.ctx.And(
                  this._pathOrderGrid.get(pi)!.eq(po.sub(1)),
                  solver.ctx.Or(
                    this._pathOrderGrid.get(pj)!.eq(po.add(1)),
                    this._allowLoops
                      ? this._pathOrderGrid.get(pj)!.eq(0)
                      : solver.ctx.Bool.val(false)
                  )
                ),
                solver.ctx.And(
                  solver.ctx.Or(
                    this._pathOrderGrid.get(pi)!.eq(po.add(1)),
                    this._allowLoops
                      ? this._pathOrderGrid.get(pi)!.eq(0)
                      : solver.ctx.Bool.val(false)
                  ),
                  this._pathOrderGrid.get(pj)!.eq(po.sub(1))
                )
              )
            )
          );
        }
      }
    }
  }

  private _addAllowTerminatedPathsConstraints() {
    const solver = this._symbolGrid.solver;
    const sym = this._symbolGrid.symbolSet as PathSymbolSet;

    if (!this._allowTerminatedPaths) {
      for (const cell of this._symbolGrid.grid.values()) {
        this._symbolGrid.solver.add(solver.ctx.Not(sym.isTerminal(cell)));
      }
    }
  }

  /**
   * A constant representing the number of distinct paths found.
   */
  public get numPaths(): Arith<Name> {
    if (this._numPaths === null) {
      const solver = this._symbolGrid.solver;
      const args = this._symbolGrid.lattice.points.map(p =>
        solver.ctx.If(this._pathOrderGrid.get(p)!.eq(0), 1, 0)
      );
      this._numPaths = this._symbolGrid.ctx.context.Sum(
        args[0],
        ...args.slice(1)
      );
    }
    return this._numPaths;
  }

  /**
   * Constants of path instance identification.
   *
   * Each separate path will have a distinct instance number. The instance number
   * is -1 if the cell does not contain a path segment or terminal.
   */
  public get pathInstanceGrid(): Map<Point, Arith<Name>> {
    return this._pathInstanceGrid;
  }

  /**
   * Constants of path traversal orders.
   *
   * Each segment or terminal of a path will have a distinct order number. The
   * order number is -1 if the cell does not contain a path segment or terminal.
   */
  public get pathOrderGrid(): Map<Point, Arith<Name>> {
    return this._pathOrderGrid;
  }

  /**
   * Prints the path instance and order for each path cell.
   *
   * Should be called only after the solver has been checked.
   */
  public pathNumberingToString() {
    const model = this._symbolGrid.solver.model();
    const printFunction = (p: Point) => {
      const pi = Number(model.eval(this._pathInstanceGrid.get(p)!));
      const po = Number(model.eval(this._pathOrderGrid.get(p)!));
      if (pi === -1) {
        return '    ';
      }
      return `${String.fromCharCode(65 + pi)}${po.toString().padStart(2, '0')} `;
    };
    return this._symbolGrid.lattice.toString(printFunction, '    ');
  }
}
