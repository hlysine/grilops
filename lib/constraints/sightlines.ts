/**
 * @module sightlines This module supports puzzles that must check sightlines through grids.
 *
 * A sightline is a straight line through a symbol grid. It may have a stopping
 * condition, determined based on the symbol encountered in the grid, which, when
 * satisfied, results in no further symbols along the line being counted. It may
 * also have a custom counting or accumulation function.
 *
 * A sightline always stops when it reaches a point not in the grid. So, if the
 * grid is not convex, a sightline might stop at a hole in the middle of the
 * grid. If it is desired that a sightline continues through such holes, the
 * holes should be treated as part of the grid, e.g., as black cells.
 */

import { Arith, Bool } from 'z3-solver';
import { Direction, Point } from '../geometry';
import { SymbolGrid } from '../grids';
import { GrilopsContext, zip } from '../utils/utils';

/**
 * Returns a computation of a sightline through a grid.
 * @param context The context in which to construct the constraints.
 * @param symbolGrid The grid to check against.
 * @param start The location of the cell where the sightline should begin.
 * This is the first cell checked.
 * @param direction The direction to advance to reach the next cell in the
 * sightline.
 * @param initializer The initial value for the accumulator.
 * @param accumulate A function that accepts an accumulated value, a symbol,
 * and (optionally) a point as arguments, and returns a new accumulated
 * value. This function is used to determine a new accumulated value for
 * each cell along the sightline, based on the accumulated value from the
 * previously encountered cells as well as the point and/or symbol of the
 * current cell.
 * @param stop A function that accepts an accumulated value, a symbol, and
 * (optionally) a point as arguments, and returns True if we should stop
 * following the sightline when this symbol or point is encountered. By
 * default, the sightline will continue to the edge of the grid.
 * @returns The accumulated value.
 */
export function reduceCells<
  Name extends string,
  Accumulator extends Arith<Name>,
>(
  context: GrilopsContext<Name>,
  symbolGrid: SymbolGrid<Name>,
  start: Point,
  direction: Direction,
  initializer: Accumulator,
  accumulate: (a: Accumulator, c: Arith<Name>, p: Point) => Accumulator,
  stop: (a: Accumulator, c: Arith<Name>, p: Point) => Bool<Name> = () =>
    context.context.Bool.val(false)
) {
  const stopTerms: Bool<Name>[] = [];
  const accTerms: Accumulator[] = [initializer];
  let p = start;
  while (symbolGrid.grid.has(p.toString())) {
    const cell = symbolGrid.grid.get(p.toString())!;
    const accTerm = accumulate(accTerms[accTerms.length - 1], cell, p);
    accTerms.push(accTerm);
    stopTerms.push(stop(accTerm, cell, p));
    p = p.translate(direction.vector);
  }
  let expr = accTerms.pop()!;
  for (const [stopTerm, accTerm] of zip(
    stopTerms.reverse(),
    accTerms.reverse()
  )) {
    expr = context.context.If(stopTerm, accTerm, expr) as Accumulator;
  }
  return expr;
}

/**
 * Returns a count of cells along a sightline through a grid.
 * @param context The context in which to construct the constraints.
 * @param symbolGrid The grid to check against.
 * @param start The location of the cell where the sightline should begin.
 * This is the first cell checked.
 * @param direction The direction to advance to reach the next cell in the
 * sightline.
 * @param count A function that accepts a symbol as an argument and returns the
 * integer value to add to the count when this symbol is encountered. By
 * default, each symbol will count with a value of one.
 * @param stop A function that accepts a symbol as an argument and returns True
 * if we should stop following the sightline when this symbol is
 * encountered. By default, the sightline will continue to the edge of the
 * grid.
 * @returns An `Arith` for the count of cells along the sightline through the
 * grid.
 */
export function countCells<Name extends string>(
  context: GrilopsContext<Name>,
  symbolGrid: SymbolGrid<Name>,
  start: Point,
  direction: Direction,
  count: (c: Arith<Name>) => Arith<Name> = _ => context.context.Int.val(1),
  stop: (c: Arith<Name>) => Bool<Name> = _ => context.context.Bool.val(false)
) {
  return reduceCells<Name, Arith<Name>>(
    context,
    symbolGrid,
    start,
    direction,
    context.context.Int.val(0),
    (a, c) => a.add(count(c)),
    (_, c) => stop(c)
  );
}

export default function sightlines<Name extends string>(
  context: GrilopsContext<Name>
) {
  return {
    /**
     * Returns a computation of a sightline through a grid.
     * @param context The context in which to construct the constraints.
     * @param symbolGrid The grid to check against.
     * @param start The location of the cell where the sightline should begin.
     * This is the first cell checked.
     * @param direction The direction to advance to reach the next cell in the
     * sightline.
     * @param initializer The initial value for the accumulator.
     * @param accumulate A function that accepts an accumulated value, a symbol,
     * and (optionally) a point as arguments, and returns a new accumulated
     * value. This function is used to determine a new accumulated value for
     * each cell along the sightline, based on the accumulated value from the
     * previously encountered cells as well as the point and/or symbol of the
     * current cell.
     * @param stop A function that accepts an accumulated value, a symbol, and
     * (optionally) a point as arguments, and returns True if we should stop
     * following the sightline when this symbol or point is encountered. By
     * default, the sightline will continue to the edge of the grid.
     * @returns The accumulated value.
     */
    reduceCells: <Accumulator extends Arith<Name>>(
      symbolGrid: SymbolGrid<Name>,
      start: Point,
      direction: Direction,
      initializer: Accumulator,
      accumulate: (a: Accumulator, c: Arith<Name>, p: Point) => Accumulator,
      stop: (a: Accumulator, c: Arith<Name>, p: Point) => Bool<Name> = () =>
        context.context.Bool.val(false)
    ) => {
      return reduceCells(
        context,
        symbolGrid,
        start,
        direction,
        initializer,
        accumulate,
        stop
      );
    },
    /**
     * Returns a count of cells along a sightline through a grid.
     * @param context The context in which to construct the constraints.
     * @param symbolGrid The grid to check against.
     * @param start The location of the cell where the sightline should begin.
     * This is the first cell checked.
     * @param direction The direction to advance to reach the next cell in the
     * sightline.
     * @param count A function that accepts a symbol as an argument and returns the
     * integer value to add to the count when this symbol is encountered. By
     * default, each symbol will count with a value of one.
     * @param stop A function that accepts a symbol as an argument and returns True
     * if we should stop following the sightline when this symbol is
     * encountered. By default, the sightline will continue to the edge of the
     * grid.
     * @returns An `Arith` for the count of cells along the sightline through the
     * grid.
     */
    countCells: (
      symbolGrid: SymbolGrid<Name>,
      start: Point,
      direction: Direction,
      count: (c: Arith<Name>) => Arith<Name> = _ => context.context.Int.val(1),
      stop: (c: Arith<Name>) => Bool<Name> = _ =>
        context.context.Bool.val(false)
    ) => {
      return countCells(context, symbolGrid, start, direction, count, stop);
    },
  };
}
