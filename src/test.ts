import { init } from 'z3-solver';
import { grilops } from '../lib';

export default async function test(updateText: (val: string) => void) {
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
    RegionConstrainer,
    ShapeConstrainer,
    Shape,
    Vector,
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

  // add some shape constraints
  const sc = new ShapeConstrainer(
    lattice,
    [
      new Shape([
        new Vector(0, 0),
        new Vector(0, 1),
        new Vector(1, 0),
        new Vector(1, 1),
      ]),
    ],
    grid.solver,
    false,
    true,
    true,
    true
  );
  lattice.points.forEach(p =>
    grid.solver.add(
      grid
        .cellAt(p)
        .neq(symbolSet.indices.DARK)
        .implies(sc.getShapeTypeAt(p).eq(-1))
    )
  );

  // add some region constraints
  const rc = new RegionConstrainer(lattice, grid.solver);
  grid.solver.add(rc.regionSizeGrid.get(new Point(0, 0))!.eq(1));
  for (const p of lattice.points) {
    for (const np of lattice.edgeSharingNeighbors(grid.grid, p)) {
      grid.solver.add(
        grid
          .cellAt(p)
          .eq(grid.cellAt(np.location))
          .eq(rc.regionIdGrid.get(p)!.eq(rc.regionIdGrid.get(np.location)!))
      );
    }
  }

  // optimize for the fewest number of filled cells
  // grid.solver.minimize(
  //   ctx.Sum(
  //     ctx.Int.val(0),
  //     ...[...grid.grid.values()].map(c =>
  //       ctx.If(c.eq(symbolSet.indices.EMPTY), ctx.Int.val(0), ctx.Int.val(1))
  //     )
  //   )
  // );

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
    result += sc
      .shapeTypesToString()
      .replace(/ {2}(.)/g, '$1')
      .replace(/ /g, '.');
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
      result += sc
        .shapeTypesToString()
        .replace(/ {2}(.)/g, '$1')
        .replace(/ /g, '.');
      result += '\n\n';
    }
  }
  updateText(result);
}
