/**
 * @module z3Shim A shim for the z3-solver library that allows easy access of some low-level
 * Z3 functionality.
 */

import { Expr, Optimize, Solver, Z3_ast, Z3_error_code } from 'z3-solver';
import { GrilopsContext } from './utils';

export function throwIfError<Name extends string>(
  context: GrilopsContext<Name>
) {
  if (context.z3.get_error_code(context.context.ptr) !== Z3_error_code.Z3_OK) {
    throw new Error(
      context.z3.get_error_msg(
        context.context.ptr,
        context.z3.get_error_code(context.context.ptr)
      )
    );
  }
}

export function check<T, Name extends string>(
  context: GrilopsContext<Name>,
  val: T
): T {
  throwIfError(context);
  return val;
}

export function addToSolver<Name extends string>(
  context: GrilopsContext<Name>,
  solver: Solver<Name> | Optimize<Name>,
  expr: Z3_ast
) {
  if (solver.__typename === 'Solver') {
    context.z3.solver_assert(context.context.ptr, solver.ptr, expr);
  } else {
    context.z3.optimize_assert(context.context.ptr, solver.ptr, expr);
  }
  throwIfError(context);
}

export function PbEq<Name extends string>(
  context: GrilopsContext<Name>,
  terms: [Expr<Name>, number][],
  k: number
) {
  const args = terms.map(([expr, _]) => expr.ast);
  const weights = terms.map(([_, weight]) => weight);
  return check(
    context,
    context.z3.mk_pbeq(context.context.ptr, args, weights, k)
  );
}
