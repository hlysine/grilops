import { z3Solve } from '../lib/index.ts';

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

document.querySelector<HTMLButtonElement>('#execute')!.addEventListener('click', async () => {
  document.querySelector<HTMLPreElement>('#result')!.textContent = JSON.stringify(await z3Solve());
});
