import pino from 'pino'

import type { Logger } from '@/core/interfaces'

export const logger: Logger = pino({
  transport: {
    target: 'pino-pretty'
  },
})
