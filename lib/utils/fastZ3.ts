// Optimizations for constructing z3 expressions that skip safety checks.

import { Bool, Expr } from 'z3-solver';
import { GrilopsContext } from './utils';

/**
 * Equivalent of z3 And.
 */
export function fastAnd<Name extends string>(
  context: GrilopsContext<Name>,
  ...args: Bool<Name>[]
) {
  return context.context.Bool.ptr(
    context.lowLevel.mk_and(
      context.context.ptr,
      args.map(a => a.ast)
    )
  );
}

/**
 * Equivalent of z3 Eq.
 */
export function fastEq<Name extends string>(
  context: GrilopsContext<Name>,
  a: Expr<Name>,
  b: Expr<Name>
) {
  return context.context.Bool.ptr(
    context.lowLevel.mk_eq(context.context.ptr, a.ast, b.ast)
  );
}

/**
 * Equivalent of z3 Ne.
 */
export function fastNe<Name extends string>(
  context: GrilopsContext<Name>,
  ...args: Expr<Name>[]
) {
  return context.context.Bool.ptr(
    context.lowLevel.mk_distinct(
      context.context.ptr,
      args.map(a => a.ast)
    )
  );
}

export default function fastZ3<Name extends string>(
  context: GrilopsContext<Name>
) {
  return {
    /**
     * Equivalent of z3 And.
     */
    fastAnd: (...args: Bool<Name>[]) => fastAnd(context, ...args),
    /**
     * Equivalent of z3 Eq.
     */
    fastEq: (a: Expr<Name>, b: Expr<Name>) => fastEq(context, a, b),
    /**
     * Equivalent of z3 Ne.
     */
    fastNe: (...args: Expr<Name>[]) => fastNe(context, ...args),
  };
}
