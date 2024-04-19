// Optimizations for constructing z3 expressions that skip safety checks.

import { Bool, Expr } from 'z3-solver';
import { GrilopsContext } from './utils';

export default function fastZ3<Name extends string>({
  Context,
  Z3,
}: GrilopsContext<Name>) {
  return {
    /**
     * Equivalent of z3 And.
     */
    fastAnd(...args: Bool<Name>[]) {
      return Context.Bool.ptr(
        Z3.mk_and(
          Context.ptr,
          args.map(a => a.ast)
        )
      );
    },
    /**
     * Equivalent of z3 Eq.
     */
    fastEq(a: Expr<Name>, b: Expr<Name>) {
      return Context.Bool.ptr(Z3.mk_eq(Context.ptr, a.ast, b.ast));
    },
    /**
     * Equivalent of z3 Ne.
     */
    fastNe(...args: Expr<Name>[]) {
      return Context.Bool.ptr(
        Z3.mk_distinct(
          Context.ptr,
          args.map(a => a.ast)
        )
      );
    },
  };
}
