import { init } from 'z3-solver';

export async function z3Solve() {
  const { Context } = await init();
  const { Solver, Int, And } = Context('main');

  const x = Int.const('x');

  const solver = new Solver();
  solver.add(And(x.ge(0), x.le(9)));
  return await solver.check();
}
