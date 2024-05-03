import fillomino from './examples/fillomino';
import numberlink from './examples/numberlink';
import testPaths from './testPaths';
import testRegion from './testRegion';
import testShape from './testShape';
import testSightline from './testSightline';

const examples = [
  ['fillomino', fillomino],
  ['numberlink', numberlink],
  ['testSightline', testSightline],
  ['testShape', testShape],
  ['testRegion', testRegion],
  ['testPath', testPaths],
] as const;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>GRILOPS</h1>
    <div class="card">
      ${examples.map(([name]) => `<button id="${name}" type="button">${name}</button>`).join('')}
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

examples.forEach(([name, fn]) => {
  document
    .querySelector<HTMLButtonElement>('#' + name)!
    .addEventListener('click', async () => {
      console.log('Start solving');
      console.time('Total time');
      await fn(updateText);
      console.timeEnd('Total time');
    });
});
