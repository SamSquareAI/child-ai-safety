import { createReferenceService } from '../../services/reference-server.mjs';
import { createSqliteSessionAuthority } from '../../services/sqlite-session-authority.mjs';

const [path, release] = process.argv.slice(2);
const authority = createSqliteSessionAuthority({ path });
const policyVersion = release === 'restored' ? 'draft-restored' : 'draft-candidate';
const identities = JSON.parse(process.env.DRILL_IDENTITIES);
let resume;
const service = createReferenceService({
  timeoutMs: 10_000,
  credentialAuthority: identity => authority.isActive(identity),
  credentials: identities.map(identity => ({
    ...identity,
    async handle() {
      if (identity.id === 'old') {
        await new Promise(resolve => {
          resume = resolve;
          process.send({ type: 'paused' });
        });
      }
      return {
        protocolVersion: '1', policyVersion, detectorId: 'synthetic',
        detectorRevision: '1', action: 'allow', text: 'Synthetic session drill answer',
      };
    },
  })),
});

async function stop() {
  resume?.();
  await service.close();
  authority.close();
}
process.on('disconnect', stop);
process.on('message', message => {
  if (message === 'release') resume?.();
  if (message === 'revoke') process.send({ type: 'revoked', ok: authority.revoke('old') });
});
process.send({ type: 'ready', url: await service.listen() });
