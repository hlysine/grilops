import { init } from 'z3-solver';
import { grilops } from '../lib';

export default async function testSightline(updateText: (val: string) => void) {
  // initialize z3
  const { Z3, Context } = await init();
  const ctx = Context('main');

  // initialize grilops
  const {
    SymbolSet,
    getRectangleLattice,
    SymbolGrid,
    Point,
    countCells,
    RectangularLattice,
  } = grilops({
    z3: Z3,
    context: ctx,
  });

  // here, a symbol set refers to all possible values that a cell can take
  // while a lattice refers to the shape of the grid
  const symbolSet = new SymbolSet([
    ['EMPTY', '.'],
    ['DARK', '#'],
    ['LIGHT', '*'],
  ]);
  const lattice = getRectangleLattice(10, 10);

  // You can use a solver or an optimizer here
  // a solver is adequate most of the time, and it has better performance
  // this is just a demo of how the optimizer can be used
  const grid = new SymbolGrid(lattice, symbolSet, new ctx.Solver('QF_FD'));

  // DEMO CONSTRAINTS

  // add some sightline constraints
  for (let i = 0; i < 8; i++) {
    const cell = grid.cellAt(new Point(i, 0));
    grid.solver.add(cell.neq(symbolSet.indices.EMPTY));
    const count = countCells(
      grid,
      new Point(i, 0),
      RectangularLattice.EDGE_DIRECTIONS.E,
      c => ctx.If(c.eq(cell), ctx.Int.val(1), ctx.Int.val(0)),
      c => c.neq(cell)
    );
    grid.solver.add(count.eq(ctx.Int.val(i + 1)));
  }

  // run the solver by calling the solve method
  // the solution can be found in grid.solver.model if it exists
  let result = '';
  console.time('solve');
  const solution = await grid.solve();
  console.timeEnd('solve');
  result += solution ? 'sat' : 'unsat';
  result += '\n\n';
  if (solution) {
    result += grid.toString();
    result += '\n\n';
    updateText(result);

    // isUnique runs the solver again while excluding the current solution
    // grid.solver.model will be updated with the new solution if it exists
    console.time('isUnique');
    const unique = await grid.isUnique();
    console.timeEnd('isUnique');
    result += unique ? 'unique' : 'not unique';
    result += '\n\n';
    if (!unique) {
      result += grid.toString();
      result += '\n\n';
    }
  }
  updateText(result);
}
