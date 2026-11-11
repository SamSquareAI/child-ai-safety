import { comparisonSchedule, scoreComparison } from './support-comparison.mjs';
import { corpusDigest } from './corpus-digest.mjs';
import { runContextualAssessment } from './contextual-assessment-runner.mjs';

export function prepareContinuation(inputs, expectations, basePlan, baseFreeze, previousCheckpoint, previousSummary) {
  const schedule = comparisonSchedule(inputs), old = previousCheckpoint?.checkpoint;
  if (corpusDigest(inputs) !== basePlan.inputsSha256 || corpusDigest(schedule) !== basePlan.scheduleSha256 ||
      corpusDigest(previousSummary?.plan) !== corpusDigest(basePlan) ||
      previousCheckpoint?.freezeSha256 !== corpusDigest(baseFreeze) || previousSummary?.freezeSha256 !== corpusDigest(baseFreeze) ||
      previousCheckpoint?.sourceRevision !== previousSummary?.sourceRevision ||
      old?.status !== 'unavailable' || old.calls !== 57 || previousSummary?.status !== 'unavailable' ||
      previousSummary?.metrics?.calls !== old.calls || previousSummary.metrics.statuses.length !== old.calls ||
      previousSummary.metrics.statuses.some(status => status !== 200) ||
      corpusDigest(previousCheckpoint.metrics) !== corpusDigest(previousSummary.metrics) ||
      old.corpusSha256 !== corpusDigest(schedule.map(row => row.input))) throw new Error('invalid-continuation-parent');
  const scored = scoreComparison(inputs, expectations, old.observations);
  if (corpusDigest(scored) !== corpusDigest(previousSummary.score)) throw new Error('invalid-continuation-parent');
  const indexed = new Map(old.observations.map(row => [row.id, row]));
  const complete = inputs.filter(input => ['v1', 'v2'].every(arm => {
    const turn = indexed.get(`${arm}-${input.id}`)?.turns[0];
    return turn?.status === 'observed' && turn.decision?.verdict !== 'unavailable';
  })).map(row => row.id);
  if (complete.length !== 28) throw new Error('invalid-continuation-parent');
  const preserved = new Set(complete);
  const remaining = schedule.filter(row => !preserved.has(row.caseId));
  const perCallReserveMicroUsd = basePlan.reserveMicroUsd / basePlan.config.maxCalls;
  const combinedMaximumCalls = old.calls + remaining.length;
  const combinedReserveMicroUsd = combinedMaximumCalls * perCallReserveMicroUsd;
  if (combinedReserveMicroUsd > basePlan.budget.authorizedMicroUsd) throw new Error('budget-exceeded');
  return {
    version: 1, basePlanSha256: corpusDigest(basePlan),
    parentSnapshotSha256: corpusDigest({ previousCheckpoint, previousSummary }),
    preservedCaseIds: complete, scheduleSha256: corpusDigest(remaining),
    maxCalls: remaining.length, parentCalls: old.calls, combinedMaximumCalls,
    combinedReserveMicroUsd, authorizedMicroUsd: basePlan.budget.authorizedMicroUsd,
    stopRule: 'record-independent-assessment-unavailable-stop-transport-timeout-cancel-storage',
    productionQualified: false,
  };
}

/** Evaluation only: retain unavailable per case, with no generation or delivery. */
export async function runContinuation(inputs, { basePlan, continuation, assessors, save, signal }) {
  const complete = new Set(continuation.preservedCaseIds);
  const schedule = comparisonSchedule(inputs).filter(row => !complete.has(row.caseId));
  if (corpusDigest(basePlan) !== continuation.basePlanSha256 || corpusDigest(schedule) !== continuation.scheduleSha256 ||
      schedule.length !== continuation.maxCalls) throw new Error('continuation-freeze-mismatch');
  const observations = schedule.map(row => ({ id: row.input.id, turns: [{ turn: 1, status: 'skipped' }] }));
  let totalCalls = 0;
  const snapshot = (status, reason) => ({ version: '1', status, reason, calls: totalCalls,
    maxCalls: continuation.maxCalls, corpusSha256: corpusDigest(schedule.map(row => row.input)),
    release: 'blocked', humanQualification: 'pending', observations: structuredClone(observations) });
  async function checkpoint(status, reason) {
    const report = snapshot(status, reason);
    try { await save(report); } catch { throw new Error('checkpoint-failed'); }
    return report;
  }
  for (let index = 0; index < schedule.length; index++) {
    if (signal.aborted) return checkpoint('cancelled', 'aborted');
    const item = schedule[index];
    const result = await runContextualAssessment([item.input], {
      maxCalls: 1, timeoutMs: basePlan.config.timeoutMs, signal,
      assess: assessors[item.arm],
      save: async report => {
        totalCalls = index + report.calls;
        observations[index] = report.observations[0];
        await checkpoint('running', report.status === 'unavailable' ? 'assessment-unavailable-recorded' : report.reason);
      },
    });
    if (!['completed', 'unavailable'].includes(result.status)) return checkpoint(result.status, result.reason);
  }
  return checkpoint('completed', 'finished-with-unavailable-counted-separately');
}

export function mergeContinuation(inputs, continuation, previousObservations, currentObservations) {
  const preserved = new Set(continuation.preservedCaseIds), old = new Map(previousObservations.map(row => [row.id, row]));
  const allowed = new Set(comparisonSchedule(inputs).filter(row => !preserved.has(row.caseId)).map(row => row.input.id));
  if (currentObservations.length !== allowed.size || new Set(currentObservations.map(row => row.id)).size !== allowed.size ||
      currentObservations.some(row => !allowed.has(row.id))) throw new Error('invalid-continuation-observations');
  const current = new Map(currentObservations.map(row => [row.id, row]));
  return comparisonSchedule(inputs).map(row => (preserved.has(row.caseId) ? old : current).get(row.input.id) ??
    { id: row.input.id, turns: [{ turn: 1, status: 'skipped' }] });
}
