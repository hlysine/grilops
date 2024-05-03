import { init } from 'z3-solver';
import { grilops } from '../lib';

export default async function testPaths(updateText: (val: string) => void) {
  // initialize z3
  const { Z3, Context } = await init();
  const ctx = Context('main');

  // initialize grilops
  const {
    PathSymbolSet,
    getRectangleLattice,
    SymbolGrid,
    PathConstrainer,
    Point,
  } = grilops({
    z3: Z3,
    context: ctx,
  });

  // here, a symbol set refers to all possible values that a cell can take
  // while a lattice refers to the shape of the grid
  const lattice = getRectangleLattice(10, 10);
  const symbolSet = new PathSymbolSet(lattice);
  symbolSet.append('BLANK', '.');

  // You can use a solver or an optimizer here
  // a solver is adequate most of the time, and it has better performance
  // this is just a demo of how the optimizer can be used
  const grid = new SymbolGrid(lattice, symbolSet, new ctx.Solver());

  // DEMO CONSTRAINTS
  const pc = new PathConstrainer(grid, false, true, false);
  grid.solver.add(
    pc.pathInstanceGrid
      .get(new Point(0, 0))!
      .eq(pc.pathInstanceGrid.get(new Point(8, 8))!)
  );
  grid.solver.add(grid.cellAt(new Point(0, 0)).neq(symbolSet.indices.BLANK));

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
    result += pc.pathNumberingToString();
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
      result += pc.pathNumberingToString();
      result += '\n\n';
    }
  }
  updateText(result);
}
