# GitHub Agent Demo: Intelligent Repository Search

This example demonstrates how **CyberLoop's AICL framework** enables an AI agent to:
- Use **probe failures as gradient signals** to guide exploration
- Automatically **switch strategies** when stuck (narrow → broaden)
- Provide **actionable answers** with specific repository recommendations

---

## Query

**"node graceful shutdown"**

---

## Exploration Journey

The agent explored through 8 steps, using probe signals to adapt its search strategy:

| Step | Query | Hits | Action | Ladder | Strategy |
|------|-------|------|--------|--------|----------|
| 0 | `node graceful shutdown "terminus"` | 1 | narrow | 0.00 | Initial narrow |
| 1-4 | `... "godaddy/terminus"` | 1 | narrow | 0.00 | Continued narrowing |
| 5 | `... "implementation"` | 0 | narrow | 0.00 | **Probe failed: no-hits** |
| 6 | Stopped (stagnation) | - | - | - | Budget exhausted |

### Key Control Loop Behaviors

1. **Probe as Gradient Signal**: When hits dropped to 0, the `gh-hit-count` probe failed with reason `'no-hits'`
2. **Strategy Switch**: System switched from `gh-hit-count` → `gh-hit-drop` probe
3. **Mode Adaptation**: Policy detected probe failures and would have switched to `'broaden'` mode if budget allowed
4. **Bounded Exploration**: Budget tracker prevented unbounded search

---

## Agent Summary Output

The agent analyzed the best results found during exploration and generated this comprehensive answer:

### Answer: Node.js Graceful Shutdown

Graceful shutdown in Node.js ensures that your server stops accepting new requests, finishes processing ongoing requests, closes connections, and tidies up resources before shutting down. This is critical for reliability, especially in production and containerized (e.g. Kubernetes) environments.

#### Recommended Repositories

##### 1. [godaddy/terminus](https://github.com/godaddy/terminus)
**Purpose:** Industry-standard library for graceful shutdown and Kubernetes readiness/liveness checks for any Node.js HTTP application.

**Why use it?**
- Widely adopted and actively maintained
- Integrates with health checks for orchestration platforms (Kubernetes)
- Manages HTTP(S) servers and cleans up resources (DBs, caches, etc.)

**How to use:**
```js
const http = require('http');
const { createTerminus } = require('@godaddy/terminus');

const server = http.createServer(app);

function onSignal () {
  // cleanup logic (e.g. close DB)
  return yourCleanupPromise();
}

createTerminus(server, {
  signal: 'SIGINT',
  onSignal,
  healthChecks: {
    '/healthcheck': async () => ({ status: 'ok' }),
  },
});

server.listen(3000);
```

##### 2. [sebhildebrandt/http-graceful-shutdown](https://github.com/sebhildebrandt/http-graceful-shutdown)
**Purpose:** Lightweight and framework-agnostic; gracefully shuts down Node.js HTTP servers.

**Why use it?**
- Simple setup for most HTTP servers
- No Kubernetes dependencies
- Customizable shutdown timeouts

**How to use:**
```js
const http = require('http');
const { shutdown } = require('http-graceful-shutdown');

const server = http.createServer(app);
server.listen(3000);

shutdown(server, {
  signals: 'SIGINT SIGTERM',
  timeout: 30000,
  finally: function() {
    console.log('Server gracefully terminated')
  }
});
```

##### 3. [gajus/lightship](https://github.com/gajus/lightship)
**Purpose:** Readiness, liveness, and shutdown handling for Node.js microservices in Kubernetes.

**Why use it?**
- Built for Kubernetes/cloud environments
- Manages state for readiness/liveness probes
- Handles proper draining and shutdown

##### 4. [simonecorsi/fine](https://github.com/simonecorsi/fine)
**Purpose:** Small utility for signal handling and cleanup for graceful Node.js app shutdown.

**Why use it?**
- Focused on modular cleanup and exit signals
- Minimal boilerplate

#### Usage Recommendations

- **For Kubernetes or cloud deployments:** Use `godaddy/terminus` or `gajus/lightship` for best-in-class readiness/liveness integration.
- **For general Node.js HTTP apps:** `sebhildebrandt/http-graceful-shutdown` offers the simplest integration.
- **For custom cleanup workflows:** `simonecorsi/fine` can be used for modular exit handling.

#### Notable Gaps

- No robust libraries surfaced for gracefully shutting down clusters (many only handle single server shutdown).
- For advanced lifecycle needs (e.g., connection draining, multi-protocol) you may need to combine or extend these libraries.
- Little coverage on non-HTTP servers (e.g., WebSocket, custom TCP) – most solutions are HTTP(S)-focused.

---

## What This Demonstrates

### AICL Framework Capabilities

1. **Probe-Driven Exploration**
   - Probes act as **internal gradient signals**, not hard blockers
   - Failed probes inform strategy changes (narrow → broaden)
   - Probe history accumulates to guide future decisions

2. **Adaptive Strategy Selection**
   - Agent detects `NoData` failures from probe signals
   - Automatically switches exploration mode based on probe history
   - Ladder regulates exploration intensity (0.00 → 0.14 when recovering)

3. **Bounded Resource Use**
   - Budget tracker prevents unbounded exploration
   - Cost tracking per action (probes: 0.05, policy: 2.0)
   - Stops when budget exhausted or stagnation detected

4. **Actionable Intelligence**
   - Not just search results, but **answers to questions**
   - Specific recommendations with code examples
   - Usage guidance for different scenarios

### Control Loop in Action

```
Observe → Probe (gradient signal) → Decide → Act → Evaluate → Adapt
   ↓                                                              ↑
   └──────────────── Ladder & Budget regulate ──────────────────┘
```

- **Probes** provide cheap feasibility checks
- **Policy** uses probe history to decide actions
- **Ladder** modulates exploration (tight → relaxed)
- **Budget** enforces bounded search
- **Evaluator** measures progress
- **StrategySelector** switches when stuck

---

## Running the Demo

```bash
# Set up environment
export GITHUB_TOKEN="your_github_token"
export OPENAI_API_KEY="your_openai_key"

# Run the demo
yarn examples:github "node graceful shutdown"
```

**Expected output:**
- Step-by-step exploration logs
- Probe pass/fail indicators (✓/✗)
- Strategy switches (🔀)
- Budget consumption (💰)
- Final summary with repository recommendations

---

## Key Takeaways

✅ **Probes as gradient signals** - Failures inform exploration, don't block it  
✅ **Self-correcting exploration** - Agent adapts strategy based on probe feedback  
✅ **Bounded intelligence** - Budget and ladder prevent runaway exploration  
✅ **Actionable results** - Not just data, but answers with recommendations  

This demonstrates **controlled intelligence** - the agent explores effectively while maintaining stability and bounded cost.
