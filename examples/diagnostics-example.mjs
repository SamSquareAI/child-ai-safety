import { createGateway, createAdmissionController } from '../dist/index.js';

let detectorAvailable = true;

const gateway = createGateway({
  profile: { ageBand: '9-11', locale: 'en', task: 'learning' },
  policyVersion: 'draft-0',
  authority: { tenantId: 'synthetic-demo', applicationId: 'diagnostics-example' },
  detector: {
    protocolVersion: '1',
    id: 'mock-detector',
    revision: '0',
    modality: 'text',
    locales: ['en'],
    ageBands: ['9-11'],
    stages: ['input', 'output'],
  },
  admission: createAdmissionController({ maxConcurrent: 2, maxPerTenant: 1 }),
  authorize: async () => true,
  localAssess: async () => ({ verdict: 'allow', category: 'none' }),
  assess: async () =>
    detectorAvailable
      ? { verdict: 'allow', category: 'none' }
      : { verdict: 'unavailable', category: 'none' },
  generate: async () => 'Synthetic approved learning answer.',
});

// 1. Allowed request
await gateway.run('Synthetic question 1');

// 2. Request where the mock detector returns unavailable
detectorAvailable = false;
await gateway.run('Synthetic question 2');

console.log(JSON.stringify(gateway.diagnostics().counts, null, 2));
