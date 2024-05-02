import { init } from 'z3-solver';
import { grilops, zip } from '../lib';

export default async function fillomino(updateText: (val: string) => void) {
  // initialize z3
  const { Z3, Context } = await init();
  const ctx = Context('main');

  // initialize grilops
  const {
    getRectangleLattice,
    SymbolGrid,
    makeNumberRangeSymbolSet,
    RegionConstrainer,
  } = grilops({
    z3: Z3,
    context: ctx,
  });

  const givens = [
    [0, 0, 0, 3, 0, 0, 0, 0, 5],
    [0, 0, 8, 3, 10, 0, 0, 5, 0],
    [0, 3, 0, 0, 0, 4, 4, 0, 0],
    [1, 3, 0, 3, 0, 0, 2, 0, 0],
    [0, 2, 0, 0, 3, 0, 0, 2, 0],
    [0, 0, 2, 0, 0, 3, 0, 1, 3],
    [0, 0, 4, 4, 0, 0, 0, 3, 0],
    [0, 4, 0, 0, 4, 3, 3, 0, 0],
    [6, 0, 0, 0, 0, 1, 0, 0, 0],
  ];

  const sym = makeNumberRangeSymbolSet(1, 10);
  const lattice = getRectangleLattice(givens.length, givens[0].length);
  const sg = new SymbolGrid(lattice, sym);
  const rc = new RegionConstrainer(lattice, sg.solver);

  for (const p of lattice.points) {
    sg.solver.add(sg.cellAt(p).eq(rc.regionSizeGrid.get(p)!));

    const given = givens[p.y][p.x];
    if (given !== 0) sg.solver.add(rc.regionSizeGrid.get(p)!.eq(given));

    const regionSizes = lattice
      .edgeSharingNeighbors(rc.regionSizeGrid, p)
      .map(n => n.symbol);
    const regionIds = lattice
      .edgeSharingNeighbors(rc.regionIdGrid, p)
      .map(n => n.symbol);
    for (const [regionSize, regionId] of zip(regionSizes, regionIds)) {
      sg.solver.add(
        ctx.Implies(
          rc.regionSizeGrid.get(p)!.eq(regionSize),
          rc.regionIdGrid.get(p)!.eq(regionId)
        )
      );
    }
  }

  let result = '';
  console.time('solve');
  const solution = await sg.solve();
  console.timeEnd('solve');
  result += solution ? 'sat' : 'unsat';
  result += '\n\n';
  if (solution) {
    result += sg.toString();
    result += '\n\n';
    updateText(result);

    console.time('isUnique');
    const unique = await sg.isUnique();
    console.timeEnd('isUnique');
    result += unique ? 'unique' : 'not unique';
    result += '\n\n';
    if (!unique) {
      result += sg.toString();
      result += '\n\n';
    }
  }
}
