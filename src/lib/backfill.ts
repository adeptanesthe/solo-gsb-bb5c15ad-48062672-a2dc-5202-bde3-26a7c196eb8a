import type { BackfillEvent, InputEvent, JsonValue } from '../types'

/**
 * 将一条本地补录转换为可参与统一计算的输入事件：
 * 行号置 0（不对应任何输入行），并标记 origin 供界面区分来源。
 */
export function backfillToInputEvent(b: BackfillEvent): InputEvent {
  return {
    line: 0,
    stream: b.stream,
    sequence: b.sequence,
    payload: b.payload,
    raw: b.raw,
    origin: 'backfill',
  }
}

/**
 * 合并原始输入事件与本地补录。补录与观测事件走同一条
 * 分组/折叠/裁决/前缀/导出流水线，不做特殊分支。
 */
export function mergeBackfills(
  events: readonly InputEvent[],
  backfills: readonly BackfillEvent[],
): InputEvent[] {
  if (backfills.length === 0) return [...events]
  return [...events, ...backfills.map(backfillToInputEvent)]
}

export type BackfillCheck =
  | { ok: true; payload: JsonValue; raw: string }
  | { ok: false; message: string }

/**
 * 校验一条待保存的补录：
 * 1. payload 必须是合法 JSON（任意 JSON 值均可）；
 * 2. 序号不得与当前输入中的观测事件占位冲突——
 *    只允许补入当前输入中不存在的序号。
 * 校验失败时就地报错，不产生任何状态变更。
 */
export function checkBackfill(
  stream: string,
  sequence: number,
  payloadText: string,
  observedEvents: readonly InputEvent[],
): BackfillCheck {
  const trimmed = payloadText.trim()
  if (trimmed === '') {
    return { ok: false, message: 'payload 不能为空，请输入任意 JSON 值' }
  }

  let payload: JsonValue
  try {
    payload = JSON.parse(trimmed) as JsonValue
  } catch (e) {
    return {
      ok: false,
      message: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const occupied = observedEvents.some(
    (ev) => ev.stream === stream && ev.sequence === sequence,
  )
  if (occupied) {
    return {
      ok: false,
      message: `序号 #${sequence} 已存在于当前输入（观测事件占位），不能补录`,
    }
  }

  return { ok: true, payload, raw: trimmed }
}
