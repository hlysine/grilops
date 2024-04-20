# grilops

> This is a WIP port of [obijywk/grilops](https://github.com/obijywk/grilops) to TypeScript.

A **Gri**d **Lo**gic **P**uzzle **S**olver library, using Typescript and [z3](https://github.com/Z3Prover/z3).

This package contains a collection of libraries and helper functions that are useful for solving and checking 
[Nikoli](https://en.wikipedia.org/wiki/Nikoli_(publisher))-style logic puzzles using z3.

## About this port

The API of this TypeScript verison is mostly consistent with the Python version, with snake_case identifiers renamed to
camelCase by JS/TS conventions.

One notable difference is that the TypeScript version does not come with its own z3 
context, so you have to initialize z3 and its context according to [z3-solver](https://www.npmjs.com/package/z3-solver)'s
documentation and pass it into grilops. You can either pass the context into individual grilops functions/classes that
need it, or get contextualized versions of all grilops features with this snippet:

```ts
import { init } from 'z3-solver';
import { grilops } from '../lib';

// initialize z3
const { Z3, Context } = await init();
const ctx = Context('main');

// initialize grilops
const { /* grilops exports */ } = grilops({
  z3: Z3,
  context: ctx,
});
```

## Development

[Bun >=v1.1.0](https://bun.sh/) is required for this project.

```bash
# 1. Clone this repository
git clone https://github.com/hlysine/grilops.git

# 2. Restore dependencies
cd grilops
bun install

# 3. Run the dev server
bun dev

# You can now develop with hot module reload
```

Library code is located in `/lib`. A test rig can be found in `/src` which loads the library in a browser.
