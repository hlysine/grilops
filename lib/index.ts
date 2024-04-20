import fastZ3 from './utils/fastZ3';
import { GrilopsContext } from './utils/utils';
import * as geometry from './geometry';
import grids from './grids';
import quadTree from './utils/quadTree';
import * as symbols from './symbols';

export * from './utils/fastZ3';
export * from './utils/utils';
export * from './geometry';
export * from './grids';
export * from './utils/quadTree';
export * from './symbols';

export function grilops<Name extends string>(context: GrilopsContext<Name>) {
  return {
    ...fastZ3(context),
    ...geometry,
    ...grids(context),
    ...quadTree(context),
    ...symbols,
  };
}
