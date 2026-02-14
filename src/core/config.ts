import type { Logger } from './interfaces';
import type { Middleware, StepContext, StepResult } from './middleware/types';

/**
 * Configuration for `cyberloop()`.
 */
export interface CyberLoopOpts<S = unknown> {
  /** Budget constraints. Currently supports max steps. */
  budget?: {
    /** Maximum number of steps before halting. Default: 50 */
    maxSteps?: number;
  };
  /** Additional middleware to register (runs after built-in budget/telemetry). */
  middleware?: Middleware<S>[];
  /** Logger for built-in telemetry middleware. If omitted, no telemetry. */
  logger?: Logger;
  /** Event hooks for lightweight observation without writing full middleware. */
  on?: {
    beforeStep?: (ctx: StepContext<S>) => void;
    afterStep?: (ctx: StepContext<S>, result: StepResult<S>) => void;
    onHalt?: (reason: string) => void;
  };
}
