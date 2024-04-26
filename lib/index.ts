import { GrilopsContext } from './utils/utils';
import * as geometry from './geometry';
import grids from './grids';
import quadTree from './utils/quadTree';
import * as symbols from './symbols';
import sightlines from './constraints/sightlines';
import shapes from './constraints/shapes';
import regions from './constraints/regions';

export * from './utils/utils';
export * from './geometry';
export * from './grids';
export * from './utils/quadTree';
export * from './symbols';
export * from './constraints/sightlines';
export * from './constraints/shapes';
export * from './constraints/regions';

export function grilops<Name extends string>(context: GrilopsContext<Name>) {
  return {
    ...geometry,
    ...grids(context),
    ...quadTree(context),
    ...symbols,
    ...sightlines(context),
    ...shapes(context),
    ...regions(context),
  };
}
