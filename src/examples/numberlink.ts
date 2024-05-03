import { init } from 'z3-solver';
import { Point, createDefualtMap, grilops } from '../../lib';

const DefaultMap = createDefualtMap(Map);

export default async function numberlink(updateText: (val: string) => void) {
  // initialize z3
  const { Z3, Context } = await init();
  const ctx = Context('main');

  // initialize grilops
  const {
    PointMap,
    Point,
    getRectangleLattice,
    PathSymbolSet,
    SymbolGrid,
    PathConstrainer,
  } = grilops({
    z3: Z3,
    context: ctx,
  });

  const height = 7;
  const width = 7;
  const givens = new PointMap<number>();
  givens.set(new Point(0, 3), 4);
  givens.set(new Point(1, 1), 3);
  givens.set(new Point(1, 4), 2);
  givens.set(new Point(1, 5), 5);
  givens.set(new Point(2, 3), 3);
  givens.set(new Point(2, 4), 1);
  givens.set(new Point(3, 3), 5);
  givens.set(new Point(5, 2), 1);
  givens.set(new Point(6, 0), 2);
  givens.set(new Point(6, 4), 4);

  const lattice = getRectangleLattice(height, width);
  const sym = new PathSymbolSet(lattice);
  sym.append('BLANK', ' ');

  const sg = new SymbolGrid(lattice, sym);
  const pc = new PathConstrainer(sg, false, true, false);

  for (const [p, cell] of sg.grid) {
    sg.solver.add(sym.isTerminal(cell).eq(givens.has(p)));
  }

  const numberToPoints = new DefaultMap<number, Point[]>(() => []);
  for (const [p, n] of givens) {
    numberToPoints.get(n).push(p);
  }
  for (const points of numberToPoints.values()) {
    if (points.length !== 2) {
      throw new Error('Each number must have exactly two points');
    }
    const pathInstance = lattice.pointToIndex(points[0])!;
    sg.solver.add(pc.pathInstanceGrid.get(points[0])!.eq(pathInstance));
    sg.solver.add(pc.pathInstanceGrid.get(points[1])!.eq(pathInstance));
  }

  const printGrid = () =>
    sg.toString(p => (givens.has(p) ? String(givens.get(p)) : ''));

  let result = '';
  if (await sg.solve()) {
    result += printGrid();
    result += '\n\n';
    updateText(result);
    if (await sg.isUnique()) {
      result += 'Unique solution';
    } else {
      result += 'Alternate solution';
      result += '\n\n';
      result += printGrid();
    }
  } else {
    result += 'No solution';
  }
  updateText(result);
}
