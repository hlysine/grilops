/*


"""Numberlink solver example.

Example puzzle can be found at https://en.wikipedia.org/wiki/Numberlink.
"""

from collections import defaultdict

import grilops
import grilops.paths
from grilops.geometry import Point


HEIGHT, WIDTH = 7, 7
GIVENS = {
    Point(0, 3): 4,
    Point(1, 1): 3,
    Point(1, 4): 2,
    Point(1, 5): 5,
    Point(2, 3): 3,
    Point(2, 4): 1,
    Point(3, 3): 5,
    Point(5, 2): 1,
    Point(6, 0): 2,
    Point(6, 4): 4,
}

LATTICE = grilops.get_rectangle_lattice(HEIGHT, WIDTH)
SYM = grilops.paths.PathSymbolSet(LATTICE)
SYM.append("BLANK", " ")


def main():
  """Numberlink solver example."""
  sg = grilops.SymbolGrid(LATTICE, SYM)
  pc = grilops.paths.PathConstrainer(sg, allow_loops=False)

  for p, cell in sg.grid.items():
    sg.solver.add(SYM.is_terminal(cell) == (p in GIVENS))

  number_to_points = defaultdict(list)
  for p, n in GIVENS.items():
    number_to_points[n].append(p)
  for points in number_to_points.values():
    assert len(points) == 2
    path_instance = LATTICE.point_to_index(points[0])
    sg.solver.add(pc.path_instance_grid[points[0]] == path_instance)
    sg.solver.add(pc.path_instance_grid[points[1]] == path_instance)

  def print_grid():
    sg.print(lambda p, _: str(GIVENS[(p.y, p.x)]) if (p.y, p.x) in GIVENS else None)

  if sg.solve():
    print_grid()
    print()
    if sg.is_unique():
      print("Unique solution")
    else:
      print("Alternate solution")
      print_grid()
  else:
    print("No solution")


if __name__ == "__main__":
  main()


*/

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
