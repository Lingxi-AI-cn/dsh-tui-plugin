/** Pure Session-event to semantic terminal-node projection. */

import {
  isAppendSurfaceEvent,
  type ContentBlock,
  type SessionEvent,
  type StreamChunk,
  type TodoItem,
  type ToolCallView,
  type ToolDefinition,
  type ToolResultView,
} from './host.ts'
import { terminalSafe } from './sanitize.ts'
import { TuiAppendOnlySessionWindow } from './session-window.ts'
import type { TuiKnownSessionEvent, TuiKnownSessionEventRenderResult } from './extensions.ts'
import { projectTuiTurnDeliverables, type TuiDeliverableItem } from './deliverables.ts'

/** Maximum child rows mounted inside one compact structured transcript block. */
export const STRUCTURED_CHILD_LIMIT = 6

/** Terminal color/semantic class for one projected text node. */
type TranscriptTone = 'user' | 'assistant' | 'reasoning' | 'status' | 'error'

/** Immutable terminal projection of one durable non-tool conversation fact. */
export interface TranscriptTextNode {
  /** Node discriminant. */
  kind: 'text'
  /** Stable React identity derived from Session coordinates. */
  key: string
  /** Semantic presentation class. */
  tone: TranscriptTone
  /** Short row heading. */
  label: string
  /** Terminal-safe display body. */
  text: string
  /** Durable assistant message identity, present only for finalized assistant nodes. */
  messageId?: string | undefined
  /** Scheduler turn for a finalized assistant node. */
  turn?: number | undefined
  /** Scheduler step for a finalized assistant node. */
  step?: number | undefined
  /** Whether this is the final assistant message observed before its Turn ended. */
  closing?: true | undefined
  /** Elapsed reasoning stream time for a completed Thinking block. */
  durationMs?: number | undefined
  /** Internal first reasoning event timestamp used while folding a stream. */
  reasoningStartedAt?: number | undefined
}

/** One paired tool call and result, with tool-owned render intents when available. */
export interface TranscriptToolNode {
  /** Node discriminant. */
  kind: 'tool'
  /** Stable React identity derived from the call id. */
  key: string
  /** Durable call identity. */
  callId: string
  /** Scheduler turn that owns this tool call, when recorded by the Host. */
  turn?: number | undefined
  /** Scheduler step that owns this tool call, when recorded by the Host. */
  step?: number | undefined
  /** Registered tool name, or `unknown` for an unpaired result. */
  name: string
  /** Parsed call arguments when valid JSON, otherwise the original string. */
  args: unknown
  /** Raw model-produced argument string. */
  rawArguments: string
  /** Current durable lifecycle state. */
  state: 'queued' | 'running' | 'success' | 'error' | 'cancelled'
  /** Tool-owned pending presentation, with a generic fallback always supplied. */
  callView: ToolCallView
  /** Tool-owned completed presentation, when one was produced. */
  resultView?: ToolResultView | undefined
  /** Terminal-safe model-facing result fallback. */
  output?: string | undefined
  /** Internal failure code when the result event carries one. */
  errorCode?: string | undefined
  /** Durable call and result timestamps used for terminal duration summaries. */
  startedAt?: number | undefined
  endedAt?: number | undefined
  /** Service-owned delegation lifecycle attached to this parent tool call. */
  delegation?: TranscriptDelegation | undefined
}

/** Durable subagent lifecycle attached to one parent tool call. */
interface TranscriptDelegation {
  /** Service-owned run identity. */
  runId: string
  /** Published child identity. */
  childId: string
  /** Provider that established the child. */
  provider: string
  /** Model-supplied short task label. */
  label?: string | undefined
  /** Whether the child has an in-process Agent. */
  local: boolean
  /** Start event timestamp. */
  startedAt: number
  /** Terminal event timestamp, when settled. */
  endedAt?: number | undefined
  /** Terminal child reason, when settled. */
  stopReason?: string | undefined
  /** Terminal-safe final assistant outcome. */
  outcome?: string | undefined
}

/** Latest durable todo snapshot rendered as a checklist block. */
export interface TranscriptTodoNode {
  /** Node discriminant. */
  kind: 'todo'
  /** Stable identity for the latest snapshot. */
  key: 'todo:latest'
  /** Whole-list todo snapshot. */
  todos: readonly TodoItem[]
}

/** Durable compaction lifecycle marker replacing a hidden history range. */
export interface TranscriptCompactionNode {
  /** Node discriminant. */
  kind: 'compaction'
  /** Stable identity derived from the compaction transaction. */
  key: string
  /** Durable compaction transaction identity. */
  compactionId: string
  /** Human command that initiated the compaction, when present. */
  sourceCommandId?: string | undefined
  /** Current durable lifecycle state. */
  state: 'running' | 'success' | 'failure'
  /** Terminal-safe summary text, when summarization committed. */
  summary?: string | undefined
  /** Number of surface items shadowed by the replacement. */
  shadowedItemCount: number
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
  /** Surface boundary represented by the replacement. */
  shadowedRange?: { start: number; end: number } | undefined
  /** Terminal-safe failure text, when the transaction did not commit. */
  error?: string | undefined
}

/** Successful file mutations appended immediately after one completed Turn. */
export interface TranscriptDeliverablesNode {
  /** Node discriminant. */
  kind: 'deliverables'
  /** Stable identity derived from the owning Turn. */
  key: string
  /** Scheduler Turn whose successful mutations are represented. */
  turn: number
  /** Complete bounded paths retained for detail and actions. */
  items: readonly TuiDeliverableItem[]
  /** Paths omitted by the complete-item safety bound. */
  omitted: number
}

/** One semantic exploration run or authoritative scheduler group. */
export interface TranscriptToolGroupNode {
  /** Node discriminant. */
  kind: 'tool-group'
  /** Stable identity derived from the first and last calls. */
  key: string
  /** Tool nodes retained in chronological order. */
  tools: readonly TranscriptToolNode[]
  /** Group authority and presentation category. */
  activity: 'explore' | 'parallel' | 'exclusive'
  /** Whether every authoritative member is known. */
  closed: boolean
}

/** Semantic terminal transcript node. */
export type TranscriptNode =
  | TranscriptTextNode
  | TranscriptToolNode
  | TranscriptTodoNode
  | TranscriptToolGroupNode
  | TranscriptCompactionNode
  | TranscriptDeliverablesNode

interface OptionalTranscriptEventMap {
  'tool/execution-group': {
    turn: number
    step: number
    group: number
    mode: 'parallel' | 'exclusive'
    members: { callId: string; name: string; arguments: string }[]
    closed: boolean
  }
  'subagent/delegation-start': {
    runId: string
    callId: string
    childId: string
    provider: string
    label?: string
    local: boolean
  }
  'subagent/delegation-end': {
    runId: string
    stopReason: string
    lastAssistantMessage?: ContentBlock[]
  }
}

type OptionalTranscriptEvent = {
  [Type in keyof OptionalTranscriptEventMap]: {
    readonly type: Type
    readonly seq: number
    readonly time: number
    readonly data: OptionalTranscriptEventMap[Type]
  }
}[keyof OptionalTranscriptEventMap]

/** Session events plus additive log-only facts emitted by newer compatible Hosts. */
type TuiTranscriptEvent = SessionEvent | OptionalTranscriptEvent

/** Resolve the definition visible to this TUI-owned Agent. */
export type ToolDefinitionResolver = (name: string) => ToolDefinition | undefined

/** Host-owned replacement resolver for known committed user and assistant events. */
export type TuiKnownSessionEventRenderer = (event: TuiKnownSessionEvent) => TuiKnownSessionEventRenderResult | undefined

const MAX_KNOWN_EVENT_TEXT = 4096

function contentText(content: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text)
    else if (block.type === 'reasoning') parts.push(block.text)
    else if (block.type === 'image') parts.push(`[image: ${block.attachment.name ?? block.attachment.attachmentId}]`)
    else if (block.type === 'tool-call') parts.push(`${block.name} ${block.arguments}`)
    else parts.push(contentText(block.content))
  }
  return terminalSafe(parts.filter(Boolean).join('\n'))
}

function knownEventText(content: readonly ContentBlock[]): string {
  const text = contentText(content)
  return text.length <= MAX_KNOWN_EVENT_TEXT ? text : `${text.slice(0, MAX_KNOWN_EVENT_TEXT - 1)}…`
}

function knownSessionEvent(event: SessionEvent): TuiKnownSessionEvent | undefined {
  if (event.type === 'user/message') {
    if (!isAppendSurfaceEvent(event) || event.data.source.kind !== 'user') return undefined
    return { type: 'user/message', seq: event.seq, text: knownEventText(event.data.content) }
  }
  if (event.type !== 'assistant/message' || !isAppendSurfaceEvent(event)) return undefined
  return {
    type: 'assistant/message',
    seq: event.seq,
    text: knownEventText(event.data.message.content.filter(block => block.type === 'text' || block.type === 'image')),
    ...event.data.interrupted === undefined ? {} : { interrupted: event.data.interrupted },
  }
}

function chunkText(chunk: StreamChunk): { tone: TranscriptTone; text: string } | undefined {
  if (chunk.type === 'text-delta') return { tone: 'assistant', text: terminalSafe(chunk.text) }
  if (chunk.type === 'reasoning-delta') return { tone: 'reasoning', text: terminalSafe(chunk.text) }
  return undefined
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    // Model-produced arguments are a durable external boundary; malformed JSON remains inspectable.
    return raw
  }
}

function presentCall(name: string, args: unknown, resolveTool?: ToolDefinitionResolver): ToolCallView {
  try {
    const view = resolveTool?.(name)?.presentCall?.(args)
    if (view !== undefined) return view
  } catch {
    // Presentation is optional; a stale or third-party presenter cannot break transcript replay.
  }
  return { card: 'generic', title: name, rawInput: args }
}

function presentResult(
  name: string,
  args: unknown,
  event: Extract<SessionEvent, { type: 'tool/result' }>,
  resolveTool?: ToolDefinitionResolver,
): ToolResultView | undefined {
  const result = event.data.message.content[0]
  try {
    return resolveTool?.(name)?.presentResult?.(args, {
      content: result.content,
      isError: result.isError === true,
      ...event.data.meta === undefined ? {} : { meta: event.data.meta },
    })
  } catch {
    // The raw model-facing result remains available when optional presentation fails.
    return undefined
  }
}

/**
 * Identify a tool whose provider-owned presentation is read/search activity.
 * @param node - folded tool lifecycle node.
 * @returns whether the node belongs to the Explore semantic category.
 */
export function isExplorationTool(node: TranscriptToolNode): boolean {
  if (node.resultView?.card === 'read' || node.resultView?.card === 'search') return true
  return node.callView.card === 'generic'
    && (node.callView.kind === 'read' || node.callView.kind === 'search')
}

function groupExploration(
  nodes: readonly TranscriptNode[],
  reusable = new Map<string, TranscriptToolGroupNode>(),
  retained = new Map<string, TranscriptToolGroupNode>(),
): TranscriptNode[] {
  const grouped: TranscriptNode[] = []
  for (let index = 0; index < nodes.length;) {
    const first = nodes[index]
    if (first === undefined || first.kind !== 'tool' || !isExplorationTool(first)) {
      if (first !== undefined) grouped.push(first)
      index += 1
      continue
    }
    const tools: TranscriptToolNode[] = [first]
    let next = index + 1
    while (next < nodes.length) {
      const candidate = nodes[next]
      if (candidate === undefined || candidate.kind !== 'tool' || !isExplorationTool(candidate)) break
      tools.push(candidate)
      next += 1
    }
    if (tools.length === 1) grouped.push(first)
    else {
      const key = `tool-group:${first.callId}:${tools.at(-1)?.callId ?? first.callId}`
      const previous = reusable.get(key)
      const group = previous !== undefined && previous.tools.length === tools.length
        && previous.tools.every((tool, toolIndex) => tool === tools[toolIndex])
        ? previous
        : { kind: 'tool-group' as const, key, tools, activity: 'explore' as const, closed: true }
      retained.set(key, group)
      grouped.push(group)
    }
    index = next
  }
  return grouped
}

function suppressCompletedTodoCalls(
  nodes: readonly TranscriptNode[],
  callsWithSnapshots: ReadonlySet<string>,
): TranscriptNode[] {
  const visible: TranscriptNode[] = []
  const keep = (tool: TranscriptToolNode): boolean =>
    tool.name !== 'todo_write' || tool.state !== 'success' || !callsWithSnapshots.has(tool.callId)
  for (const node of nodes) {
    if (node.kind === 'tool') {
      if (keep(node)) visible.push(node)
      continue
    }
    if (node.kind !== 'tool-group') {
      visible.push(node)
      continue
    }
    const tools = node.tools.filter(keep)
    if (tools.length > 0) visible.push(tools.length === node.tools.length ? node : { ...node, tools })
  }
  return visible
}

/**
 * Fold a complete ordered event prefix into stable semantic transcript nodes.
 * Assistant completion replaces streaming output, and a result updates its
 * `callId`-paired tool node instead of appending a second log row.
 * @param events - ordered durable Session-event prefix.
 * @param resolveTool - optional Agent-scoped tool-definition lookup for render intents.
 * @param renderKnownEvent - optional host-owned renderer for known committed events.
 * @returns immutable terminal nodes in display order.
 */
export function foldTranscript(
  events: readonly SessionEvent[],
  resolveTool?: ToolDefinitionResolver,
  renderKnownEvent?: TuiKnownSessionEventRenderer,
): readonly TranscriptNode[] {
  const state = new TranscriptFoldState(resolveTool, renderKnownEvent)
  for (const event of events) state.append(event)
  return state.snapshot()
}

class TranscriptFoldState {
  private readonly nodes: TranscriptNode[] = []
  private readonly nodeIndexByKey = new Map<string, number>()
  private readonly streamNodes = new Map<string, TranscriptTextNode>()
  private readonly lastAssistantByTurn = new Map<number, TranscriptTextNode>()
  private readonly toolNodes = new Map<string, TranscriptToolNode>()
  private readonly executionGroups = new Map<string, TranscriptToolGroupNode>()
  private readonly groupByCall = new Map<string, TranscriptToolGroupNode>()
  private readonly delegations = new Map<string, TranscriptToolNode>()
  private readonly todoCallsWithSnapshots = new Set<string>()
  private latestTodoCallId: string | undefined
  private todoNode: TranscriptTodoNode | undefined
  private readonly compactionNodes = new Map<string, TranscriptCompactionNode>()
  private readonly compactionByCommand = new Map<string, TranscriptCompactionNode>()
  private readonly compactionBySummarySeq = new Map<number, TranscriptCompactionNode>()
  private explorationGroups = new Map<string, TranscriptToolGroupNode>()
  private projected: readonly TranscriptNode[] = Object.freeze([])
  private dirty = false

  constructor(
    private readonly resolveTool?: ToolDefinitionResolver,
    private readonly renderKnownEvent?: TuiKnownSessionEventRenderer,
  ) {}

  private pushRaw(node: TranscriptNode): void {
    this.nodeIndexByKey.set(node.key, this.nodes.length)
    this.nodes.push(node)
  }

  private reindexFrom(start: number): void {
    for (let index = start; index < this.nodes.length; index += 1) {
      const node = this.nodes[index]
      if (node !== undefined) this.nodeIndexByKey.set(node.key, index)
    }
  }

  private removeRaw(node: TranscriptNode): void {
    const index = this.nodeIndexByKey.get(node.key) ?? -1
    if (index < 0 || this.nodes[index] !== node) return
    this.nodes.splice(index, 1)
    this.nodeIndexByKey.delete(node.key)
    this.reindexFrom(index)
  }

  private insertRaw(index: number, node: TranscriptNode): void {
    this.nodes.splice(index, 0, node)
    this.reindexFrom(index)
  }

  private hasRaw(node: TranscriptNode): boolean {
    const index = this.nodeIndexByKey.get(node.key) ?? -1
    return index >= 0 && this.nodes[index] === node
  }

  private replaceRaw(previous: TranscriptNode, next: TranscriptNode): void {
    const index = this.nodeIndexByKey.get(previous.key) ?? -1
    if (index < 0 || this.nodes[index] !== previous) return
    this.nodes[index] = next
    if (previous.key !== next.key) this.nodeIndexByKey.delete(previous.key)
    this.nodeIndexByKey.set(next.key, index)
  }

  private replaceGroup(previous: TranscriptToolGroupNode, next: TranscriptToolGroupNode): void {
    this.replaceRaw(previous, next)
    this.executionGroups.set(next.key, next)
    for (const tool of previous.tools) {
      if (this.groupByCall.get(tool.callId) === previous) this.groupByCall.delete(tool.callId)
    }
    for (const tool of next.tools) this.groupByCall.set(tool.callId, next)
  }

  private replaceTool(previous: TranscriptToolNode, next: TranscriptToolNode): void {
    this.toolNodes.set(next.callId, next)
    const owner = this.groupByCall.get(next.callId)
    if (owner === undefined) this.replaceRaw(previous, next)
    else {
      if (this.hasRaw(previous)) this.replaceRaw(previous, next)
      this.replaceGroup(owner, {
        ...owner,
        tools: owner.tools.map(tool => tool === previous ? next : tool),
      })
    }
    if (next.delegation !== undefined) this.delegations.set(next.delegation.runId, next)
  }

  private compactionNode(compactionId: string): TranscriptCompactionNode {
    const existing = this.compactionNodes.get(compactionId)
    if (existing !== undefined) return existing
    const node: TranscriptCompactionNode = {
      kind: 'compaction', key: `compaction:${compactionId}`, compactionId,
      state: 'running', shadowedItemCount: 0, shadowedTokenCount: 0,
    }
    this.compactionNodes.set(compactionId, node)
    this.pushRaw(node)
    return node
  }

  private replaceCompaction(
    previous: TranscriptCompactionNode,
    changes: Partial<TranscriptCompactionNode>,
    sourceCommandId: string | undefined,
  ): TranscriptCompactionNode {
    const next = {
      ...previous,
      ...changes,
      ...sourceCommandId === undefined ? {} : { sourceCommandId },
    }
    this.replaceRaw(previous, next)
    this.compactionNodes.set(next.compactionId, next)
    for (const [commandId, node] of this.compactionByCommand) {
      if (node === previous) this.compactionByCommand.set(commandId, next)
    }
    for (const [seq, node] of this.compactionBySummarySeq) {
      if (node === previous) this.compactionBySummarySeq.set(seq, next)
    }
    if (sourceCommandId !== undefined) this.compactionByCommand.set(sourceCommandId, next)
    return next
  }

  append(event: TuiTranscriptEvent): void {
    this.dirty = true
    if (event.type === 'turn/start') {
      if (this.todoNode !== undefined) this.removeRaw(this.todoNode)
      this.todoNode = undefined
      this.latestTodoCallId = undefined
      return
    }
    if (event.type === 'compaction/start') {
      const node = this.compactionNode(String(event.data.compactionId))
      this.replaceCompaction(node, {}, event.data.sourceCommandId)
      return
    }
    if (event.type === 'compaction/summary') {
      const node = this.compactionNode(String(event.data.compactionId))
      const next = this.replaceCompaction(node, {
        summary: contentText(event.data.summary),
        shadowedItemCount: event.data.shadowedSeqs.length,
        shadowedTokenCount: event.data.shadowedTokenCount,
        shadowedRange: event.data.shadowedRange,
      }, event.data.sourceCommandId)
      this.compactionBySummarySeq.set(event.seq, next)
      return
    }
    if (event.type === 'compaction/end') {
      const node = this.compactionNode(String(event.data.compactionId))
      this.replaceCompaction(node, {
        state: event.data.error === undefined ? 'success' : 'failure',
        ...event.data.error === undefined ? {} : { error: terminalSafe(event.data.error) },
      }, event.data.sourceCommandId)
      return
    }
    if (event.type === 'tool/execution-group') {
      const groupKey = `execution-group:${event.data.turn}:${event.data.step}:${event.data.group}`
      const group = this.executionGroups.get(groupKey)
      const tools = event.data.members.map((member): TranscriptToolNode => {
        const callId = String(member.callId)
        const existing = this.toolNodes.get(callId)
        if (existing !== undefined) return existing
        const args = parseArguments(member.arguments)
        const node: TranscriptToolNode = {
          kind: 'tool', key: `tool:${callId}`, callId, turn: event.data.turn, step: event.data.step,
          name: member.name, args,
          rawArguments: terminalSafe(member.arguments), state: 'queued',
          callView: presentCall(member.name, args, this.resolveTool),
        }
        this.toolNodes.set(callId, node)
        return node
      })
      if (group === undefined) {
        const next = {
          kind: 'tool-group', key: groupKey, tools,
          activity: event.data.mode, closed: event.data.closed,
        } satisfies TranscriptToolGroupNode
        this.executionGroups.set(groupKey, next)
        this.pushRaw(next)
        for (const tool of tools) this.groupByCall.set(tool.callId, next)
      } else {
        this.replaceGroup(group, { ...group, tools, closed: event.data.closed })
      }
      return
    }
    if (event.type === 'user/message') {
      if (!isAppendSurfaceEvent(event) || event.data.source.kind !== 'user') return
      const rendered = this.renderKnownEvent?.(knownSessionEvent(event) ?? {
        type: 'user/message', seq: event.seq, text: '',
      })
      this.pushRaw(rendered === undefined
        ? { kind: 'text', key: `event:${event.seq}`, tone: 'user', label: 'You', text: contentText(event.data.content) }
        : { kind: 'text', key: `event:${event.seq}`, ...rendered })
      return
    }
    if (event.type === 'assistant/chunk') {
      const projected = chunkText(event.data.chunk)
      if (projected === undefined) return
      const streamKey = `${event.data.turn}:${event.data.step}:${projected.tone}`
      const previous = this.streamNodes.get(streamKey)
      if (previous === undefined) {
        const node: TranscriptTextNode = {
          kind: 'text', key: `stream:${streamKey}`, tone: projected.tone,
          label: projected.tone === 'reasoning' ? 'Thinking' : 'Assistant', text: projected.text,
          ...projected.tone === 'reasoning' ? { reasoningStartedAt: event.time } : {},
        }
        this.streamNodes.set(streamKey, node)
        this.pushRaw(node)
      } else {
        const next = {
          ...previous,
          text: previous.text + projected.text,
          ...projected.tone === 'reasoning'
            ? { durationMs: Math.max(0, event.time - (previous.reasoningStartedAt ?? event.time)) }
            : {},
        }
        this.replaceRaw(previous, next)
        this.streamNodes.set(streamKey, next)
      }
      return
    }
    if (event.type === 'assistant/message') {
      if (!isAppendSurfaceEvent(event)) return
      const visible = event.data.message.content.filter(block => block.type === 'text' || block.type === 'image')
      const reasoning = event.data.message.content.filter(block => block.type === 'reasoning')
      const assistantKey = `${event.data.turn}:${event.data.step}:assistant`
      const reasoningKey = `${event.data.turn}:${event.data.step}:reasoning`
      const rendered = this.renderKnownEvent?.(knownSessionEvent(event) ?? {
        type: 'assistant/message', seq: event.seq, text: '',
      })
      const assistantNode: TranscriptTextNode = rendered === undefined
        ? {
          kind: 'text', key: `event:${event.seq}:assistant`, tone: 'assistant', label: 'Assistant', text: contentText(visible),
          messageId: String(event.data.message.id), turn: event.data.turn, step: event.data.step,
        }
        : {
          kind: 'text', key: `event:${event.seq}:assistant`, ...rendered,
          messageId: String(event.data.message.id), turn: event.data.turn, step: event.data.step,
        }
      const streamedAssistant = this.streamNodes.get(assistantKey)
      const streamedAssistantIndex = streamedAssistant === undefined
        ? -1
        : this.nodeIndexByKey.get(streamedAssistant.key) ?? -1
      const assistantIndex = streamedAssistantIndex < 0 ? this.nodes.length : streamedAssistantIndex
      if (streamedAssistantIndex < 0) this.pushRaw(assistantNode)
      else if (streamedAssistant !== undefined) this.replaceRaw(streamedAssistant, assistantNode)
      this.lastAssistantByTurn.set(event.data.turn, assistantNode)
      if (reasoning.length > 0) {
        const reasoningNode: TranscriptTextNode = {
          kind: 'text', key: `event:${event.seq}:reasoning`, tone: 'reasoning', label: 'Thinking', text: contentText(reasoning),
          durationMs: (() => {
            const streamed = this.streamNodes.get(reasoningKey)
            return streamed?.reasoningStartedAt === undefined ? undefined : Math.max(0, event.time - streamed.reasoningStartedAt)
          })(),
        }
        const streamedReasoning = this.streamNodes.get(reasoningKey)
        const reasoningIndex = streamedReasoning === undefined
          ? -1
          : this.nodeIndexByKey.get(streamedReasoning.key) ?? -1
        if (reasoningIndex < 0) this.insertRaw(Math.max(0, assistantIndex), reasoningNode)
        else if (streamedReasoning !== undefined) this.replaceRaw(streamedReasoning, reasoningNode)
      }
      return
    }
    if (event.type === 'tool/call') {
      const callId = String(event.data.callId)
      const args = parseArguments(event.data.arguments)
      const existing = this.toolNodes.get(callId)
      const node: TranscriptToolNode = existing === undefined ? {
        kind: 'tool', key: `tool:${callId}`, callId, turn: event.data.turn, step: event.data.step,
        name: event.data.name, args,
        rawArguments: terminalSafe(event.data.arguments), state: 'running',
        callView: presentCall(event.data.name, args, this.resolveTool), startedAt: event.time,
      } : { ...existing, turn: event.data.turn, step: event.data.step, state: 'running', startedAt: event.time }
      if (existing === undefined) {
        this.toolNodes.set(callId, node)
        if (!this.groupByCall.has(callId)) this.pushRaw(node)
      } else {
        const wasVisible = this.hasRaw(existing)
        const hadOwner = this.groupByCall.has(callId)
        this.replaceTool(existing, node)
        if (!wasVisible && !hadOwner) this.pushRaw(node)
      }
      if (node.name === 'todo_write') this.latestTodoCallId = callId
      return
    }
    if (event.type === 'tool/result') {
      if (!isAppendSurfaceEvent(event)) return
      const callId = String(event.data.message.source.callId)
      const result = event.data.message.content[0]
      const paired = this.toolNodes.get(callId)
      if (paired === undefined) {
        this.pushRaw({
          kind: 'tool', key: `tool-result:${event.seq}`, callId, turn: event.data.turn, step: event.data.step,
          name: 'unknown', args: undefined,
          rawArguments: '', state: 'error', callView: { card: 'generic', title: 'Unpaired tool result' },
          output: contentText(result.content), errorCode: event.data.error?.code,
        })
      } else {
        this.replaceTool(paired, {
          ...paired,
          endedAt: event.time,
          state: event.data.error?.code === 'ABORTED_BEFORE_DISPATCH'
            ? 'cancelled'
            : result.isError === true || event.data.error !== undefined ? 'error' : 'success',
          output: contentText(result.content),
          errorCode: event.data.error?.code,
          resultView: presentResult(paired.name, paired.args, event, this.resolveTool),
        })
      }
      return
    }
    if (event.type === 'subagent/delegation-start') {
      const callId = String(event.data.callId)
      const tool = this.toolNodes.get(callId)
      if (tool !== undefined) {
        const next = {
          ...tool,
          delegation: {
            runId: String(event.data.runId), childId: String(event.data.childId), provider: event.data.provider,
            ...event.data.label === undefined ? {} : { label: terminalSafe(event.data.label) },
            local: event.data.local, startedAt: event.time,
          },
        }
        this.replaceTool(tool, next)
        this.delegations.set(String(event.data.runId), next)
      }
      return
    }
    if (event.type === 'subagent/delegation-end') {
      const tool = this.delegations.get(String(event.data.runId))
      if (tool?.delegation !== undefined) {
        this.replaceTool(tool, {
          ...tool,
          delegation: {
            ...tool.delegation,
            endedAt: event.time,
            stopReason: event.data.stopReason,
            outcome: event.data.lastAssistantMessage === undefined
              ? undefined
              : contentText(event.data.lastAssistantMessage),
          },
        })
      }
      return
    }
    if (event.type === 'todo/write') {
      if (this.latestTodoCallId !== undefined) this.todoCallsWithSnapshots.add(this.latestTodoCallId)
      const node: TranscriptTodoNode = { kind: 'todo', key: 'todo:latest', todos: event.data.todos }
      if (this.todoNode === undefined) {
        this.todoNode = node
        this.pushRaw(node)
      } else {
        this.removeRaw(this.todoNode)
        this.pushRaw(node)
        this.todoNode = node
      }
      return
    }
    if (event.type === 'turn/end') {
      const lastAssistant = this.lastAssistantByTurn.get(event.data.turn)
      if (lastAssistant !== undefined) {
        const closing = { ...lastAssistant, closing: true as const }
        this.replaceRaw(lastAssistant, closing)
        this.lastAssistantByTurn.set(event.data.turn, closing)
      }
      const deliverables = projectTuiTurnDeliverables(this.nodes, event.data.turn)
      if (deliverables.items.length > 0) {
        this.pushRaw({
          kind: 'deliverables', key: `deliverables:${event.data.turn}`, turn: event.data.turn,
          items: deliverables.items, omitted: deliverables.omitted,
        })
      }
      const reason = event.data.reason
      if (reason.kind === 'error') {
        for (const tool of [...this.toolNodes.values()]) {
          if (tool.state === 'running') {
            this.replaceTool(tool, { ...tool, state: 'error', errorCode: tool.errorCode ?? reason.error.code })
          }
        }
        this.pushRaw({
          kind: 'text', key: `event:${event.seq}`, tone: 'error', label: 'Error',
          text: terminalSafe(`${reason.error.code}: ${reason.error.message}`),
        })
      } else if (reason.kind !== 'completed') {
        this.pushRaw({ kind: 'text', key: `event:${event.seq}`, tone: 'status', label: 'Turn', text: terminalSafe(reason.kind) })
      }
      return
    }
    if (event.type === 'command/done') {
      const sourceCompaction = event.data.sourceEventSeq === undefined
        ? undefined
        : this.compactionBySummarySeq.get(event.data.sourceEventSeq)
      if (this.compactionByCommand.has(String(event.data.commandId)) || sourceCompaction !== undefined) return
      this.pushRaw({
        kind: 'text', key: `event:${event.seq}`, tone: event.data.kind === 'error' ? 'error' : 'status',
        label: 'Command', text: terminalSafe(event.data.text ?? event.data.kind),
      })
    }
  }

  snapshot(): readonly TranscriptNode[] {
    if (!this.dirty) return this.projected
    const nonEmpty = this.nodes.filter(node => node.kind !== 'text' || node.text !== '')
    const retained = new Map<string, TranscriptToolGroupNode>()
    this.projected = Object.freeze(groupExploration(
      suppressCompletedTodoCalls(nonEmpty, this.todoCallsWithSnapshots),
      this.explorationGroups,
      retained,
    ))
    this.explorationGroups = retained
    this.dirty = false
    return this.projected
  }
}

/** Append-oriented, Session-local semantic transcript projection. */
export class TuiTranscriptProjectionCache {
  private state: TranscriptFoldState | undefined
  private resolver: ToolDefinitionResolver | undefined
  private renderer: TuiKnownSessionEventRenderer | undefined
  private readonly window = new TuiAppendOnlySessionWindow<SessionEvent>()

  /** Drop all process-local fold state before a Session lifecycle replacement. */
  reset(): void {
    this.state = undefined
    this.resolver = undefined
    this.renderer = undefined
    this.window.reset()
  }

  /**
   * Project an ordered durable event prefix, processing only a verified append suffix when possible.
   * @param events - complete current Session-event prefix.
   * @param resolveTool - exact Agent-scoped tool-definition lookup.
   * @param renderKnownEvent - optional host-owned renderer for known committed events.
   * @returns immutable semantic nodes in durable display order.
   */
  update(
    events: readonly SessionEvent[],
    resolveTool?: ToolDefinitionResolver,
    renderKnownEvent?: TuiKnownSessionEventRenderer,
  ): readonly TranscriptNode[] {
    let update = this.window.begin(
      events,
      this.state === undefined || resolveTool !== this.resolver || renderKnownEvent !== this.renderer,
    )
    let reset = update.reset
    if (!reset) {
      for (let index = update.startIndex; index < events.length; index += 1) {
        if (events[index]?.type === 'compaction/start') {
          reset = true
          break
        }
      }
    }
    if (reset) {
      this.state = new TranscriptFoldState(resolveTool, renderKnownEvent)
      this.resolver = resolveTool
      this.renderer = renderKnownEvent
      update = this.window.begin(events, true)
    }
    const state = this.state
    if (state === undefined) throw new Error('transcript projection state was not initialized')
    for (let index = update.startIndex; index < events.length; index += 1) {
      const event = events[index]
      if (event !== undefined) state.append(event)
    }
    this.window.commit(events)
    return state.snapshot()
  }
}
