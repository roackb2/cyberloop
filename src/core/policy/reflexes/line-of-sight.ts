import type { Logger } from '../../interfaces';
import type { PolicyReflex } from '../chain';

export interface LineOfSightOpts<S, A> {
  /** Extract candidate links from state */
  getLinks(state: S): string[];
  /** Extract the goal identifier from state */
  getGoal(state: S): string;
  /** Create the action to take when goal is found in links */
  createAction(goal: string): A;
  logger?: Logger;
}

export class LineOfSightReflex<S, A> implements PolicyReflex<S, A> {
  public name = 'line-of-sight';

  constructor(private opts: LineOfSightOpts<S, A>) { }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(state: S): Promise<A | null> {
    const links = this.opts.getLinks(state);
    const goal = this.opts.getGoal(state);
    if (links?.includes(goal)) {
      this.opts.logger?.info(`[Reflex] 🎯 Line of Sight! Found goal link "${goal}". Priority Override.`);
      return this.opts.createAction(goal);
    }
    return null;
  }
}
