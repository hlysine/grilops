import fillomino from './fillomino';

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

const updateText = (text: string) => {
  document.querySelector<HTMLPreElement>('#result')!.textContent = text;
};

document
  .querySelector<HTMLButtonElement>('#execute')!
  .addEventListener('click', async () => {
    console.log('Start solving');
    await fillomino(updateText);
  });
