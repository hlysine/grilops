/**
 * @module regions This module supports puzzles that group cells into contiguous regions.
 *
 * Internally, the `RegionConstrainer` constructs subtrees, each spanning the cells
 * contained within a region. Aspects of a cell's relationship to the other cells
 * in its subtree are exposed by properties of the `RegionConstrainer`.
 */

import { Arith, Optimize, Solver } from 'z3-solver';
import {
  Direction,
  DirectionString,
  Lattice,
  Point,
  PointString,
} from '../geometry';
import { GrilopsContext, combinations } from '../utils/utils';

/**
 * The `RegionConstrainer.parent_grid` value indicating that a cell is not
 * part of a region.
 */
const X = 0;

/**
 * The `RegionConstrainer.parent_grid` value indicating that a cell is the
 * root of its region's subtree.
 */
const R = 1;

/**
 * Creates constraints for grouping cells into contiguous regions.
 */
export class RegionConstrainer<
  Name extends string,
  const Core extends Solver<Name> | Optimize<Name> =
    | Solver<Name>
    | Optimize<Name>,
> {
  private static _instanceIndex = 0;

  private readonly _ctx: GrilopsContext<Name>;
  private readonly _solver: Core;
  private readonly _lattice: Lattice;
  private readonly _complete: boolean;
  private readonly _minRegionSize: number;
  private readonly _maxRegionSize: number;

  private _edgeSharingDirectionToIndex: Map<DirectionString, number> =
    undefined!;

  private _parentTypeToIndex: Map<string, number> = undefined!;
  private _parentTypes: string[] = undefined!;
  private _parentGrid: Map<PointString, Arith<Name>> = undefined!;
  private _subtreeSizeGrid: Map<PointString, Arith<Name>> = undefined!;
  private _regionIdGrid: Map<PointString, Arith<Name>> = undefined!;
  private _regionSizeGrid: Map<PointString, Arith<Name>> = undefined!;

  /**
   * @param lattice The structure of the grid.
   * @param solver A `Solver` object. If None, a `Solver` will be constructed.
   * @param complete If true, every cell must be part of a region. Defaults to
   * true.
   * @param rectangular If true, every region must be "rectangular"; for each
   * cell in a region, ensure that pairs of its neighbors that are part of
   * the same region each share an additional neighbor that's part of the
   * same region when possible.
   * @param minRegionSize The minimum possible size of a region.
   * @param maxRegionSize The maximum possible size of a region.
   */
  public constructor(
    context: GrilopsContext<Name>,
    lattice: Lattice,
    solver: Core | undefined = undefined,
    complete = true,
    rectangular = false,
    minRegionSize: number | undefined = undefined,
    maxRegionSize: number | undefined = undefined
  ) {
    this._ctx = context;
    RegionConstrainer._instanceIndex += 1;

    this._lattice = lattice;
    this._solver = solver ?? (new this._ctx.context.Solver() as Core);
    this._complete = complete;
    if (minRegionSize !== undefined) {
      this._minRegionSize = minRegionSize;
    } else {
      this._minRegionSize = 1;
    }
    if (maxRegionSize !== undefined) {
      this._maxRegionSize = maxRegionSize;
    } else {
      this._maxRegionSize = this._lattice.points.length;
    }
    this._manageEdgeSharingDirections();
    this._createGrids();
    this._addConstraints();
    if (rectangular) {
      this._addRectangularConstraints();
    }
  }

  /**
   * Creates the structures used for managing edge-sharing directions.
   *
   * Creates the mapping between edge-sharing directions and the parent
   * indices corresponding to them.
   */
  private _manageEdgeSharingDirections() {
    this._edgeSharingDirectionToIndex = new Map();
    this._parentTypeToIndex = new Map([
      ['X', X],
      ['R', R],
    ]);
    this._parentTypes = ['X', 'R'];
    for (const d of this._lattice.edgeSharingDirections()) {
      const index = this._parentTypes.length;
      this._parentTypeToIndex.set(d.name, index);
      this._edgeSharingDirectionToIndex.set(d.toString(), index);
      this._parentTypes.push(d.name);
    }
  }

  /**
   * Create the grids used to model region constraints.
   */
  private _createGrids() {
    this._parentGrid = new Map();
    for (const p of this._lattice.points) {
      const v = this._ctx.context.Int.const(
        `rcp-${RegionConstrainer._instanceIndex}-${p.y}-${p.x}`
      );
      if (this._complete) {
        this._solver.add(v.ge(R));
      } else {
        this._solver.add(v.ge(X));
      }
      this._solver.add(v.lt(this._parentTypes.length));
      this._parentGrid.set(p.toString(), v);
    }

    this._subtreeSizeGrid = new Map();
    for (const p of this._lattice.points) {
      const v = this._ctx.context.Int.const(
        `rcss-${RegionConstrainer._instanceIndex}-${p.y}-${p.x}`
      );
      if (this._complete) {
        this._solver.add(v.ge(1));
      } else {
        this._solver.add(v.ge(0));
      }
      this._solver.add(v.le(this._maxRegionSize));
      this._subtreeSizeGrid.set(p.toString(), v);
    }

    this._regionIdGrid = new Map();
    for (const p of this._lattice.points) {
      const v = this._ctx.context.Int.const(
        `rcid-${RegionConstrainer._instanceIndex}-${p.y}-${p.x}`
      );
      if (this._complete) {
        this._solver.add(v.ge(0));
      } else {
        this._solver.add(v.ge(-1));
      }
      this._solver.add(v.lt(this._lattice.points.length));
      const parent = this._parentGrid.get(p.toString())!;
      this._solver.add(parent.eq(X).implies(v.eq(-1)));
      const pointIndex = this._lattice.pointToIndex(p);
      if (pointIndex === undefined) throw new Error('Point index is undefined');
      this._solver.add(parent.eq(R).implies(v.eq(pointIndex)));
      this._regionIdGrid.set(p.toString(), v);
    }

    this._regionSizeGrid = new Map();
    for (const p of this._lattice.points) {
      const v = this._ctx.context.Int.const(
        `rcrs-${RegionConstrainer._instanceIndex}-${p.y}-${p.x}`
      );
      if (this._complete) {
        this._solver.add(v.ge(this._minRegionSize));
      } else {
        this._solver.add(v.ge(this._minRegionSize).or(v.eq(-1)));
      }
      this._solver.add(v.le(this._maxRegionSize));
      const parent = this._parentGrid.get(p.toString())!;
      const subtreeSize = this._subtreeSizeGrid.get(p.toString())!;
      this._solver.add(parent.eq(X).implies(v.eq(-1)));
      this._solver.add(parent.eq(R).implies(v.eq(subtreeSize)));
      this._regionSizeGrid.set(p.toString(), v);
    }
  }

  /**
   * Add constraints to the region modeling grids.
   */
  private _addConstraints() {
    const constrainSide = (p: PointString, sp: PointString, sd: number) => {
      this._solver.add(
        this._parentGrid
          .get(p)!
          .eq(X)
          .implies(this._parentGrid.get(sp)!.neq(sd))
      );
      this._solver.add(
        this._parentGrid
          .get(sp)!
          .eq(sd)
          .implies(
            this._ctx.context.And(
              this._regionIdGrid.get(p)!.eq(this._regionIdGrid.get(sp)!),
              this._regionSizeGrid.get(p)!.eq(this._regionSizeGrid.get(sp)!)
            )
          )
      );
    };

    const subtreeSizeTerm = (sp: PointString, sd: number) => {
      return this._ctx.context.If(
        this._parentGrid.get(sp)!.eq(sd),
        this._subtreeSizeGrid.get(sp)!,
        this._ctx.context.Int.val(0)
      );
    };

    for (const p of this._lattice.points) {
      const pStr = p.toString();
      const parent = this._parentGrid.get(pStr)!;
      const subtreeSizeTerms: Arith<Name>[] = [];

      for (const d of this._lattice.edgeSharingDirections()) {
        const sp = p.translate(d.vector);
        const spStr = sp.toString();
        if (this._parentGrid.has(spStr)) {
          const oppositeIndex = this._edgeSharingDirectionToIndex.get(
            this._lattice.oppositeDirection(d).toString()
          )!;
          constrainSide(pStr, spStr, oppositeIndex);
          subtreeSizeTerms.push(subtreeSizeTerm(spStr, oppositeIndex));
        } else {
          const dIndex = this._edgeSharingDirectionToIndex.get(d.toString())!;
          this._solver.add(parent.neq(dIndex));
        }
      }

      this._solver.add(
        this._subtreeSizeGrid
          .get(pStr)!
          .eq(
            this._ctx.context.Sum(
              this._ctx.context.If(parent.neq(X), 1, 0),
              ...subtreeSizeTerms
            )
          )
      );
    }
  }

  private _addRectangularConstraints() {
    for (const p of this._lattice.points) {
      const pStr = p.toString();
      const neighbors = this._lattice.edgeSharingNeighbors(
        this._regionIdGrid,
        p
      );
      for (const [n1, n2] of combinations(neighbors, 2)) {
        const n1Neighbors = this._lattice.edgeSharingNeighbors(
          this._regionIdGrid,
          n1.location
        );
        const n2Neighbors = this._lattice.edgeSharingNeighbors(
          this._regionIdGrid,
          n2.location
        );
        const commonPoints = new Set([
          ...n1Neighbors.map(n => n.location.toString()),
          ...n2Neighbors.map(n => n.location.toString()),
        ]);
        commonPoints.delete(pStr);
        for (const cp of commonPoints) {
          if (cp === pStr) commonPoints.delete(cp);
        }
        if (commonPoints.size > 0) {
          this._solver.add(
            this._ctx.context
              .And(
                n1.symbol.eq(this._regionIdGrid.get(pStr)!),
                n2.symbol.eq(this._regionIdGrid.get(pStr)!),
                this._regionIdGrid.get(pStr)!.neq(-1)
              )
              .implies(
                this._ctx.context.And(
                  ...Array.from(commonPoints).map(cp =>
                    this._regionIdGrid
                      .get(cp)!
                      .eq(this._regionIdGrid.get(pStr)!)
                  )
                )
              )
          );
        }
      }
    }
  }

  /**
   * Returns the `RegionConstrainer.parent_grid` value for the direction.
   *
   * For instance, if direction is (-1, 0), return the index for N.
   *
   * @param direction The direction to an edge-sharing cell.
   * @returns The `RegionConstrainer.parent_grid` value that means that the
   * parent in its region's subtree is the cell offset by that direction.
   */
  public edgeSharingDirectionToIndex(direction: Direction | DirectionString) {
    return this._edgeSharingDirectionToIndex.get(
      typeof direction === 'string' ? direction : direction.toString()
    )!;
  }

  /**
   * Returns the `RegionConstrainer.parent_grid` value for the parent type.
   *
   * The parent_type may be a direction name (like "N") or name of a special
   * value like "R" or "X".
   *
   * @param parentType The parent type.
   * @returns The corresponding `RegionConstrainer.parent_grid` value.
   */
  public parentTypeToIndex(parentType: string) {
    return this._parentTypeToIndex.get(parentType)!;
  }

  /**
   * The `Solver` associated with this `RegionConstrainer`.
   */
  public get solver() {
    return this._solver;
  }

  /**
   * A dictionary of numbers identifying regions.
   *
   * A region's identifier is the position in the grid (going in order from left
   * to right, top to bottom) of the root of that region's subtree. It is the
   * same as the index of the point in the lattice.
   */
  public get regionIdGrid() {
    return this._regionIdGrid;
  }

  /**
   * A dictionary of region sizes.
   */
  public get regionSizeGrid() {
    return this._regionSizeGrid;
  }

  /**
   * A dictionary of region subtree parent pointers.
   */
  public get parentGrid() {
    return this._parentGrid;
  }

  /**
   * A dictionary of cell subtree sizes.
   *
   * A cell's subtree size is one plus the number of cells that are descendents
   * of the cell in its region's subtree.
   */
  public get subtreeSizeGrid() {
    return this._subtreeSizeGrid;
  }

  /**
   * Prints the region parent assigned to each cell.
   *
   * Should be called only after the solver has been checked.
   */
  public treesToString() {
    const labels: Record<string, string> = {
      X: ' ',
      R: 'R',
      N: '\u2B61',
      E: '\u2B62',
      S: '\u2B63',
      W: '\u2B60',
      NE: '\u2B67',
      NW: '\u2B66',
      SE: '\u2B68',
      SW: '\u2B69',
    };

    const model = this._solver.model();

    const printFunction = (p: Point) => {
      const v = this._parentGrid.get(p.toString())!;
      const parentIndex = Number(model.eval(v));
      const parentType = this._parentTypes[parentIndex];
      return labels[parentType];
    };

    return this._lattice.toString(printFunction, ' ');
  }

  /**
   * Prints the region subtree size of each cell.
   *
   * Should be called only after the solver has been checked.
   */
  public subtreeSizesToString() {
    const model = this._solver.model();
    const printFunction = (p: Point) => {
      const v = this._subtreeSizeGrid.get(p.toString())!;
      const value = Number(model.eval(v));
      return value.toString().padStart(3, ' ');
    };

    return this._lattice.toString(printFunction, '   ');
  }

  /**
   * Prints a number identifying the region that owns each cell.
   *
   * Should be called only after the solver has been checked.
   */
  public regionIdsToString() {
    const model = this._solver.model();
    const printFunction = (p: Point) => {
      const v = this._regionIdGrid.get(p.toString())!;
      const value = Number(model.eval(v));
      return value.toString().padStart(3, ' ');
    };

    return this._lattice.toString(printFunction, '   ');
  }

  /**
   * Prints the size of the region that contains each cell.
   *
   * Should be called only after the solver has been checked.
   */
  public regionSizesToString() {
    const model = this._solver.model();
    const printFunction = (p: Point) => {
      const v = this._regionSizeGrid.get(p.toString())!;
      const value = Number(model.eval(v));
      return value.toString().padStart(3, ' ');
    };

    return this._lattice.toString(printFunction, '   ');
  }
}

export default function regions<Name extends string>(
  context: GrilopsContext<Name>
): {
  RegionConstrainer: new <
    const Core extends Solver<Name> | Optimize<Name> =
      | Solver<Name>
      | Optimize<Name>,
  >(
    lattice: Lattice,
    solver: Core | undefined,
    complete?: boolean,
    rectangular?: boolean,
    minRegionSize?: number | undefined,
    maxRegionSize?: number | undefined
  ) => RegionConstrainer<Name, Core>;
} {
  return {
    /**
     * @param lattice The structure of the grid.
     * @param solver A `Solver` object. If None, a `Solver` will be constructed.
     * @param complete If true, every cell must be part of a region. Defaults to
     * true.
     * @param rectangular If true, every region must be "rectangular"; for each
     * cell in a region, ensure that pairs of its neighbors that are part of
     * the same region each share an additional neighbor that's part of the
     * same region when possible.
     * @param minRegionSize The minimum possible size of a region.
     * @param maxRegionSize The maximum possible size of a region.
     */
    RegionConstrainer: function <
      const Core extends Solver<Name> | Optimize<Name> =
        | Solver<Name>
        | Optimize<Name>,
    >(
      lattice: Lattice,
      solver: Core | undefined = undefined,
      complete = true,
      rectangular = false,
      minRegionSize: number | undefined = undefined,
      maxRegionSize: number | undefined = undefined
    ) {
      return new RegionConstrainer<Name, Core>(
        context,
        lattice,
        solver,
        complete,
        rectangular,
        minRegionSize,
        maxRegionSize
      );
    },
  } as never;
}
