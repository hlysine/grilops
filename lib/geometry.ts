// This module supports geometric objects useful in modeling grids of cells.

import { Arith } from 'z3-solver';
import { zip } from './utils';

export type VectorString = `V(${string},${string})`;

/**
 * A vector representing an offset in two dimensions.
 */
export class Vector {
  /**
   * The relative distance in the y dimension.
   */
  dy: number;
  /**
   * The relative distance in the x dimension.
   */
  dx: number;

  public constructor(dy: number, dx: number) {
    this.dy = dy;
    this.dx = dx;
  }

  /**
   * Returns a vector that's the negation of this one.
   */
  public negate() {
    return new Vector(-this.dy, -this.dx);
  }

  /**
   * Translates this vector's endpoint in the given direction.
   */
  public translate(other: Vector) {
    return new Vector(this.dy + other.dy, this.dx + other.dx);
  }

  public toString(): VectorString {
    return `V(${this.dy},${this.dx})`;
  }
}

export type DirectionString = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

/**
 * A named direction vector that offsets by one space in the grid.
 */
export class Direction {
  /**
   * The name of the direction.
   */
  name: DirectionString;
  /**
   * The vector of the direction.
   */
  vector: Vector;

  public constructor(name: DirectionString, vector: Vector) {
    this.name = name;
    this.vector = vector;
  }
}

export type PointString = `P(${string},${string})`;

/**
 * A point, generally corresponding to the center of a grid cell.
 */
export class Point {
  /**
   * The location in the y dimension.
   */
  y: number;
  /**
   * The location in the x dimension.
   */
  x: number;

  public constructor(y: number, x: number) {
    this.y = y;
    this.x = x;
  }

  /**
   * Translates this point by the given `Vector` or `Direction`.
   */
  public translate(other: Vector | Direction) {
    if (other instanceof Direction) {
      other = other.vector;
    }
    return new Point(this.y + other.dy, this.x + other.dx);
  }

  public toString(): PointString {
    return `P(${this.y},${this.x})`;
  }

  public equals(other: Point): boolean {
    return this.y === other.y && this.x === other.x;
  }

  public static comparator(a: Point, b: Point): number {
    if (a.y < b.y) {
      return -1;
    } else if (a.y > b.y) {
      return 1;
    } else if (a.x < b.x) {
      return -1;
    } else if (a.x > b.x) {
      return 1;
    } else {
      return 0;
    }
  }
}

export type HookFunction = (point: Point) => string | undefined;

/**
 * Properties of a cell that is a neighbor of another.
 */
export class Neighbor<Name extends string> {
  /**
   * The location of the cell.
   */
  point: Point;
  /**
   * The direction from the original cell.
   */
  direction: Direction;
  /**
   * The symbol constant of the cell.
   */
  symbol: Arith<Name>;

  public constructor(point: Point, direction: Direction, symbol: Arith<Name>) {
    this.point = point;
    this.direction = direction;
    this.symbol = symbol;
  }
}

/**
 * A base class for defining the structure of a grid.
 */
export abstract class Lattice {
  private _vectorDirection: Map<VectorString, Direction>;

  public constructor() {
    this._vectorDirection = new Map();
    for (const direction of this.vertexSharingDirections()) {
      this._vectorDirection.set(direction.vector.toString(), direction);
    }
  }

  /**
   * The points in the lattice, sorted.
   */
  public abstract get points(): Point[];

  /**
   * Returns the index of a point in the lattice's ordered list.
   * @param point The `Point` to get the index of.
   * @returns The index of the point in the ordered list, or None if the point
   * is not in the list.
   */
  public abstract pointToIndex(point: Point): number | undefined;

  /**
   * A list of edge-sharing directions.
   * @returns A list of `Direction`s, each including the name of an edge-sharing
   * direction and the vector representing that direction. Edge sharing (also
   * known as orthogonal adjacency) is the relationship between grid cells
   * that share an edge.
   */
  public abstract edgeSharingDirections(): Direction[];

  /**
   * A list of vertex-sharing directions.
   * @returns A list of `Direction`s, each including the name of a
   * vertex-sharing direction and the vector representing that
   * direction. Vertex sharing (also known as touching adjacency) is the
   * relationship between grid cells that share a vertex.
   */
  public abstract vertexSharingDirections(): Direction[];

  /**
   * Given a direction, return the opposite direction.
   * @param direction The given `Direction`.
   * @returns The `Direction` opposite the given direction.
   */
  public oppositeDirection(direction: Direction): Direction {
    return this._vectorDirection.get(direction.vector.negate().toString())!;
  }

  /**
   * Returns a list of points that share an edge with the given cell.
   * @param point The point of the given cell.
   * @returns A list of `Point`s in the lattice that correspond to cells that
   * share an edge with the given cell.
   */
  public edgeSharingPoints(point: Point): Point[] {
    return this.edgeSharingDirections().map(direction =>
      point.translate(direction)
    );
  }

  /**
   * Returns a list of points that share a vertex with the given cell.
   * @param point The point of the given cell.
   * @returns A list of `Point`s in the lattice corresponding to cells that
   * share a vertex with the given cell.
   */
  public vertexSharingPoints(point: Point): Point[] {
    return this.vertexSharingDirections().map(direction =>
      point.translate(direction)
    );
  }

  /**
   * Returns a list of neighbors in the given directions of the given cell.
   * @param cellMap A dictionary mapping points in the lattice to z3 constants.
   * @param p Point of the given cell.
   * @param directions The given list of directions to find neighbors with.
   * @returns A list of `Neighbor`s corresponding to the cells that are in the
   * given directions from the given cell.
   */
  private static _getNeighbors<Name extends string>(
    cellMap: Map<PointString, Arith<Name>>,
    p: Point,
    directions: Direction[]
  ): Neighbor<Name>[] {
    const cells: Neighbor<Name>[] = [];
    for (const direction of directions) {
      const point = p.translate(direction);
      const cell = cellMap.get(point.toString());
      if (cell !== undefined) {
        cells.push(new Neighbor(point, direction, cell));
      }
    }
    return cells;
  }

  /**
   * Returns a list of neighbors sharing an edge with the given cell.
   * @param cellMap A dictionary mapping points in the lattice to z3 constants.
   * @param p Point of the given cell.
   * @returns A list of `Neighbor`s corresponding to the cells that share an
   * edge with the given cell.
   */
  public edgeSharingNeighbors<Name extends string>(
    cellMap: Map<PointString, Arith<Name>>,
    p: Point
  ): Neighbor<Name>[] {
    return Lattice._getNeighbors(cellMap, p, this.edgeSharingDirections());
  }

  /**
   * Returns a list of neighbors sharing a vertex with the given cell.
   * @param cellMap A dictionary mapping points in the lattice to z3 constants.
   * @param p Point of the given cell.
   * @returns A list of `Neighbor`s corresponding to the cells that share a
   * vertex with the given cell.
   */
  public vertexSharingNeighbors<Name extends string>(
    cellMap: Map<PointString, Arith<Name>>,
    p: Point
  ): Neighbor<Name>[] {
    return Lattice._getNeighbors(cellMap, p, this.vertexSharingDirections());
  }

  /**
   * Returns the label for a direction.
   * @param direction The direction to label.
   * @returns A label representing the direction.
   * @throws An error if there's no character defined for the direction.
   */
  public abstract labelForDirection(direction: Direction): string;

  /**
   * Returns the label for a pair of edge-sharing directions.
   * @param dir1 The first direction.
   * @param dir2 The second direction.
   * @returns A label representing both directions.
   * @throws An error if there's no character defined for the direction pair.
   */
  public abstract labelForDirectionPair(
    dir1: Direction,
    dir2: Direction
  ): string;

  /**
   * Returns a list of `Vector` transformations.
   *
   * Each returned transformation is a function that transforms a
   * `Vector` into a `Vector`. The returned list always contains at least
   * one transformation: the identity function.  The transformations
   * returned are all transformations satisfying the given constraints.
   *
   * @param allowRotations Whether rotation is an allowed transformation.
   * @param allowReflections Whether reflection is an allowed transformation.
   * @returns A list of `Vector` transformation functions.
   */
  public abstract transformationFunctions(
    allowRotations: boolean,
    allowReflections: boolean
  ): ((vector: Vector) => Vector)[];

  /**
   * Returns directions for use in a loop inside-outside check.
   *
   * The first direction returned is the direction to look, and the
   * remaining directions are the directions to check for crossings.
   *
   * For instance, on a rectangular grid, a valid return value would
   * be (north, [west]). This means that if you look north and count how many
   * west-going lines you cross, you can tell from its parity if you're inside
   * or outside the loop.
   *
   * @returns A tuple, the first component of which indicates the direction to
   * look, and the second component of which indicates what types of crossings
   * to count.
   */
  public abstract getInsideOutsideCheckDirections(): [Direction, Direction[]];

  /**
   * Prints something for each of the given points.
   * @param hookFunction A function implementing per-location display
   * behavior. It will be called for each `Point` in the lattice. If the
   * returned string has embedded newlines, it will be treated as a multi-line
   * element.  For best results, all elements should have the same number of
   * lines as each other and as blank (below).
   * @param ps The `Point`s to print something for.
   * @param blank What to print for `Point`s not in the lattice, or for when
   * the hook function returns None. Defaults to one space.  If it has
   * embedded newlines, it will be treated as a multi-line element.
   */
  private _pointsToString(
    hookFunction: HookFunction,
    ps: Point[],
    blank = ' '
  ) {
    const columns: string[][] = [];
    for (const p of ps) {
      let output: string | undefined;
      if (this.pointToIndex(p) !== undefined) {
        output = hookFunction(p);
      }
      output = output ?? blank;
      columns.push(output.split('\n'));
    }
    return zip(...columns)
      .map(row => row.join(''))
      .join('\n');
  }

  /**
   * Prints something for each space in the lattice.
   *
   * Printing is done from top to bottom and left to right.
   *
   * @param hookFunction A function implementing per-location display
   * behavior. It will be called for each `Point` in the lattice. If the
   * returned string has embedded newlines, it will be treated as a multi-line
   * element.  For best results, all elements should have the same number of
   * lines as each other and as blank (below).
   * @param blank What to print for `Point`s not in the lattice, or for when
   * the hook function returns None. Defaults to one space.  If it has
   * embedded newlines, it will be treated as a multi-line element.
   */
  public toString(hookFunction: HookFunction, blank = ' ') {
    let ret = '';
    const points = this.points;
    const minY = points[0].y;
    const maxY = points[points.length - 1].y;
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    for (let y = minY; y <= maxY; y++) {
      ret += this._pointsToString(
        hookFunction,
        Array.from(
          { length: maxX - minX + 1 },
          (_, x) => new Point(y, x + minX)
        ),
        blank
      );
    }
    return ret;
  }
}

export class RectangularLattice extends Lattice {
  private _points: Point[];
  private _pointIndices: Map<PointString, number>;

  /**
   * @param points A set of points corresponding to a rectangular lattice.
   * Note that these points need not fill a complete rectangle.
   */
  public constructor(points: Point[]) {
    super();
    this._points = points.sort(Point.comparator);
    this._pointIndices = new Map();
    this._points.forEach((p, i) => {
      this._pointIndices.set(p.toString(), i);
    });
  }

  public get points(): Point[] {
    return this._points;
  }

  public pointToIndex(point: Point): number | undefined {
    return this._pointIndices.get(point.toString());
  }

  public edgeSharingDirections(): Direction[] {
    return [
      new Direction('N', new Vector(-1, 0)),
      new Direction('S', new Vector(1, 0)),
      new Direction('E', new Vector(0, 1)),
      new Direction('W', new Vector(0, -1)),
    ];
  }

  public vertexSharingDirections(): Direction[] {
    return [
      ...this.edgeSharingDirections(),
      new Direction('NE', new Vector(-1, 1)),
      new Direction('NW', new Vector(-1, -1)),
      new Direction('SE', new Vector(1, 1)),
      new Direction('SW', new Vector(1, -1)),
    ];
  }

  public labelForDirection(direction: Direction): string {
    if (direction.name === 'N') {
      return '\u2575';
    }
    if (direction.name === 'E') {
      return '\u2576';
    }
    if (direction.name === 'S') {
      return '\u2577';
    }
    if (direction.name === 'W') {
      return '\u2574';
    }
    throw new Error('No single-character symbol for direction');
  }

  public labelForDirectionPair(dir1: Direction, dir2: Direction): string {
    if (dir1.name === 'N' && dir2.name === 'S') {
      return '\u2502';
    }
    if (dir1.name === 'E' && dir2.name === 'W') {
      return '\u2500';
    }
    if (dir1.name === 'N' && dir2.name === 'E') {
      return '\u2514';
    }
    if (dir1.name === 'S' && dir2.name === 'E') {
      return '\u250c';
    }
    if (dir1.name === 'S' && dir2.name === 'W') {
      return '\u2510';
    }
    if (dir1.name === 'N' && dir2.name === 'W') {
      return '\u2518';
    }
    throw new Error('No single-character symbol for direction pair');
  }

  public transformationFunctions(
    allowRotations: boolean,
    allowReflections: boolean
  ): ((vector: Vector) => Vector)[] {
    if (allowRotations) {
      if (allowReflections) {
        return [
          v => v,
          v => new Vector(v.dy, -v.dx),
          v => new Vector(-v.dy, v.dx),
          v => new Vector(-v.dy, -v.dx),
          v => new Vector(v.dx, v.dy),
          v => new Vector(v.dx, -v.dy),
          v => new Vector(-v.dx, v.dy),
          v => new Vector(-v.dx, -v.dy),
        ];
      } else {
        return [
          v => v,
          v => new Vector(v.dx, -v.dy),
          v => new Vector(-v.dy, -v.dx),
          v => new Vector(-v.dx, v.dy),
        ];
      }
    } else {
      if (allowReflections) {
        return [
          v => v,
          v => new Vector(v.dy, -v.dx),
          v => new Vector(-v.dy, v.dx),
        ];
      } else {
        return [v => v];
      }
    }
  }

  public getInsideOutsideCheckDirections(): [Direction, Direction[]] {
    const ds = this.edgeSharingDirections();
    return [ds.find(x => x.name === 'N')!, [ds.find(x => x.name === 'W')!]];
  }
}

export abstract class HexagonalLattice extends Lattice {
  private _points: Point[];
  private _pointIndices: Map<PointString, number>;
  private static _DIRECTION_LABELS = {
    N: '\u2595 \n  ',
    NE: ' \u2571\n  ',
    E: ' \u2581\n  ',
    SE: '  \n \u2572',
    S: '  \n\u2595 ',
    SW: '  \n\u2571 ',
    W: '\u2581 \n  ',
    NW: '\u2572 \n  ',
  };

  /**
   * A set of points forming a hexagonal lattice.
   *
   * This abstract class implements functions identical between
   * FlatToppedHexagonalLattice and PointyToppedHexagonalLattice.
   *
   * We use the doubled coordinates scheme described at
   * https://www.redblobgames.com/grids/hexagons/. That is, y describes
   * the row and x describes the column, so x + y is always even.
   */
  public constructor(points: Point[]) {
    super();
    for (const p of points) {
      if ((p.y + p.x) % 2 === 1) {
        throw new Error('Hexagonal coordinates must have an even sum.');
      }
    }
    this._points = points.sort(Point.comparator);
    this._pointIndices = new Map();
    this._points.forEach((p, i) => {
      this._pointIndices.set(p.toString(), i);
    });
  }

  public get points(): Point[] {
    return this._points;
  }

  public pointToIndex(point: Point): number | undefined {
    return this._pointIndices.get(point.toString());
  }

  public vertexSharingDirections(): Direction[] {
    return this.edgeSharingDirections();
  }

  public labelForDirection(direction: Direction): string {
    const label = HexagonalLattice._DIRECTION_LABELS[direction.name];
    if (label !== undefined) {
      return label;
    }
    throw new Error('No single-character symbol for direction');
  }

  public labelForDirectionPair(dir1: Direction, dir2: Direction): string {
    let ds = [dir1.name, dir2.name];
    function charForPos(dirs: string[], chars: string[]) {
      for (const [d, c] of zip(dirs, chars)) {
        if (ds.includes(d as DirectionString)) {
          ds = ds.filter(x => x !== d);
          return c.toString();
        }
      }
      return ' ';
    }
    const ul = charForPos(['NW', 'N', 'W'], ['\u2572', '\u2595', '\u2581']);
    const ur = charForPos(['NE', 'N', 'E'], ['\u2571', '\u258f', '\u2581']);
    const ll = charForPos(['SW', 'S', 'W'], ['\u2571', '\u2595', '\u2594']);
    const lr = charForPos(['SE', 'S', 'E'], ['\u2572', '\u258f', '\u2594']);
    return `${ul}${ur}\n${ll}${lr}`;
  }
}

/**
 * A set of points forming a flat-topped hexagonal lattice.
 *
 * All points must lie on a hexagonal lattice in which each hexagon has
 * a flat top. We use the doubled coordinates scheme described at
 * https://www.redblobgames.com/grids/hexagons/. That is, y describes
 * the row and x describes the column, so hexagons that are vertically
 * adjacent have their y coordinates differ by 2.
 */
export class FlatToppedHexagonalLattice extends HexagonalLattice {
  public edgeSharingDirections(): Direction[] {
    return [
      new Direction('N', new Vector(-2, 0)),
      new Direction('S', new Vector(2, 0)),
      new Direction('NE', new Vector(-1, 1)),
      new Direction('NW', new Vector(-1, -1)),
      new Direction('SE', new Vector(1, 1)),
      new Direction('SW', new Vector(1, -1)),
    ];
  }

  public transformationFunctions(
    allowRotations: boolean,
    allowReflections: boolean
  ): ((vector: Vector) => Vector)[] {
    if (allowRotations) {
      if (allowReflections) {
        return [
          v => v,
          v => new Vector((v.dy + 3 * v.dx) / 2, (-v.dy + v.dx) / 2),
          v => new Vector((-v.dy + 3 * v.dx) / 2, (-v.dy - v.dx) / 2),
          v => new Vector(-v.dy, -v.dx),
          v => new Vector((-v.dy - 3 * v.dx) / 2, (v.dy - v.dx) / 2),
          v => new Vector((v.dy - 3 * v.dx) / 2, (v.dy + v.dx) / 2),
          v => new Vector(-v.dy, v.dx),
          v => new Vector((-v.dy - 3 * v.dx) / 2, (-v.dy + v.dx) / 2),
          v => new Vector((v.dy - 3 * v.dx) / 2, (-v.dy - v.dx) / 2),
          v => new Vector(v.dy, -v.dx),
          v => new Vector((v.dy + 3 * v.dx) / 2, (v.dy - v.dx) / 2),
          v => new Vector((-v.dy + 3 * v.dx) / 2, (v.dy + v.dx) / 2),
        ];
      } else {
        return [
          v => v,
          v => new Vector((v.dy + 3 * v.dx) / 2, (-v.dy + v.dx) / 2),
          v => new Vector((-v.dy + 3 * v.dx) / 2, (-v.dy - v.dx) / 2),
          v => new Vector(-v.dy, -v.dx),
          v => new Vector((-v.dy - 3 * v.dx) / 2, (v.dy - v.dx) / 2),
          v => new Vector((v.dy - 3 * v.dx) / 2, (v.dy + v.dx) / 2),
        ];
      }
    } else {
      if (allowReflections) {
        return [
          v => v,
          v => new Vector(-v.dy, v.dx),
          v => new Vector((-v.dy - 3 * v.dx) / 2, (-v.dy + v.dx) / 2),
          v => new Vector((v.dy - 3 * v.dx) / 2, (-v.dy - v.dx) / 2),
          v => new Vector(v.dy, -v.dx),
          v => new Vector((v.dy + 3 * v.dx) / 2, (v.dy - v.dx) / 2),
          v => new Vector((-v.dy + 3 * v.dx) / 2, (v.dy + v.dx) / 2),
        ];
      } else {
        return [v => v];
      }
    }
  }

  public getInsideOutsideCheckDirections(): [Direction, Direction[]] {
    const ds = this.edgeSharingDirections();
    return [
      ds.find(x => x.name === 'N')!,
      [ds.find(x => x.name === 'NW')!, ds.find(x => x.name === 'SW')!],
    ];
  }
}

/**
 * A set of points forming a pointy-topped hexagonal lattice.
 *
 * All points must lie on a hexagonal lattice in which each hexagon has
 * a pointy top. We use the doubled coordinates scheme described at
 * https://www.redblobgames.com/grids/hexagons/. That is, y describes
 * the row and x describes the column, so hexagons that are horizontally
 * adjacent have their x coordinates differ by 2.
 */
export class PointyToppedHexagonalLattice extends HexagonalLattice {
  public edgeSharingDirections(): Direction[] {
    return [
      new Direction('E', new Vector(0, 2)),
      new Direction('W', new Vector(0, -2)),
      new Direction('NE', new Vector(-1, 1)),
      new Direction('NW', new Vector(-1, -1)),
      new Direction('SE', new Vector(1, 1)),
      new Direction('SW', new Vector(1, -1)),
    ];
  }

  public transformationFunctions(
    allowRotations: boolean,
    allowReflections: boolean
  ): ((vector: Vector) => Vector)[] {
    if (allowRotations) {
      if (allowReflections) {
        return [
          v => v,
          v => new Vector((v.dy + v.dx) / 2, (-3 * v.dy + v.dx) / 2),
          v => new Vector((-v.dy + v.dx) / 2, (-3 * v.dy - v.dx) / 2),
          v => new Vector(-v.dy, -v.dx),
          v => new Vector((-v.dy - v.dx) / 2, (3 * v.dy - v.dx) / 2),
          v => new Vector((v.dy - v.dx) / 2, (3 * v.dy + v.dx) / 2),
          v => new Vector(-v.dy, v.dx),
          v => new Vector((-v.dy - v.dx) / 2, (-3 * v.dy + v.dx) / 2),
          v => new Vector((v.dy - v.dx) / 2, (-3 * v.dy - v.dx) / 2),
          v => new Vector(v.dy, -v.dx),
          v => new Vector((v.dy + v.dx) / 2, (3 * v.dy - v.dx) / 2),
          v => new Vector((-v.dy + v.dx) / 2, (3 * v.dy + v.dx) / 2),
        ];
      } else {
        return [
          v => v,
          v => new Vector((v.dy + v.dx) / 2, (-3 * v.dy + v.dx) / 2),
          v => new Vector((-v.dy + v.dx) / 2, (-3 * v.dy - v.dx) / 2),
          v => new Vector(-v.dy, -v.dx),
          v => new Vector((-v.dy - v.dx) / 2, (3 * v.dy - v.dx) / 2),
          v => new Vector((v.dy - v.dx) / 2, (3 * v.dy + v.dx) / 2),
        ];
      }
    } else {
      if (allowReflections) {
        return [
          v => new Vector(-v.dy, v.dx),
          v => new Vector((-v.dy - v.dx) / 2, (-3 * v.dy + v.dx) / 2),
          v => new Vector((v.dy - v.dx) / 2, (-3 * v.dy - v.dx) / 2),
          v => new Vector(v.dy, -v.dx),
          v => new Vector((v.dy + v.dx) / 2, (3 * v.dy - v.dx) / 2),
          v => new Vector((-v.dy + v.dx) / 2, (3 * v.dy + v.dx) / 2),
        ];
      } else {
        return [v => v];
      }
    }
  }

  public getInsideOutsideCheckDirections(): [Direction, Direction[]] {
    const ds = this.edgeSharingDirections();
    return [
      ds.find(x => x.name === 'E')!,
      [ds.find(x => x.name === 'NW')!, ds.find(x => x.name === 'NE')!],
    ];
  }
}

/**
 * Returns a lattice of all points in a rectangle of the given dimensions.
 * @param height Height of the lattice.
 * @param width Width of the lattice.
 * @returns The lattice.
 */
export function getRectangleLattice(
  height: number,
  width: number
): RectangularLattice {
  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      points.push(new Point(y, x));
    }
  }
  return new RectangularLattice(points);
}

/**
 * Returns a lattice of all points in a square of the given height.
 * @param height Height of the lattice.
 * @returns The lattice.
 */
export function getSquareLattice(height: number): RectangularLattice {
  return getRectangleLattice(height, height);
}
