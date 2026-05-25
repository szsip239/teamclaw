import type { KbCategory, KbScope } from './knowledge-base'

export type PendingStatus = 'NEW' | 'SEEN' | 'APPLIED' | 'DISMISSED'

export interface RegulationTrackerOverview {
  id: string
  name: string
  knowledgeBaseId: string
  knowledgeBaseName: string
  knowledgeBaseDescription: string | null
  knowledgeBaseScope: KbScope
  knowledgeBaseCategory: KbCategory
  documentCount: number
  /** Documents updated after `lastCheckedAt`. */
  newUpdateCount: number
  /** Count of PendingUpdate rows with status=NEW. */
  pendingNewCount: number
  keywords: string[]
  notifyChannels: string[]
  searchCron: string | null
  lastCheckedAt: string | null
  lastCheckRunAt: string | null
  /** Latest doc updatedAt across the KB, regardless of lastCheckedAt. */
  latestDocumentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PendingUpdateItem {
  id: string
  trackerId: string
  sourceUrl: string
  source: string
  title: string
  summary: string
  suggestion: string | null
  matchedKeywords: string[]
  status: PendingStatus
  foundAt: string
  reviewedAt: string | null
}

export interface RegulationTrackerListResponse {
  trackers: RegulationTrackerOverview[]
}

/** A single wiki-style clause derived from a document's chapter summary. */
export interface RegulationClause {
  /** Stable within a document — usually the chapter heading or sequence number. */
  id: string
  title: string
  content: string
}

export interface RegulationTrackedDocument {
  id: string
  docId: string
  fileName: string
  status: string
  summary: string
  docType: string
  keywords: string[]
  clauses: RegulationClause[]
  pageCount: number | null
  updatedAt: string
  /** True if `updatedAt` is newer than tracker.lastCheckedAt. */
  isNew: boolean
}

export interface RegulationTrackerDetail extends RegulationTrackerOverview {
  documents: RegulationTrackedDocument[]
  pendingUpdates: PendingUpdateItem[]
}

export interface CheckUpdatesResult {
  trackerId: string
  trackerName: string
  keywordsUsed: string[]
  searchedAt: string
  /** New PendingUpdate rows inserted in this run. */
  newCount: number
  /** Total NEW PendingUpdate rows for this tracker after the run. */
  totalNew: number
  items: PendingUpdateItem[]
}

export interface BatchCheckUpdatesResult {
  ranAt: string
  results: CheckUpdatesResult[]
}
