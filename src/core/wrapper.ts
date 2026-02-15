import type { AgentLike, AgentResult, SteppableAgent } from './agent-protocol';
import { isSteppable } from './agent-protocol';
import { MultiBudget } from './budget/multi';
import type { CyberLoopOpts } from './config';
import { budgetMiddleware } from './middleware/budget';
import { MiddlewareRunner } from './middleware/runner';
import { telemetryMiddleware } from './middleware/telemetry';
import type { Middleware, StepContext, StepResult } from './middleware/types';
import type { Trajectory } from './trajectory';
import { isTrajectory } from './trajectory';

/**
 * Wrap any agent or trajectory with CyberLoop middleware.
 *
 * This is the **Assistive SDK** entry point (v2.2+). It instruments the inner
 * loop with composable middleware (budget, policy, kinematics, telemetry)
 * while leaving the outer loop (failure handling, replanning, orchestration
 * topology) entirely in user code.
 *
 * Accepts three kinds of control subjects:
 *
 * - **Opaque agents** (`AgentLike`): middleware runs once around the entire `run()` call.
 * - **Steppable agents** (`SteppableAgent`): middleware runs around each `step()` call.
 * - **Trajectories** (`Trajectory<S>`): middleware runs around each `advance()` call.
 *   Returns an `AgentLike` whose `run()` drives the trajectory loop.
 *
 * Returns a new `AgentLike` with the same `run()` signature.
 *
 * For the prescriptive inner/outer loop controller where CyberLoop owns the
 * full plan → explore → evaluate → replan cycle, see {@link Orchestrator}
 * in `./orchestrator.ts`.
 *
 * @see docs/guide/choosing-your-api.md — When to use cyberloop() vs Orchestrator
 *
 * @example
 * ```ts
 * // Agent usage (existing)
 * const wrapped = cyberloop(myAgent, {
 *   budget: { maxSteps: 20 },
 *   middleware: [probeMiddleware(myProbe)],
 *   logger: pino(),
 * });
 * const result = await wrapped.run("find the answer");
 *
 * // Trajectory usage (v2.3+)
 * const controlled = cyberloop(myTrajectory, {
 *   budget: { maxSteps: 100 },
 *   middleware: [manifoldMiddleware({ corpus })],
 * });
 * const result = await controlled.run(corpusInput);
 * ```
 */
export function cyberloop<S, I = string, O extends AgentResult = AgentResult>(
  subject: AgentLike<I, O> | Trajectory<S>,
  opts: CyberLoopOpts<S> = {},
): AgentLike<I, O> {
  return {
    async run(input: I): Promise<O> {
      const runner = buildRunner<S>(opts);

      // Trajectory path: subject has advance/isTerminal/toOutput but no run()
      if (isTrajectory<S>(subject) && !('run' in subject)) {
        return runTrajectory(subject, input, runner, opts);
      }

      // Agent paths (existing)
      const agent = subject as AgentLike<I, O>;
      if (isSteppable<S, I, O>(agent)) {
        return runSteppable(agent, input, runner, opts);
      }
      return runOpaque(agent, input, runner, opts);
    },
  };
}

/**
 * Build a MiddlewareRunner from opts, inserting built-in middleware first.
 */
function buildRunner<S>(opts: CyberLoopOpts<S>): MiddlewareRunner<S> {
  const stack: Middleware<S>[] = [];

  // Built-in: budget (always present)
  const maxSteps = opts.budget?.maxSteps ?? 50;
  const tracker = new MultiBudget({ steps: maxSteps });
  stack.push(budgetMiddleware<S>(tracker));

  // Built-in: telemetry (if logger provided)
  if (opts.logger) {
    stack.push(telemetryMiddleware<S>(opts.logger));
  }

  // User middleware
  if (opts.middleware) {
    stack.push(...opts.middleware);
  }

  // Event hooks as inline middleware
  if (opts.on) {
    const hooks = opts.on;
    stack.push({
      name: 'event-hooks',
      beforeStep(ctx: StepContext<S>): Promise<StepContext<S>> {
        hooks.beforeStep?.(ctx);
        return Promise.resolve(ctx);
      },
      afterStep(ctx: StepContext<S>, result: StepResult<S>): Promise<void> {
        hooks.afterStep?.(ctx, result);
        return Promise.resolve();
      },
    });
  }

  return new MiddlewareRunner<S>(stack);
}

/**
 * Opaque path: middleware wraps the entire run() as a single step.
 */
async function runOpaque<S, I, O extends AgentResult>(
  agent: AgentLike<I, O>,
  input: I,
  runner: MiddlewareRunner<S>,
  opts: CyberLoopOpts<S>,
): Promise<O> {
  await runner.runSetup({ input });

  const ctx: StepContext<S> = {
    step: 0,
    state: input as unknown as S,
    budget: { used: 0, remaining: 1 },
    metadata: {},
  };

  const beforeResult = await runner.runBeforeStep(ctx);
  if (beforeResult === 'halt') {
    opts.on?.onHalt?.('budget');
    await runner.runTeardown({ reason: 'halted before execution' });
    return { output: '' } as O;
  }

  const output = await agent.run(input);

  const stepResult: StepResult<S> = {
    state: output as unknown as S,
    action: 'run',
    cost: 1,
  };
  await runner.runAfterStep(beforeResult, stepResult);
  await runner.runTeardown({ reason: 'completed' });

  return output;
}

/**
 * Steppable path: middleware wraps each step() call individually.
 */
async function runSteppable<S, I, O extends AgentResult>(
  agent: SteppableAgent<S, I, O>,
  input: I,
  runner: MiddlewareRunner<S>,
  opts: CyberLoopOpts<S>,
): Promise<O> {
  await runner.runSetup({ input });

  let state: S = await agent.getInitialState(input);
  let step = 0;
  let prevState: S | undefined;

  while (!agent.isDone(state)) {
    const ctx: StepContext<S> = {
      step,
      state,
      prevState,
      budget: { used: step, remaining: 0 },
      metadata: {},
    };

    const beforeResult = await runner.runBeforeStep(ctx);
    if (beforeResult === 'halt') {
      opts.on?.onHalt?.('budget');
      break;
    }

    const currentCtx = beforeResult;
    const stepOutput = await agent.step(currentCtx.state);

    const stepResult: StepResult<S> = {
      state: stepOutput.state,
      action: stepOutput.action,
      cost: stepOutput.cost,
    };
    await runner.runAfterStep(currentCtx, stepResult);

    prevState = currentCtx.state;
    state = stepOutput.state;
    step++;
  }

  await runner.runTeardown({ reason: agent.isDone(state) ? 'completed' : 'halted' });
  return agent.toResult(state);
}

/**
 * Trajectory path: middleware wraps each advance() call individually.
 *
 * This is the generic control path for any `Trajectory<S>` — documents,
 * corpora, narratives, or any process modeled as a sequence of states.
 */
async function runTrajectory<S, I, O extends AgentResult>(
  trajectory: Trajectory<S>,
  input: I,
  runner: MiddlewareRunner<S>,
  opts: CyberLoopOpts<S>,
): Promise<O> {
  await runner.runSetup({ input });

  let state: S = await trajectory.getInitialState(input);
  let step = 0;
  let prevState: S | undefined;

  while (!trajectory.isTerminal(state)) {
    const ctx: StepContext<S> = {
      step,
      state,
      prevState,
      budget: { used: step, remaining: 0 },
      metadata: {},
    };

    const beforeResult = await runner.runBeforeStep(ctx);
    if (beforeResult === 'halt') {
      opts.on?.onHalt?.('budget');
      break;
    }

    const currentCtx = beforeResult;
    const frame = await trajectory.advance(currentCtx.state);

    const stepResult: StepResult<S> = {
      state: frame.state,
      action: frame.action,
      cost: frame.cost,
    };
    await runner.runAfterStep(currentCtx, stepResult);

    prevState = currentCtx.state;
    state = frame.state;
    step++;
  }

  await runner.runTeardown({ reason: trajectory.isTerminal(state) ? 'completed' : 'halted' });
  return trajectory.toOutput(state) as O;
}
