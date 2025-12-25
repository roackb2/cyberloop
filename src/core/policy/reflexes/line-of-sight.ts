import { logger } from '../../../adapters/wikipedia/telemetry';
import type { WikiAction, WikiState } from '../../../adapters/wikipedia/types';
import type { PolicyReflex } from '../chain';

export class LineOfSightReflex implements PolicyReflex<WikiState, WikiAction> {
  public name = 'line-of-sight';

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(state: WikiState): Promise<WikiAction | null> {
    if (state.links?.includes(state.goal)) {
      logger.info(`[Reflex] 🎯 Line of Sight! Found goal link "${state.goal}". Priority Override.`);
      return { type: 'NAVIGATE', title: state.goal };
    }
    return null;
  }
}
