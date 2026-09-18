import { useEffect, useState } from 'react'
import type { InputEvent, StreamAnalysis } from '../types'
import { resolutionKey } from '../lib/model'
import { prettyJson } from '../lib/compare'

interface StreamCardProps {
  analysis: StreamAnalysis
  selections: Readonly<Record<string, string>>
  /** 当前流已保存的本地补录事件 */
  patches: InputEvent[]
  onResolve: (stream: string, sequence: number, candidateId: string) => void
  onUnresolve: (stream: string, sequence: number) => void
  onStartChange: (stream: string, start: number) => void
  /** 返回 null 表示保存成功，否则为就地展示的错误信息 */
  onAddPatch: (stream: string, sequence: number, rawText: string) => string | null
  onRemovePatch: (stream: string, sequence: number) => void
}

function linesLabel(lines: number[]): string {
  if (lines.length <= 4) return lines.join(', ')
  return `${lines.slice(0, 4).join(', ')} 等 ${lines.length} 行`
}

const statusBadge = (a: StreamAnalysis): { text: string; cls: string } => {
  if (a.blockedByConflict) return { text: '冲突阻断', cls: 'badge-danger' }
  if (a.blockedByGap) return { text: '缺号阻断', cls: 'badge-warn' }
  return { text: '连续无阻断', cls: 'badge-ok' }
}

export function StreamCard({
  analysis: a,
  selections,
  patches,
  onResolve,
  onUnresolve,
  onStartChange,
  onAddPatch,
  onRemovePatch,
}: StreamCardProps) {
  const badge = statusBadge(a)
  const conflictGroups = a.groups.filter((g) => g.isConflict)
  const streamPatches = [...patches].sort((x, y) => x.sequence - y.sequence)

  // 缺口补录编辑器状态：当前编辑的缺号、输入文本与就地错误
  const [editingGap, setEditingGap] = useState<number | null>(null)
  const [patchText, setPatchText] = useState('')
  const [patchError, setPatchError] = useState<string | null>(null)

  // 缺口集合变化（补录成功、调整起始序号等）时收起编辑器
  const gapsKey = a.gaps.join(',')
  useEffect(() => {
    setEditingGap(null)
    setPatchText('')
    setPatchError(null)
  }, [gapsKey])

  const toggleEditor = (sequence: number) => {
    if (editingGap === sequence) {
      setEditingGap(null)
    } else {
      setEditingGap(sequence)
    }
    setPatchText('')
    setPatchError(null)
  }

  const handleSavePatch = () => {
    if (editingGap === null) return
    const error = onAddPatch(a.name, editingGap, patchText)
    if (error) {
      // JSON 非法或与观测事件占位冲突：就地报错，编辑器保持打开
      setPatchError(error)
      return
    }
    setEditingGap(null)
    setPatchText('')
    setPatchError(null)
  }

  const chosenIdFor = (sequence: number): string | null => {
    const id = selections[resolutionKey(a.name, sequence)]
    return id ?? null
  }

  return (
    <section className="stream-card">
      <header className="stream-head">
        <div className="stream-title">
          <h3>{a.name}</h3>
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <div className="stream-meta">
          <label>
            起始序号
            <input
              type="number"
              className="start-input"
              value={a.start}
              step={1}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isSafeInteger(v)) onStartChange(a.name, v)
              }}
            />
          </label>
          <span className="meta-item">观测序号 {a.minObserved}–{a.maxObserved}</span>
          <span className="meta-item">输入 {a.totalEvents} 条</span>
          <span className="meta-item">已确认前缀 {a.prefix.length} 条</span>
        </div>
      </header>

      {a.gaps.length > 0 && (
        <div className="block gaps-block">
          <h4>
            缺口（缺号）
            <span className="block-hint">点击缺号可为该序号补录事件载荷</span>
          </h4>
          <div className="gap-list">
            {a.gaps.map((g) => (
              <button
                type="button"
                key={g}
                className={`gap-chip gap-chip-btn ${
                  a.blockingGap === g ? 'gap-chip-hot' : ''
                } ${editingGap === g ? 'gap-chip-editing' : ''}`}
                title={
                  a.blockingGap === g
                    ? '该缺号阻断其后所有事件，点击补录'
                    : '位于阻断点之后，点击补录'
                }
                onClick={() => toggleEditor(g)}
              >
                #{g}
                {a.blockingGap === g ? ' ⛔' : ''}
              </button>
            ))}
          </div>
          {editingGap !== null && (
            <div className="patch-editor">
              <div className="patch-editor-head">
                补录序号 #{editingGap} 的载荷（任意 JSON 值，保存后立即重算连续前缀）
              </div>
              <textarea
                className="patch-input"
                rows={3}
                spellCheck={false}
                placeholder='{"id":"a","status":"recovered"}'
                value={patchText}
                onChange={(e) => {
                  setPatchText(e.target.value)
                  setPatchError(null)
                }}
              />
              {patchError && <p className="patch-error">✖ {patchError}</p>}
              <div className="patch-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSavePatch}
                >
                  保存补录
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => toggleEditor(editingGap)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {streamPatches.length > 0 && (
        <div className="block patch-block">
          <h4>
            本地补录
            <span className="block-hint">
              与输入事件合并参与去重、前缀与导出；可逐条撤销，重新解析后清空
            </span>
          </h4>
          <div className="patch-list">
            {streamPatches.map((p) => (
              <div key={p.sequence} className="patch-item">
                <div className="patch-item-bar">
                  <span className="patch-seq">#{p.sequence}</span>
                  <span className="patch-tag">本地补录</span>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => onRemovePatch(a.name, p.sequence)}
                  >
                    撤销补录（回退前缀）
                  </button>
                </div>
                <pre className="payload">{prettyJson(p.payload)}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {conflictGroups.length > 0 && (
        <div className="block conflict-block">
          <h4>
            冲突候选
            <span className="block-hint">载荷结构不同，选择一个版本以放行；可撤销</span>
          </h4>
          <div className="conflict-list">
            {conflictGroups.map((g) => {
              const chosenId = chosenIdFor(g.sequence)
              const isHot = a.blockingConflict === g.sequence
              return (
                <div
                  key={g.sequence}
                  className={`conflict-group ${isHot ? 'conflict-hot' : ''} ${
                    chosenId ? 'conflict-resolved' : ''
                  }`}
                >
                  <div className="conflict-seq">
                    序号 #{g.sequence}
                    {isHot && <span className="hot-tag">阻断中 · 未裁决</span>}
                    {chosenId && !isHot && (
                      <span className="resolved-tag">已裁决</span>
                    )}
                    <span className="line-hint">输入行：{linesLabel(g.allLines)}</span>
                  </div>
                  <div className="candidate-grid">
                    {g.candidates.map((c, idx) => {
                      const selected = chosenId === c.id
                      return (
                        <div
                          key={c.id}
                          className={`candidate ${selected ? 'candidate-selected' : ''}`}
                        >
                          <div className="candidate-bar">
                            <label className="candidate-pick">
                              <input
                                type="radio"
                                name={`choice-${a.name}-${g.sequence}`}
                                checked={selected}
                                onChange={() =>
                                  onResolve(a.name, g.sequence, c.id)
                                }
                              />
                              版本 {String.fromCharCode(65 + idx)}
                            </label>
                            <span
                              className="dup-count"
                              title="结构完全相同的重复观测"
                            >
                              ×{c.lines.length}
                            </span>
                            <span className="line-hint">行 {linesLabel(c.lines)}</span>
                          </div>
                          <pre className="payload">{prettyJson(c.payload)}</pre>
                        </div>
                      )
                    })}
                  </div>
                  {chosenId && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => onUnresolve(a.name, g.sequence)}
                    >
                      撤销选择（重新标为未裁决）
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="block prefix-block">
        <h4>
          当前连续前缀
          <span className="block-hint">
            从 {a.start} 起连续且无未裁决冲突，共 {a.prefix.length} 条；下一期待序号 #{a.nextExpected}
          </span>
        </h4>
        {a.prefix.length === 0 ? (
          <p className="empty-line">尚无已确认事件</p>
        ) : (
          <div className="prefix-table-wrap">
            <table className="prefix-table">
              <thead>
                <tr>
                  <th className="col-seq">序号</th>
                  <th>载荷</th>
                  <th className="col-lines">来源行</th>
                </tr>
              </thead>
              <tbody>
                {a.prefix.map((ev) => (
                  <tr key={ev.sequence}>
                    <td className="col-seq">{ev.sequence}</td>
                    <td>
                      <pre className="payload payload-inline">
                        {prettyJson(ev.payload)}
                      </pre>
                    </td>
                    <td className="col-lines">
                      {ev.lines[0] === 0 ? (
                        <span className="patch-src">本地补录</span>
                      ) : (
                        <>
                          {linesLabel(ev.lines)}
                          {ev.lines.length > 1 && (
                            <em className="folded">（重复已折叠）</em>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
