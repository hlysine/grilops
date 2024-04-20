// Optimizations for constructing z3 expressions that skip safety checks.

import { Bool, Expr } from 'z3-solver';
import { GrilopsContext } from './utils';

export default function fastZ3<Name extends string>({
  context,
  lowLevel,
}: GrilopsContext<Name>) {
  return {
    /**
     * Equivalent of z3 And.
     */
    fastAnd(...args: Bool<Name>[]) {
      return context.Bool.ptr(
        lowLevel.mk_and(
          context.ptr,
          args.map(a => a.ast)
        )
      );
    },
    /**
     * Equivalent of z3 Eq.
     */
    fastEq(a: Expr<Name>, b: Expr<Name>) {
      return context.Bool.ptr(lowLevel.mk_eq(context.ptr, a.ast, b.ast));
    },
    /**
     * Equivalent of z3 Ne.
     */
    fastNe(...args: Expr<Name>[]) {
      return context.Bool.ptr(
        lowLevel.mk_distinct(
          context.ptr,
          args.map(a => a.ast)
        )
      );
    },
  };
}
