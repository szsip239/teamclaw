// ─── Cron Job Types (read-only, from OpenClaw Gateway) ──────────────

/** Schedule configuration for a cron job */
export interface CronSchedule {
  kind: 'at' | 'every' | 'cron'
  /** ISO 8601 timestamp for one-shot jobs */
  at?: string
  /** Interval in milliseconds for recurring jobs */
  everyMs?: number
  /** 5/6-field cron expression */
  expr?: string
  /** IANA timezone for cron expressions */
  tz?: string
  /** Stagger window in milliseconds */
  staggerMs?: number
}

/** Payload configuration */
export interface CronPayload {
  kind: 'systemEvent' | 'agentTurn'
  /** System event text (main session) */
  text?: string
  /** Agent turn message (isolated session) */
  message?: string
  /** Model override */
  model?: string
  /** Thinking level override */
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  /** Timeout override in seconds */
  timeoutSeconds?: number
  /** Lightweight bootstrap context */
  lightContext?: boolean
}

/** Delivery configuration for isolated jobs */
export interface CronDelivery {
  mode: 'announce' | 'webhook' | 'none'
  channel?: string
  to?: string
  bestEffort?: boolean
}

/** A cron job record from cron.list */
export interface CronJob {
  jobId: string
  name: string
  description?: string
  enabled: boolean
  schedule: CronSchedule
  sessionTarget: 'main' | 'isolated'
  wakeMode?: 'now' | 'next-heartbeat'
  payload: CronPayload
  delivery?: CronDelivery
  agentId?: string
  deleteAfterRun?: boolean
  /** ISO timestamp of next scheduled run */
  nextRunAt?: string
  /** ISO timestamp of last run */
  lastRunAt?: string
  /** Last run status */
  lastRunStatus?: string
  createdAt?: string
}

/** A single run history entry from cron.runs */
export interface CronRun {
  jobId: string
  jobName?: string
  runId: string
  status: 'success' | 'error' | 'skipped' | 'running' | string
  startedAt: string
  endedAt?: string
  durationMs?: number
  error?: string
  /** Model used for the run */
  model?: string
  /** Token usage */
  tokens?: { input?: number; output?: number }
  /** Delivery result */
  deliveryStatus?: string
  /** Brief summary of the run output */
  summary?: string
}

// ─── API Response Types ─────────────────────────────────────────────

export interface CronListResult {
  jobs: CronJob[]
}

export interface CronRunsResult {
  runs: CronRun[]
}

// ─── API Route Response Types ───────────────────────────────────────

export interface CronListResponse {
  jobs: CronJob[]
  instanceId: string
}

export interface CronRunsResponse {
  runs: CronRun[]
  instanceId: string
}
