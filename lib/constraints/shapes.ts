import { AnySort, Arith, Bool, Expr, Optimize, Solver } from 'z3-solver';
import { Lattice, Point, PointString, Vector } from '../geometry';
import { DefaultMap, GrilopsContext } from '../utils/utils';
import { ExpressionQuadTree } from '../utils/quadTree';
import { PbEq, addToSolver } from '../utils/z3Shim';

export enum ShapeExprKey {
  HAS_INSTANCE_ID,
  NOT_HAS_INSTANCE_ID,
  HAS_SHAPE_TYPE,
}

export type Offset<Name extends string, Payload extends Expr<Name>> =
  | Vector
  | [Vector, Payload?];

/**
 * A shape defined by a list of `Vector` offsets.
 *
 * Each offset may optionally have an associated payload value.
 */
export class Shape<Name extends string, Payload extends Expr<Name>> {
  private readonly _ctx: GrilopsContext<Name>;
  private _offsetTuples: [Vector, Payload | undefined][] = [];

  /**
   * @param offsets A list of offsets that define the shape. An offset may be a
   * `Vector`; or, to optionally associate a payload value with the offset, it
   * may be a `[Vector, Payload]`. A payload may be any z3 expression.
   */
  public constructor(
    context: GrilopsContext<Name>,
    offsets: Offset<Name, Payload>[]
  ) {
    this._ctx = context;
    for (const offset of offsets) {
      if (offset instanceof Vector) {
        this._offsetTuples.push([offset, undefined]);
      } else if (Array.isArray(offset)) {
        const [vector, payload] = offset;
        this._offsetTuples.push([vector, payload]);
      } else {
        throw new Error(`Invalid shape offset: ${offset as string}`);
      }
    }
  }

  /**
   * The offset vectors that define this shape.
   */
  public get offsetVectors() {
    return this._offsetTuples.map(([vector]) => vector);
  }

  /**
   * The offset vector and payload value tuples for this shape.
   */
  public get offsetsWithPayloads() {
    return this._offsetTuples;
  }

  /**
   * Returns a new shape with each offset transformed by `f`.
   */
  public transform(f: (vector: Vector) => Vector): Shape<Name, Payload> {
    return new Shape(
      this._ctx,
      this._offsetTuples.map(([vector, payload]) => [f(vector), payload])
    );
  }

  /**
   * Returns a new shape that's canonicalized.
   *
   * A canonicalized shape is in sorted order and its first offset is
   * `Vector`(0, 0). This helps with deduplication, since equivalent shapes
   * will be canonicalized identically.
   *
   * @returns A `Shape` of offsets defining the canonicalized version of the
   * shape, i.e., in sorted order and with first offset equal to
   * `Vector`(0, 0).
   */
  public canonicalize(): Shape<Name, Payload> {
    const offsetTuples = this._offsetTuples
      .slice()
      .sort(([a], [b]) => Vector.comparator(a, b));
    const firstNegated = offsetTuples[0][0].negate();
    return new Shape(
      this._ctx,
      offsetTuples.map(([vector, payload]) => [
        vector.translate(firstNegated),
        payload,
      ])
    );
  }

  /**
   * Returns true iff the given shape is equivalent to this shape.
   */
  public equivalent(shape: Shape<Name, Payload>): boolean {
    if (this._offsetTuples.length !== shape._offsetTuples.length) {
      return false;
    }
    for (let i = 0; i < this._offsetTuples.length; i++) {
      const [v1, p1] = this._offsetTuples[i];
      const [v2, p2] = shape._offsetTuples[i];
      if (!v1.equals(v2)) {
        return false;
      }
      if (this._ctx.context.isExpr(p1) && this._ctx.context.isExpr(p2)) {
        if (!this._ctx.context.Eq(p1, p2)) {
          return false;
        }
      } else if (p1 === undefined) {
        if (p2 !== undefined) {
          return false;
        }
      } else if (p2 === undefined) {
        if (p1 !== undefined) {
          return false;
        }
      } else if (p1 !== p2) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Creates constraints for placing fixed shape regions into the grid.
 */
export class ShapeConstrainer<
  Name extends string,
  Payload extends Expr<Name>,
  const Core extends Solver<Name> | Optimize<Name> =
    | Solver<Name>
    | Optimize<Name>,
> {
  private static _instanceIndex = 0;

  private readonly _ctx: GrilopsContext<Name>;
  private readonly _solver: Core;
  private readonly _lattice: Lattice;
  private readonly _complete: boolean;
  private readonly _allowCopies: boolean;
  private readonly _shapes: Shape<Name, Payload>[];

  private _variants: Shape<Name, Payload>[][] = [];
  private _shapeTypeGrid: Map<PointString, Arith<Name>> = undefined!;
  private _shapeInstanceGrid: Map<PointString, Arith<Name>> = undefined!;
  private _shapePayloadGrid: Map<PointString, Payload> | undefined;

  /**
   * @param lattice The structure of the grid.
   * @param shapes A list of region shape definitions. The same region shape
   * definition may be included multiple times to indicate the number of times
   * that shape may appear (if allowCopies is false).
   * @param solver A `Solver` object. If undefined, a `Solver` will be constructed.
   * @param complete If true, every cell must be part of a shape region.
   * Defaults to false.
   * @param allowRotations If true, allow rotations of the shapes to be placed
   * in the grid. Defaults to false.
   * @param allowReflections If true, allow reflections of the shapes to be
   * placed in the grid. Defaults to false.
   * @param allowCopies If true, allow any number of copies of the shapes to
   * be placed in the grid. Defaults to false.
   */
  public constructor(
    context: GrilopsContext<Name>,
    lattice: Lattice,
    shapes: Shape<Name, Payload>[],
    solver: Core | undefined = undefined,
    complete = false,
    allowRotations = false,
    allowReflections = false,
    allowCopies = false
  ) {
    this._ctx = context;
    ShapeConstrainer._instanceIndex += 1;

    this._solver = solver ?? (new this._ctx.context.Solver() as Core);
    this._lattice = lattice;
    this._complete = complete;
    this._allowCopies = allowCopies;

    this._shapes = shapes;
    this._makeVariants(allowRotations, allowReflections);

    this._createGrids();
    this._addConstraints();
  }

  private _makeVariants(allowRotations: boolean, allowReflections: boolean) {
    const fs = this._lattice.transformationFunctions(
      allowRotations,
      allowReflections
    );
    this._variants = [];
    for (const shape of this._shapes) {
      const shapeVariants: Shape<Name, Payload>[] = [];
      for (const f of fs) {
        const variant = shape.transform(f).canonicalize();
        if (!shapeVariants.some(v => v.equivalent(variant))) {
          shapeVariants.push(variant);
        }
      }
      this._variants.push(shapeVariants);
    }
  }

  /**
   * Create the grids used to model shape region constraints.
   */
  private _createGrids() {
    this._shapeTypeGrid = new Map();
    for (const p of this._lattice.points) {
      const v = this._ctx.context.Int.const(
        `scst-${ShapeConstrainer._instanceIndex}-${p.y}-${p.x}`
      );
      if (this._complete) {
        this._solver.add(v.ge(0));
      } else {
        this._solver.add(v.ge(-1));
      }
      this._solver.add(v.lt(this._shapes.length));
      this._shapeTypeGrid.set(p.toString(), v);
    }

    this._shapeInstanceGrid = new Map();
    for (const p of this._lattice.points) {
      const v = this._ctx.context.Int.const(
        `scsi-${ShapeConstrainer._instanceIndex}-${p.y}-${p.x}`
      );
      if (this._complete) {
        this._solver.add(v.ge(0));
      } else {
        this._solver.add(v.ge(-1));
      }
      this._solver.add(v.lt(this._lattice.points.length));
      this._shapeInstanceGrid.set(p.toString(), v);
    }

    const samplePayload = this._shapes[0].offsetsWithPayloads[0][1];
    if (samplePayload) {
      this._shapePayloadGrid = new Map();
      let sort: AnySort<Name>;
      if (this._ctx.context.isExpr(samplePayload)) {
        sort = samplePayload.sort;
      } else if (typeof samplePayload === 'number') {
        sort = this._ctx.context.Int.sort();
      } else {
        throw new Error(
          `Could not determine z3 sort for ${samplePayload as string}`
        );
      }
      for (const p of this._lattice.points) {
        const pv = this._ctx.context.Const(
          `scsp-${ShapeConstrainer._instanceIndex}-${p.y}-${p.x}`,
          sort
        );
        this._shapePayloadGrid.set(p.toString(), pv as Payload);
      }
    }
  }

  private _addConstraints() {
    this._addGridAgreementConstraints();
    this._addShapeInstanceConstraints();
    if (!this._allowCopies) {
      for (let i = 0; i < this._shapes.length; i++) {
        this._addSingleCopyConstraints(i, this._shapes[i]);
      }
    }
  }

  private _addGridAgreementConstraints() {
    for (const [p, shapeType] of this._shapeTypeGrid) {
      this._solver.add(
        this._ctx.context.Or(
          this._ctx.context.And(
            shapeType.eq(-1),
            this._shapeInstanceGrid.get(p)!.eq(-1)
          ),
          this._ctx.context.And(
            shapeType.neq(-1),
            this._shapeInstanceGrid.get(p)!.neq(-1)
          )
        )
      );
    }
  }

  private _addShapeInstanceConstraints() {
    const intVals: Record<number, Arith<Name>> = {};
    for (
      let i = 0;
      i < Math.max(this._lattice.points.length, this._variants.length);
      i++
    ) {
      intVals[i] = this._ctx.context.Int.val(i);
    }

    const quadTree = new ExpressionQuadTree(this._ctx, this._lattice.points);
    for (const instanceId of this._lattice.points.map(
      p => this._lattice.pointToIndex(p)!
    )) {
      quadTree.addExpr(`${ShapeExprKey.HAS_INSTANCE_ID}-${instanceId}`, p =>
        this._ctx.context.Eq(
          this._shapeInstanceGrid.get(p.toString())!,
          intVals[instanceId]
        )
      );
      quadTree.addExpr(`${ShapeExprKey.NOT_HAS_INSTANCE_ID}-${instanceId}`, p =>
        this._ctx.context.Not(
          this._ctx.context.Eq(
            this._shapeInstanceGrid.get(p.toString())!,
            intVals[instanceId]
          )
        )
      );
    }
    for (let shapeIndex = 0; shapeIndex < this._variants.length; shapeIndex++) {
      quadTree.addExpr(`${ShapeExprKey.HAS_SHAPE_TYPE}-${shapeIndex}`, p =>
        this._ctx.context.Eq(
          this._shapeTypeGrid.get(p.toString())!,
          intVals[shapeIndex]
        )
      );
    }

    const rootOptions = new DefaultMap<PointString, Bool<Name>[]>(() => []);
    for (let shapeIndex = 0; shapeIndex < this._variants.length; shapeIndex++) {
      for (const variant of this._variants[shapeIndex]) {
        for (const rootPoint of this._lattice.points) {
          const instanceId = this._lattice.pointToIndex(rootPoint)!;
          const pointPayloadTuples: [Point, Payload | undefined][] = [];
          for (const [offsetVector, payload] of variant.offsetsWithPayloads) {
            const point = rootPoint.translate(offsetVector);
            if (!this._shapeInstanceGrid.has(point.toString())) {
              pointPayloadTuples.length = 0;
              break;
            }
            pointPayloadTuples.push([point, payload]);
          }
          if (pointPayloadTuples.length > 0) {
            const andTerms: Bool<Name>[] = [];
            for (const [point, payload] of pointPayloadTuples) {
              andTerms.push(
                quadTree.getPointExpr(
                  `${ShapeExprKey.HAS_INSTANCE_ID}-${instanceId}`,
                  point
                )
              );
              andTerms.push(
                quadTree.getPointExpr(
                  `${ShapeExprKey.HAS_SHAPE_TYPE}-${shapeIndex}`,
                  point
                )
              );
              if (this._shapePayloadGrid) {
                andTerms.push(
                  this._shapePayloadGrid.get(point.toString())!.eq(payload!)
                );
              }
            }
            const otherPointsExpr = quadTree.getOtherPointsExpr(
              `${ShapeExprKey.NOT_HAS_INSTANCE_ID}-${instanceId}`,
              pointPayloadTuples.map(([point]) => point)
            );
            if (otherPointsExpr) {
              andTerms.push(otherPointsExpr);
            }
            rootOptions
              .get(rootPoint.toString())
              .push(this._ctx.context.And(...andTerms));
          }
        }
      }
    }
    for (const p of this._lattice.points) {
      const instanceId = this._lattice.pointToIndex(p)!;
      const notHasInstanceIdExpr = quadTree.getOtherPointsExpr(
        `${ShapeExprKey.NOT_HAS_INSTANCE_ID}-${instanceId}`,
        []
      )!;
      const orTerms = rootOptions.get(p.toString());
      if (orTerms.length > 0) {
        orTerms.push(notHasInstanceIdExpr);
        this._solver.add(this._ctx.context.Or(...orTerms));
      } else {
        this._solver.add(notHasInstanceIdExpr);
      }
    }
  }

  private _addSingleCopyConstraints(
    shapeIndex: number,
    shape: Shape<Name, Payload>
  ) {
    const sumTerms: [Bool<Name>, number][] = [];
    for (const shapeType of this._shapeTypeGrid.values()) {
      sumTerms.push([shapeType.eq(shapeIndex), 1]);
    }
    addToSolver(
      this._ctx,
      this._solver,
      PbEq(this._ctx, sumTerms, shape.offsetsWithPayloads.length)
    );
  }

  /**
   * The `Solver` associated with this `ShapeConstrainer`.
   */
  public get solver(): Core {
    return this._solver;
  }

  /**
   * A dictionary of z3 constants of shape types.
   *
   * Each cell contains the index of the shape type placed in that cell (as
   * indexed by the shapes list passed in to the `ShapeConstrainer`
   * constructor), or -1 if no shape is placed within that cell.
   */
  public get shapeTypeGrid(): Map<PointString, Arith<Name>> {
    return this._shapeTypeGrid;
  }

  public getShapeTypeAt(p: Point): Arith<Name> {
    return this._shapeTypeGrid.get(p.toString())!;
  }

  /**
   * z3 constants of shape instance IDs.
   *
   * Each cell contains a number shared among all cells containing the same
   * instance of the shape, or -1 if no shape is placed within that cell.
   */
  public get shapeInstanceGrid(): Map<PointString, Arith<Name>> {
    return this._shapeInstanceGrid;
  }

  public getShapeInstanceAt(p: Point): Arith<Name> {
    return this._shapeInstanceGrid.get(p.toString())!;
  }

  /**
   * z3 constants of the shape offset payloads initially provided.
   *
   * undefined if no payloads were provided during construction.
   */
  public get shapePayloadGrid(): Map<PointString, Payload> | undefined {
    return this._shapePayloadGrid;
  }

  public getShapePayloadAt(p: Point): Payload {
    return this._shapePayloadGrid!.get(p.toString())!;
  }

  /**
   * Prints the shape type assigned to each cell.
   *
   * Should be called only after the solver has been checked.
   */
  public shapeTypesToString(): string {
    const model = this._solver.model();
    const points = [...this._shapeTypeGrid.keys()].map(Point.fromString);
    const minY = Math.min(...points.map(p => p.y));
    const minX = Math.min(...points.map(p => p.x));
    const maxY = Math.max(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x));
    let result = '';
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p = new Point(y, x);
        let shapeIndex = -1;
        if (this._shapeTypeGrid.has(p.toString())) {
          const v = this._shapeTypeGrid.get(p.toString())!;
          shapeIndex = Number(model.eval(v));
        }
        if (shapeIndex >= 0) {
          result += shapeIndex.toString().padStart(3, ' ');
        } else {
          result += '   ';
        }
      }
      result += '\n';
    }
    return result;
  }

  /**
   * Prints the shape instance ID assigned to each cell.
   *
   * Should be called only after the solver has been checked.
   */
  public shapeInstancesToString(): string {
    const model = this._solver.model();
    const points = [...this._shapeInstanceGrid.keys()].map(Point.fromString);
    const minY = Math.min(...points.map(p => p.y));
    const minX = Math.min(...points.map(p => p.x));
    const maxY = Math.max(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x));
    let result = '';
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p = new Point(y, x);
        let shapeInstance = -1;
        if (this._shapeInstanceGrid.has(p.toString())) {
          const v = this._shapeInstanceGrid.get(p.toString())!;
          shapeInstance = Number(model.eval(v));
        }
        if (shapeInstance >= 0) {
          result += shapeInstance.toString().padStart(3, ' ');
        } else {
          result += '   ';
        }
      }
      result += '\n';
    }
    return result;
  }
}

export default function shapes<Name extends string>(
  context: GrilopsContext<Name>
): {
  Shape: new <Payload extends Expr<Name>>(
    offsets: Offset<Name, Payload>[]
  ) => Shape<Name, Payload>;
  ShapeConstrainer: new <
    Payload extends Expr<Name>,
    const Core extends Solver<Name> | Optimize<Name> =
      | Solver<Name>
      | Optimize<Name>,
  >(
    lattice: Lattice,
    shapes: Shape<Name, Payload>[],
    solver: Core | undefined,
    complete: boolean,
    allowRotations: boolean,
    allowReflections: boolean,
    allowCopies: boolean
  ) => ShapeConstrainer<Name, Payload, Core>;
} {
  return {
    /**
     * @param offsets A list of offsets that define the shape. An offset may be a
     * `Vector`; or, to optionally associate a payload value with the offset, it
     * may be a `[Vector, Payload]`. A payload may be any z3 expression.
     */
    Shape: function <Payload extends Expr<Name>>(
      offsets: Offset<Name, Payload>[]
    ) {
      return new Shape<Name, Payload>(context, offsets);
    },
    /**
     * @param lattice The structure of the grid.
     * @param shapes A list of region shape definitions. The same region shape
     * definition may be included multiple times to indicate the number of times
     * that shape may appear (if allowCopies is false).
     * @param solver A `Solver` object. If undefined, a `Solver` will be constructed.
     * @param complete If true, every cell must be part of a shape region.
     * Defaults to false.
     * @param allowRotations If true, allow rotations of the shapes to be placed
     * in the grid. Defaults to false.
     * @param allowReflections If true, allow reflections of the shapes to be
     * placed in the grid. Defaults to false.
     * @param allowCopies If true, allow any number of copies of the shapes to
     * be placed in the grid. Defaults to false.
     */
    ShapeConstrainer: function <
      Payload extends Expr<Name>,
      const Core extends Solver<Name> | Optimize<Name> =
        | Solver<Name>
        | Optimize<Name>,
    >(
      lattice: Lattice,
      shapes: Shape<Name, Payload>[],
      solver: Core | undefined = undefined,
      complete = false,
      allowRotations = false,
      allowReflections = false,
      allowCopies = false
    ) {
      return new ShapeConstrainer<Name, Payload, Core>(
        context,
        lattice,
        shapes,
        solver,
        complete,
        allowRotations,
        allowReflections,
        allowCopies
      );
    },
  } as never;
}
