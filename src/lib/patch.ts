import type { InputEvent, JsonValue } from '../types'

/** 补录校验结果：成功给出可合并的本地补录事件，失败给出就地展示的错误信息 */
export type PatchResult =
  | { ok: true; event: InputEvent }
  | { ok: false; message: string }

/**
 * 为某条流的缺失序号构建一条“本地补录”事件。
 * 校验规则：
 * 1. 载荷文本必须是合法 JSON（任意 JSON 值均可）；
 * 2. 该序号在当前输入（NDJSON 观测事件）中不存在——
 *    与观测事件占位冲突时拒绝。
 * 补录事件 line 固定为 0、source 为 'patch'，与输入事件合并后
 * 照常参与折叠、冲突、连续前缀与导出计算。
 */
export function buildPatchEvent(
  events: readonly InputEvent[],
  stream: string,
  sequence: number,
  rawText: string,
): PatchResult {
  const trimmed = rawText.trim()
  if (trimmed === '') {
    return { ok: false, message: '请输入载荷 JSON（任意 JSON 值均可）' }
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

  const occupied = events.some(
    (ev) => ev.stream === stream && ev.sequence === sequence,
  )
  if (occupied) {
    return {
      ok: false,
      message: `序号 #${sequence} 已存在观测事件，只能为缺失序号补录`,
    }
  }

  return {
    ok: true,
    event: {
      line: 0,
      stream,
      sequence,
      payload,
      raw: trimmed,
      source: 'patch',
    },
  }
}
