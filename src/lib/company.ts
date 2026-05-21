import type { Company, Intervention, Trade } from '@/types/database'
import { TRADE_COLORS, type TradeColorKey } from '@/constants/colors'

export function companyTradeIds(co: Pick<Company, 'trade_id' | 'trade_ids'> | null | undefined): string[] {
  if (!co) return []
  if (co.trade_ids && co.trade_ids.length > 0) return co.trade_ids
  return co.trade_id ? [co.trade_id] : []
}

export function primaryTradeId(co: Pick<Company, 'trade_id' | 'trade_ids'> | null | undefined): string | null {
  return companyTradeIds(co)[0] ?? null
}

export function displayTradeId(
  co: Pick<Company, 'trade_id' | 'trade_ids'> | null | undefined,
  ivTrade?: string | null,
): string | null {
  const ids = companyTradeIds(co)
  if (ivTrade && ids.includes(ivTrade)) return ivTrade
  return ids[0] ?? ivTrade ?? null
}

/** Returns the list of intervenants for an intervention (companies array if present, else [company]). */
export function ivCompanies(iv: Pick<Intervention, 'companies' | 'company'>): string[] {
  const list = (iv.companies ?? []).filter(Boolean)
  if (list.length > 0) return list
  return iv.company ? [iv.company] : []
}

/** Picks a TRADE_COLORS palette key that isn't used by existing trades or external companies yet. */
export function pickFreshExternalColor(
  trades: Pick<Trade, 'color'>[],
  externalCompanies: Pick<Company, 'color'>[],
): TradeColorKey {
  const usedTrade = new Set(trades.map(t => t.color).filter(Boolean))
  const usedExt   = new Set(externalCompanies.map(c => c.color).filter(Boolean) as string[])
  const allKeys = Object.keys(TRADE_COLORS) as TradeColorKey[]
  // 1) prefer a key not used by any trade and not by any external company
  const fresh = allKeys.find(k => !usedTrade.has(k) && !usedExt.has(k))
  if (fresh) return fresh
  // 2) fallback : unused by externals only (we may collide with a trade color)
  const fallback1 = allKeys.find(k => !usedExt.has(k))
  if (fallback1) return fallback1
  // 3) cycle deterministically
  return allKeys[externalCompanies.length % allKeys.length]
}
