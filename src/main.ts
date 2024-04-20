import { init } from 'z3-solver';
import { grilops } from '../lib';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>GRILOPS</h1>
    <div class="card">
      <button id="execute" type="button">Execute</button>
    </div>
    <pre id="result"></pre>
    <p>
      Library code is located in <code>/lib</code>
    </p>
  </div>
`;

document
  .querySelector<HTMLButtonElement>('#execute')!
  .addEventListener('click', async () => {
    const { Z3, Context } = await init();
    const ctx = Context('main');
    const {
      SymbolSet,
      getRectangleLattice,
      SymbolGrid,
      Point,
      countCells,
      RectangularLattice,
    } = grilops({
      lowLevel: Z3,
      context: ctx,
    });

    const symbolSet = new SymbolSet([
      ['DARK', '#'],
      ['LIGHT', '*'],
      ['EMPTY', '.'],
    ]);
    const lattice = getRectangleLattice(1, 10);
    const grid = new SymbolGrid(lattice, symbolSet);

    for (let i = 0; i < 1; i++) {
      for (let j = 0; j < 10; j++) {
        grid.solver.add(
          ctx.Not(grid.cellIs(new Point(i, j), symbolSet.indices.EMPTY))
        );
      }
    }

    const count = countCells(
      grid,
      new Point(0, 0),
      RectangularLattice.EDGE_DIRECTIONS.E,
      c =>
        ctx.If(
          c.eq(grid.cellAt(new Point(0, 0))),
          ctx.Int.val(1),
          ctx.Int.val(0)
        ),
      c => c.neq(grid.cellAt(new Point(0, 0)))
    );
    grid.solver.add(count.eq(ctx.Int.val(3)));

    let result = '';
    const solution = await grid.solve();
    result += solution ? 'sat' : 'unsat';
    result += '\n\n';
    result += grid.toString();
    result += '\n\n';
    if (solution) {
      const unique = await grid.isUnique();
      result += unique ? 'unique' : 'not unique';
      result += '\n\n';
      result += grid.toString();
    }
    document.querySelector<HTMLPreElement>('#result')!.textContent = result;
  });
