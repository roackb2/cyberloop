import type { Ladder, ProbePolicy } from '../interfaces';

export interface PolicyGuard<S> {
  name: string;
  apply(state: S): Promise<S> | S;
}

/**
 * ChainPolicy wraps an inner policy and applies a sequence of guards/modifiers
 * to the state before passing it to the inner policy.
 */
export class ChainPolicy<S, A, F> implements ProbePolicy<S, A, F> {
  public id = 'chain-policy';

  constructor(
    private inner: ProbePolicy<S, A, F>,
    private guards: PolicyGuard<S>[]
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
    let modifiedState = state;

    // Apply guards in order
    for (const guard of this.guards) {
      modifiedState = await guard.apply(modifiedState);
    }

    return this.inner.decide(modifiedState, ladder);
  }

  adapt(feedback: F, ladder: Ladder<F>): void {
    this.inner.adapt?.(feedback, ladder);
  }
}
