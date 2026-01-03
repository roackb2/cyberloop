import fs from 'fs'
import path from 'path'
import pino from 'pino'
import pretty from 'pino-pretty'

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

  // Configure pretty stream for console
  const prettyStream = pretty({
    colorize: true,
    sync: true // Ensure logs are flushed immediately to console
  });

  // Re-initialize logger with multi-stream (File + Console)
  logger = pino({
    level: 'debug'
  }, pino.multistream([
    { stream: fs.createWriteStream(logPath), level: 'debug' }, // Raw JSON to file
    { stream: prettyStream, level: 'info' } // Pretty print to console
  ]));

  return logPath;
}
