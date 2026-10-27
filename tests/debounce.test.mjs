import test from 'node:test';
import assert from 'node:assert';

/**
 * Debounce controller replicating the debounce, cancellation,
 * and stale-request logic implemented in InboxPage.tsx for the Compose modal.
 */
class ComposePreFlightController {
  constructor(delayMs = 350) {
    this.delayMs = delayMs;
    this.timer = null;
    this.isCancelled = false;
    this.executionCount = 0;
    this.lastExecutedContent = null;
    this.livePreview = null;
    this.isChecking = false;
  }

  onInputChange(showCompose, subject, body, predictFn) {
    // 1. Cancel any active pending timer immediately
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isCancelled = true;

    // 2. If modal closed or input empty, reset state and exit
    if (!showCompose || (!subject.trim() && !body.trim())) {
      this.livePreview = null;
      this.isChecking = false;
      return;
    }

    // 3. Mark checking and start new debounce timer
    this.isChecking = true;
    let localCancelled = false;

    this.timer = setTimeout(() => {
      if (localCancelled) return;
      this.executionCount++;
      this.lastExecutedContent = { subject, body };
      this.livePreview = predictFn(subject, body, false);
      this.isChecking = false;
    }, this.delayMs);

    // Stale cancellation handler
    return () => {
      localCancelled = true;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    };
  }

  onModalClose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isCancelled = true;
    this.livePreview = null;
    this.isChecking = false;
  }
}

test('Debounce prevents rapid keystrokes from triggering multiple predictions', async () => {
  const controller = new ComposePreFlightController(50);
  let mockPredictCallCount = 0;
  const mockPredict = (subj, body, recordHistory) => {
    mockPredictCallCount++;
    assert.strictEqual(recordHistory, false, 'Pre-flight check must never record history');
    return { predicted_class: 'spam', spam_probability: 88.5 };
  };

  // Simulate typing 10 characters rapidly with 15ms intervals (less than 50ms debounce)
  let cancelCleanup = null;
  for (let i = 1; i <= 10; i++) {
    if (cancelCleanup) cancelCleanup();
    cancelCleanup = controller.onInputChange(
      true,
      `Subject ${i}`,
      `Body text typing keystroke ${i}`,
      mockPredict
    );
    await new Promise((r) => setTimeout(r, 15));
  }

  // During rapid typing, predict should NOT have executed yet
  assert.strictEqual(mockPredictCallCount, 0, 'No predictions should execute while typing is in progress');
  assert.strictEqual(controller.isChecking, true, 'isChecking should be true while debounce timer is pending');

  // Wait for debounce window (50ms) to elapse after last keystroke
  await new Promise((r) => setTimeout(r, 70));

  // Now exactly ONE prediction should have executed for the final text
  assert.strictEqual(mockPredictCallCount, 1, 'Only one prediction should execute after typing pauses');
  assert.strictEqual(controller.executionCount, 1);
  assert.strictEqual(controller.lastExecutedContent.subject, 'Subject 10');
  assert.strictEqual(controller.livePreview.predicted_class, 'spam');
  assert.strictEqual(controller.isChecking, false);
});

test('Closing the Compose modal cancels pending debounce timer and produces no prediction', async () => {
  const controller = new ComposePreFlightController(100);
  let mockPredictCalled = false;
  const mockPredict = () => {
    mockPredictCalled = true;
    return { predicted_class: 'ham' };
  };

  // User starts typing
  controller.onInputChange(true, 'Meeting notice', 'Hello team', mockPredict);
  assert.strictEqual(controller.isChecking, true);

  // User closes modal after 30ms (before 100ms debounce expires)
  await new Promise((r) => setTimeout(r, 30));
  controller.onModalClose();

  // Wait past the original 100ms window
  await new Promise((r) => setTimeout(r, 120));

  assert.strictEqual(mockPredictCalled, false, 'Cancelled timer must not trigger predict');
  assert.strictEqual(controller.livePreview, null, 'Preview should be cleared on modal close');
  assert.strictEqual(controller.isChecking, false);
});

test('Emptying input clears live preview and does not trigger prediction', async () => {
  const controller = new ComposePreFlightController(50);
  let mockPredictCalled = false;
  const mockPredict = () => {
    mockPredictCalled = true;
    return { predicted_class: 'ham' };
  };

  // User clears both subject and body
  const cleanup = controller.onInputChange(true, '   ', '', mockPredict);
  if (cleanup) cleanup();

  await new Promise((r) => setTimeout(r, 70));

  assert.strictEqual(mockPredictCalled, false, 'Empty input must not trigger predict');
  assert.strictEqual(controller.livePreview, null);
  assert.strictEqual(controller.isChecking, false);
});

test('Audit history protection: recordHistory flag prevents audit log creation', () => {
  const storedHistory = [];
  const predictEmail = (subj, body, recordHistory = true) => {
    const record = { id: Date.now(), subject: subj, predicted_class: 'spam' };
    if (recordHistory) {
      storedHistory.push(record);
    }
    return {
      status: 'success',
      predicted_class: 'spam',
      prediction_id: recordHistory ? record.id : undefined,
    };
  };

  // 1. Transient pre-flight preview (recordHistory: false)
  const previewResult = predictEmail('Pre-flight test', 'Checking spam score', false);
  assert.strictEqual(previewResult.status, 'success');
  assert.strictEqual(previewResult.prediction_id, undefined, 'Pre-flight check should have no persisted prediction_id');
  assert.strictEqual(storedHistory.length, 0, 'Audit history must remain empty during pre-flight checks');

  // 2. Final send or full scan (recordHistory: true)
  const finalResult = predictEmail('Actual sent mail', 'Delivering message', true);
  assert.strictEqual(finalResult.status, 'success');
  assert.notStrictEqual(finalResult.prediction_id, undefined, 'Final scan must have a persisted prediction_id');
  assert.strictEqual(storedHistory.length, 1, 'Audit history should record actual email send/scan');
  assert.strictEqual(storedHistory[0].subject, 'Actual sent mail');
});
