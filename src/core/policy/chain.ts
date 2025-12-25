import type { Ladder, ProbePolicy } from '../interfaces';

export interface PolicyGuard<S> {
  name: string;
  apply(state: S): Promise<S> | S;
}

export interface PolicyReflex<S, A> {
  name: string;
  // If returns non-null, triggers reflex action and skips subsequent policy logic
  check(state: S): Promise<A | null>;
}

/**
 * ChainPolicy wraps an inner policy and applies a sequence of guards/modifiers
 * to the state before passing it to the inner policy.
 */
export class ChainPolicy<S, A, F> implements ProbePolicy<S, A, F> {
  public id = 'chain-policy';

  constructor(
    private inner: ProbePolicy<S, A, F>,
    private guards: PolicyGuard<S>[],
    private reflexes: PolicyReflex<S, A>[] = []
  ) {
    this.id = `chain(${inner.id})`;
  }

  initialize(state: S): void {
    this.inner.initialize(state);
  }

  isStable(state: S): boolean {
    return this.inner.isStable(state);
  }

  async decide(state: S, ladder: Ladder<F>): Promise<A> {
    // 1. Reflex Check (Fast Path: Intercept)
    for (const reflex of this.reflexes) {
      const action = await reflex.check(state);
      if (action) {
        return action; // Reflex Triggered!
      }
    }

    let modifiedState = state;

    // 2. Apply guards in order (Standard Path: Modify State)
    for (const guard of this.guards) {
      modifiedState = await guard.apply(modifiedState);
    }

    // 3. Inner Policy Decision
    return this.inner.decide(modifiedState, ladder);
  }

  adapt(feedback: F, ladder: Ladder<F>): void {
    this.inner.adapt?.(feedback, ladder);
  }
}
