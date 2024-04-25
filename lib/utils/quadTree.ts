/**
 * @module quadTree Quadtree data structures for working with areas of points.
 */

import { Bool } from 'z3-solver';
import { Point } from '../geometry';
import { GrilopsContext } from './utils';

export type ExprFuncMap<Name extends string, ExprKey> = Map<
  ExprKey,
  (point: Point) => Bool<Name>
>;

/**
 * A quadtree for caching and aggregating z3 expressions.
 *
 * This class builds a quadtree data structure from a list of points, and
 * provides the ability to lazily construct and cache z3 expressions that
 * reference these points.
 */
export class ExpressionQuadTree<
  Name extends string,
  ExprKey extends string | number | symbol,
> {
  private readonly _ctx: GrilopsContext<Name>;
  private _exprs = new Map<ExprKey, Bool<Name>>();
  private _exprFuncs: ExprFuncMap<Name, ExprKey>;

  private _point: Point | undefined;
  private _yMin = Number.NaN;
  private _yMax = Number.NaN;
  private _xMin = Number.NaN;
  private _xMax = Number.NaN;
  private _yMid = Number.NaN;
  private _xMid = Number.NaN;
  private _tl: ExpressionQuadTree<Name, ExprKey> | undefined;
  private _tr: ExpressionQuadTree<Name, ExprKey> | undefined;
  private _bl: ExpressionQuadTree<Name, ExprKey> | undefined;
  private _br: ExpressionQuadTree<Name, ExprKey> | undefined;
  private _quads: ExpressionQuadTree<Name, ExprKey>[] = [];

  public constructor(
    context: GrilopsContext<Name>,
    points: Point[],
    exprFuncs?: ExprFuncMap<Name, ExprKey> | undefined
  ) {
    this._ctx = context;
    if (points.length === 0) {
      throw new Error(
        'A quadtree node must be constructed with at least one point'
      );
    }

    this._exprFuncs =
      exprFuncs ?? new Map<ExprKey, (point: Point) => Bool<Name>>();
    this._point = points.length === 1 ? points[0] : undefined;

    if (!this._point) {
      this._yMin = Math.min(...points.map(p => p.y));
      this._yMax = Math.max(...points.map(p => p.y));
      this._xMin = Math.min(...points.map(p => p.x));
      this._xMax = Math.max(...points.map(p => p.x));
      this._yMid = (this._yMin + this._yMax) / 2.0;
      this._xMid = (this._xMin + this._xMax) / 2.0;

      const make = (cond: (p: Point) => boolean) => {
        const quadPoints = points.filter(cond);
        if (quadPoints.length > 0) {
          return new ExpressionQuadTree(this._ctx, quadPoints, this._exprFuncs);
        }
        return undefined;
      };

      this._tl = make(p => p.y < this._yMid && p.x < this._xMid);
      this._tr = make(p => p.y < this._yMid && p.x >= this._xMid);
      this._bl = make(p => p.y >= this._yMid && p.x < this._xMid);
      this._br = make(p => p.y >= this._yMid && p.x >= this._xMid);
      this._quads = [this._tl, this._tr, this._bl, this._br].filter(
        Boolean
      ) as ExpressionQuadTree<Name, ExprKey>[];
    }
  }

  /**
   * Returns true if the given point is within this tree node's bounds.
   */
  public coversPoint(p: Point): boolean {
    if (this._point) {
      return this._point.equals(p);
    }
    return (
      p.y >= this._yMin &&
      p.y <= this._yMax &&
      p.x >= this._xMin &&
      p.x <= this._xMax
    );
  }

  /**
   * Registers an expression constructor, to be called for each point.
   */
  public addExpr(key: ExprKey, exprFunc: (point: Point) => Bool<Name>) {
    this._exprFuncs.set(key, exprFunc);
  }

  /**
   * Returns expressions for all points covered by this tree node.
   */
  public getExprs(key: ExprKey): Bool<Name>[] {
    if (this._point) {
      let expr = this._exprs.get(key);
      if (!expr) {
        expr = this._exprFuncs.get(key)!(this._point);
        this._exprs.set(key, expr);
      }
      return [expr];
    }
    return this._quads.flatMap(q => q.getExprs(key));
  }

  /**
   * Returns the expression for the given point.
   */
  public getPointExpr(key: ExprKey, p: Point): Bool<Name> {
    if (this._point) {
      if (this._point.equals(p)) {
        let expr = this._exprs.get(key);
        if (!expr) {
          expr = this._exprFuncs.get(key)!(this._point);
          this._exprs.set(key, expr);
        }
        return expr;
      }
      throw new Error(`Point ${p.toString()} not in QuadTree`);
    }
    if (this._tl && p.y < this._yMid && p.x < this._xMid) {
      return this._tl.getPointExpr(key, p);
    }
    if (this._tr && p.y < this._yMid && p.x >= this._xMid) {
      return this._tr.getPointExpr(key, p);
    }
    if (this._bl && p.y >= this._yMid && p.x < this._xMid) {
      return this._bl.getPointExpr(key, p);
    }
    if (this._br && p.y >= this._yMid && p.x >= this._xMid) {
      return this._br.getPointExpr(key, p);
    }
    throw new Error(`Point ${p.toString()} not in QuadTree`);
  }

  /**
   * Returns the conjunction of all expressions, excluding given points.
   */
  public getOtherPointsExpr(
    key: ExprKey,
    points: Point[]
  ): Bool<Name> | undefined {
    if (this._point) {
      if (!points.some(p => this._point!.equals(p))) {
        return this.getPointExpr(key, this._point);
      }
      return undefined;
    }

    const coveredPoints = points.filter(p => this.coversPoint(p));
    if (coveredPoints.length > 0) {
      const terms = this._quads
        .map(q => q.getOtherPointsExpr(key, coveredPoints))
        .filter(Boolean) as Bool<Name>[];
      return this._ctx.context.And(...terms);
    }

    let expr = this._exprs.get(key);
    if (!expr) {
      expr = this._ctx.context.And(...this.getExprs(key));
      this._exprs.set(key, expr);
    }
    return expr;
  }
}

export default function quadTree<Name extends string>(
  context: GrilopsContext<Name>
): {
  ExpressionQuadTree: new <ExprKey extends string | number | symbol>(
    points: Point[],
    exprFuncs?: ExprFuncMap<Name, ExprKey>
  ) => ExpressionQuadTree<Name, ExprKey>;
} {
  return {
    /**
     * A quadtree for caching and aggregating z3 expressions.
     *
     * This class builds a quadtree data structure from a list of points, and
     * provides the ability to lazily construct and cache z3 expressions that
     * reference these points.
     */
    ExpressionQuadTree: function <ExprKey extends string | number | symbol>(
      points: Point[],
      exprFuncs?: ExprFuncMap<Name, ExprKey>
    ) {
      return new ExpressionQuadTree<Name, ExprKey>(context, points, exprFuncs);
    },
  } as never;
}
