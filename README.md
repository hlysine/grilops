# grilops

This is a WIP port of [obijywk/grilops](https://github.com/obijywk/grilops) to TypeScript.

## Development

Node.js v20 is required for this project.
I recommend using [Volta](https://volta.sh/) to set up your JS dev environment.

```bash
# 1. Install yarn
npm install -g yarn

# 2. Clone this repository
git clone https://github.com/hlysine/grilops.git

# 3. Restore dependencies
cd grilops
yarn

# 4. Run the dev server
yarn dev

# You can now develop with hot module reload
```

Library code is located in `/lib`. A test rig can be found in `/src` which loads the library in a browser.
