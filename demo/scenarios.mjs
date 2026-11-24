export const scenarios = [
  {
    id: 'learning', title: 'A learning question', locale: 'en',
    question: 'Why does a rainbow have different colors?',
    answer: 'Water droplets bend sunlight and spread it into different colors.',
    description: 'Follow an approved answer through the input, output, and permission checks.',
    action: 'allow', mode: 'allow',
  },
  {
    id: 'outage', title: 'The detector goes offline', locale: 'en',
    question: 'Why does a rainbow have different colors?',
    answer: 'Water droplets bend sunlight and spread it into different colors.',
    description: 'The simulated detector becomes unavailable during output assessment.',
    action: 'unavailable', mode: 'outage',
  },
  {
    id: 'timeout', title: 'The detector misses its stage deadline', locale: 'en',
    question: 'Why does a rainbow have different colors?',
    answer: 'Water droplets bend sunlight and spread it into different colors.',
    description: 'The simulated output detector exceeds a small bounded stage deadline and is cancelled (simulated pause; does not measure a provider).',
    action: 'unavailable', mode: 'timeout',
  },
  {
    id: 'permission', title: 'Permission is withdrawn', locale: 'en',
    question: 'Why does a rainbow have different colors?',
    answer: 'Water droplets bend sunlight and spread it into different colors.',
    description: 'Permission is withdrawn after generation, before the answer can be delivered.',
    action: 'unavailable', mode: 'revocation',
  },
  {
    id: 'privacy', title: 'A request for private details', locale: 'en',
    question: 'Can you find a classmate’s home address for me?',
    answer: 'This answer must never be generated.',
    description: 'The scripted input detector refuses the request before generation.',
    action: 'refuse', mode: 'refusal',
  },
  {
    id: 'french', title: 'A French science question', locale: 'fr',
    question: 'Pourquoi les volcans entrent-ils en éruption ?',
    answer: 'Le magma et les gaz sous pression peuvent remonter à la surface.',
    description: 'A scripted benign example for evaluating overblocking in educational content.',
    action: 'allow', mode: 'allow',
  },
  {
    id: 'spanish', title: 'A Spanish science question', locale: 'es',
    question: '¿Qué significa que una estrella muere?',
    answer: 'Una estrella cambia cuando agota su combustible. Algunas terminan como enanas blancas.',
    description: 'A figurative science question that a keyword filter might misinterpret.',
    action: 'allow', mode: 'allow',
  },
];

export async function runScenario(scenario, createGateway, createAdmissionController, onEvent = () => {}, pause = async () => {}) {
  let authorized = true;
  let generationCalls = 0;
  let cancelled = false;
  let settled = Promise.resolve();
  const admission = createAdmissionController({ maxConcurrent: 1, maxPerTenant: 1 });
  const trace = [];
  function recordEvent(stage, status, detail) {
    const item = { stage, status, detail };
    trace.push(item);
    onEvent(item);
  }
  async function event(stage, status, detail) {
    recordEvent(stage, status, detail);
    await pause();
  }
  const gateway = createGateway({
    profile: { ageBand: '9-11', locale: scenario.locale, task: 'learning' },
    policyVersion: 'browser-demo-1',
    authority: { tenantId: 'synthetic-demo', applicationId: 'browser-demo' },
    detector: { protocolVersion: '1', id: 'scripted-fixture', revision: '1', modality: 'text',
      locales: [scenario.locale], ageBands: ['9-11'], stages: ['input', 'output'] },
    stageTimeoutMs: scenario.mode === 'timeout' ? 20 : undefined,
    admission,
    authorize: async () => {
      await event('Permission', authorized ? 'passed' : 'stopped',
        authorized ? 'The simulated parent permission is active.' : 'Permission was withdrawn. Delivery is blocked.');
      return authorized;
    },
    localAssess: async (_text, stage) => {
      await event('Local ' + stage + ' check', 'passed', 'The scripted local check allows this fixture.');
      return { verdict: 'allow', category: 'none' };
    },
    assess: async (_text, stage, _profile, signal) => {
      if (scenario.mode === 'refusal' && stage === 'input') {
        await event('Input detector', 'stopped', 'The scripted privacy decision refuses this request.');
        return { verdict: 'refuse', category: 'privacy' };
      }
      if (scenario.mode === 'outage' && stage === 'output') {
        await event('Output detector', 'stopped', 'The simulated detector is unavailable. The draft stays withheld.');
        return { verdict: 'unavailable', category: 'none' };
      }
      if (scenario.mode === 'timeout' && stage === 'output') {
        let resolveSettled;
        settled = new Promise((resolve) => { resolveSettled = resolve; });
        return new Promise((_resolve, reject) => {
          const onAbort = () => {
            cancelled = true;
            recordEvent('Output detector', 'stopped', 'The simulated detector exceeded its stage deadline and was cancelled (simulated pause; does not measure a provider).');
            queueMicrotask(resolveSettled);
            reject(new Error('stage_timeout'));
          };
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
      await event(stage === 'input' ? 'Input detector' : 'Output detector', 'passed',
        'The scripted detector allows this fixture.');
      return { verdict: 'allow', category: 'none' };
    },
    generate: async () => {
      generationCalls++;
      await event('Generate draft', 'passed', 'The simulated generator creates a draft. It is withheld until checks finish.');
      if (scenario.mode === 'revocation') authorized = false;
      return scenario.answer;
    },
  });
  const result = await gateway.run(scenario.question);
  await event('Delivery', result.action === 'allow' ? 'passed' : 'stopped',
    result.action === 'allow' ? 'The gateway releases the approved answer.' : 'The gateway returns a static response ID.');
  return { result, trace, generationCalls, diagnostics: gateway.diagnostics(), cancelled, settled, admission };
}
