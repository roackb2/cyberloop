import fs from 'fs'
import path from 'path'
import pino from 'pino'

import type { Logger } from '../../core/interfaces'

// Default logger (Console only)
export let logger: Logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  },
  level: 'debug'
})

export const setupBenchmarkLogger = (scenario: string, policy: string) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `run_${scenario}_${policy}_${timestamp}.log`;
  const logDir = path.join(process.cwd(), 'local', 'benchmarks');

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logPath = path.join(logDir, filename);

  // Re-initialize logger with multi-stream (File + Console)
  // Note: pino-pretty doesn't work well inside multistream for stdout,
  // so we'll keep stdout raw or simple for now, or just use file for detailed debug.
  logger = pino({
    level: 'debug'
  }, pino.multistream([
    { stream: fs.createWriteStream(logPath), level: 'debug' },
    { stream: process.stdout, level: 'info' } // Less verbose on console
  ]));

  return logPath;
}
