/**
 * Web-search adapter for the regulation update pipeline.
 *
 * We keep this pluggable: production environments wire in baidu-search /
 * vane-search, while developer setups (no API key configured) fall through
 * to a deterministic mock that fabricates plausible-looking findings so the
 * end-to-end flow (skill → API → PendingUpdate → UI) can still be demoed.
 *
 * Real providers can be enabled by setting REGULATION_SEARCH_PROVIDER and
 * the matching credentials; without them we never fail the pipeline.
 */

export interface SearchHit {
  /** Stable identifier — used as `PendingUpdate.sourceUrl`. */
  url: string
  title: string
  summary: string
  /** Keywords from the tracker that triggered this hit. */
  matchedKeywords: string[]
  /** Optional draft suggestion the agent can refine later. */
  suggestion?: string
}

export interface SearchProvider {
  name: string
  search(keywords: string[]): Promise<SearchHit[]>
}

class MockSearchProvider implements SearchProvider {
  name = 'mock'
  async search(keywords: string[]): Promise<SearchHit[]> {
    if (keywords.length === 0) return []
    const today = new Date().toISOString().slice(0, 10)
    const seed = keywords.slice(0, 3).join('-')
    return [
      {
        url: `https://example.gov.cn/regulations/${encodeURIComponent(seed)}-${today}`,
        title: `${keywords[0]} 相关法规更新（${today}）`,
        summary: `检测到关键词「${keywords.slice(0, 3).join('、')}」的相关法规可能已于近期更新。请人工核实最新原文。`,
        matchedKeywords: keywords.slice(0, 3),
        suggestion: `请确认现行内部制度中涉及「${keywords[0]}」的条款是否与最新法规保持一致；如有差异，建议同步修订。`,
      },
    ]
  }
}

/** Real search via 博查 (Bocha) API. Set BOCHA_API_KEY in .env and
 *  REGULATION_SEARCH_PROVIDER=bocha to activate. */
class BochaSearchProvider implements SearchProvider {
  name = 'bocha'
  private apiKey: string
  private baseUrl = 'https://api.bocha.cn/v1/web-search'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(keywords: string[]): Promise<SearchHit[]> {
    if (keywords.length === 0) return []
    const hits: SearchHit[] = []

    for (const kw of keywords.slice(0, 5)) {
      try {
        const resp = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: kw, count: 3, freshness: 'oneMonth', summary: true }),
        })
        const json = await resp.json()
        if (json.code && json.code !== 200) continue
        const pages = json.data?.webPages?.value ?? []
        for (const p of pages) {
          if (!p.url || !p.name) continue
          hits.push({
            url: p.url,
            title: p.name,
            summary: p.summary || p.snippet || '',
            matchedKeywords: [kw],
            suggestion: `请核实「${p.name}」是否影响现行内部制度，如有必要请更新知识库。`,
          })
        }
      } catch {
        // Skip individual keyword failures — don't break the whole pipeline.
        continue
      }
    }
    return hits
  }
}

let cachedProvider: SearchProvider | null = null

export function getSearchProvider(): SearchProvider {
  if (cachedProvider) return cachedProvider

  const provider = process.env.REGULATION_SEARCH_PROVIDER

  if (provider === 'bocha') {
    const apiKey = process.env.BOCHA_API_KEY
    if (apiKey) {
      cachedProvider = new BochaSearchProvider(apiKey)
      return cachedProvider
    }
  }

  cachedProvider = new MockSearchProvider()
  return cachedProvider
}
