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
      z3: Z3,
      context: ctx,
    });

    const symbolSet = new SymbolSet([
      ['DARK', '#'],
      ['LIGHT', '*'],
    ]);
    const lattice = getRectangleLattice(10, 10);
    const grid = new SymbolGrid(lattice, symbolSet, new ctx.Solver('QF_LIA'));

    for (let i = 0; i < 8; i++) {
      const count = countCells(
        grid,
        new Point(i, 0),
        RectangularLattice.EDGE_DIRECTIONS.E,
        c =>
          ctx.If(
            c.eq(grid.cellAt(new Point(i, 0))),
            ctx.Int.val(1),
            ctx.Int.val(0)
          ),
        c => c.neq(grid.cellAt(new Point(i, 0)))
      );
      grid.solver.add(count.eq(ctx.Int.val(i + 1)));
    }

    let result = '';
    console.time('solve');
    const solution = await grid.solve();
    console.timeEnd('solve');
    result += solution ? 'sat' : 'unsat';
    result += '\n\n';
    if (solution) {
      result += grid.toString();
      result += '\n\n';
      const unique = await grid.isUnique();
      result += unique ? 'unique' : 'not unique';
      result += '\n\n';
      result += grid.toString();
    }
    document.querySelector<HTMLPreElement>('#result')!.textContent = result;
  });
