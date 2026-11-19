import { createGateway } from '../src/gateway.ts';
import { createAdmissionController } from '../src/admission.ts';
import { catalog } from '../catalogs/draft-responses.json';
import { scenarios, runScenario } from './scenarios.mjs';

const select = document.querySelector('#scenario');
const description = document.querySelector('#description');
const question = document.querySelector('#question');
const trace = document.querySelector('#trace');
const result = document.querySelector('#result');
const detail = document.querySelector('#details');
const button = document.querySelector('#run');
const status = document.querySelector('#status');
const pause = () => new Promise(resolve => setTimeout(resolve, 130));
let running = false;

for (const scenario of scenarios) {
  const option = document.createElement('option');
  option.value = scenario.id;
  option.textContent = scenario.title;
  select.append(option);
}
const requested = new URLSearchParams(location.search).get('scenario');
if (scenarios.some(scenario => scenario.id === requested)) select.value = requested;

function showSelection() {
  const selected = scenarios.find(scenario => scenario.id === select.value);
  description.textContent = selected.description;
  question.textContent = selected.question;
  question.lang = selected.locale;
  result.textContent = 'Choose a scenario, then run the gateway.';
  result.className = 'result empty';
  trace.replaceChildren();
  detail.textContent = 'Run a scenario to inspect its result.';
  status.textContent = 'Ready';
}
select.addEventListener('change', showSelection);

button.addEventListener('click', async () => {
  if (running) return;
  running = true;
  button.disabled = true;
  select.disabled = true;
  button.textContent = 'Running scenario…';
  trace.replaceChildren();
  result.textContent = 'The draft stays withheld while the checks run.';
  result.className = 'result empty';
  status.textContent = 'Running';
  try {
    const selected = scenarios.find(scenario => scenario.id === select.value);
    const report = await runScenario(selected, createGateway, createAdmissionController, item => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const text = document.createElement('span');
      name.textContent = item.stage;
      text.textContent = item.detail;
      row.className = item.status;
      row.append(name, text);
      trace.append(row);
    }, pause);
    const allowed = report.result.action === 'allow';
    result.className = 'result ' + (allowed ? 'allowed' : 'withheld');
    result.textContent = allowed ? report.result.text : catalog[report.result.responseId];
    result.lang = selected.locale;
    detail.textContent = JSON.stringify({
      result: report.result, generatorCalls: report.generationCalls, diagnostics: report.diagnostics,
    }, null, 2);
    status.textContent = allowed ? 'Answer delivered' : 'Draft withheld · ' + report.result.action;
    history.replaceState(null, '', '?scenario=' + selected.id);
  } catch {
    status.textContent = 'Demo could not complete';
    result.className = 'result withheld';
    result.textContent = 'Reload the page and try again. No draft was delivered.';
  } finally {
    running = false;
    select.disabled = false;
    button.disabled = false;
    button.textContent = 'Run scenario';
  }
});
showSelection();
