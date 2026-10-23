'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Eraser,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  Play,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  careFlowPresets,
  runCareFlowAgent,
  type CareFlowRun,
  type CareMemory,
} from '@/lib/careflow-agent';
import type { CareFlowFailureMode } from '@/lib/careflow-langgraph';

import { CareFlowSessionPanel } from '@/components/careflow-session-panel';
import { createCareSession, startCareTurn, finishCareTurn, reviewCareTurn, reconcileCarePreferences, CARE_SESSION_LIMIT, type CareSession } from '@/lib/careflow-session';

const agentIcons = {
  Coordinator: Bot,
  'Evidence Agent': FileSearch,
  'Safety Agent': ShieldCheck,
};

const intentLabels = {
  appointment: '预约协助',
  records: '资料找回',
  'report-prep': '报告沟通准备',
  billing: '费用流程',
  urgent: '安全升级',
  unknown: '需要澄清',
};

export default function CareFlowPage() {
  const firstRun = useMemo(() => runCareFlowAgent(careFlowPresets[0], { consented: false }, 'CF-DEMO-001'), []);
  const [query, setQuery] = useState<string>(careFlowPresets[0]);
  const [memory, setMemory] = useState<CareMemory>({ consented: false });
  const [errorMessage, setErrorMessage] = useState('');
  const [run, setRun] = useState<CareFlowRun>(firstRun);
  const [failureMode, setFailureMode] = useState<CareFlowFailureMode>('none');
  const [running, setRunning] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(firstRun.trace.length);
  const [expandedStep, setExpandedStep] = useState('verify');
  const [session, setSession] = useState(() => createCareSession('CF-SESSION', ''));
  const [selectedTurnId, setSelectedTurnId] = useState<string>();
  const sessionRef = useRef(session);
  const memoryRef = useRef(memory);
  const activeRequest = useRef<{ turnId: string; controller: AbortController } | null>(null);
  const consentRevision = useRef(0);
  const selectedTurn = session.turns.find((turn) => turn.id === selectedTurnId);
  const showRun = !session.turns.length || !!selectedTurn?.result;
  const isLatestResult = selectedTurn?.id === session.turns.at(-1)?.id && selectedTurn?.status === 'succeeded';
  const updateSession = useCallback((next: CareSession) => { sessionRef.current = next; setSession(next); }, []);

  useEffect(() => () => { activeRequest.current?.controller.abort(); activeRequest.current = null; }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('careflow-consented-memory');
      if (!saved) return;
      const parsed = JSON.parse(saved) as CareMemory;
      if (parsed.consented === true) {
        const restored: CareMemory = {
          consented: true,
          city: typeof parsed.city === 'string' ? parsed.city.slice(0, 20) : undefined,
          preferredTime: ['上午', '下午', '晚间'].includes(String(parsed.preferredTime)) ? parsed.preferredTime : undefined,
        };
        memoryRef.current = restored;
        const restoredRevision = ++consentRevision.current;
        const frame = window.requestAnimationFrame(() => { if (consentRevision.current === restoredRevision) setMemory(restored); });
        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      // The demo remains usable without browser storage.
    }
  }, []);

  const execute = useCallback(async (nextQuery: string, _animate = true, clarify = false) => {
    let nextSession: CareSession;
    const turnId = 'CF-TURN-' + crypto.randomUUID();
    try {
      const current = sessionRef.current;
      nextSession = startCareTurn(current.turns.length ? current : createCareSession('CF-SESSION-' + crypto.randomUUID(), new Date().toISOString()), {
        id: turnId, input: nextQuery, clarify, at: new Date().toISOString(), failureMode, memory: memoryRef.current,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法开始本轮任务。');
      return null;
    }
    const turn = nextSession.turns.at(-1)!;
    const requestConsentRevision = consentRevision.current;
    const controller = new AbortController();
    activeRequest.current = { turnId, controller };
    updateSession(nextSession);
    setSelectedTurnId(turnId);
    setRunning(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/careflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ query: turn.submittedQuery, memory: turn.memoryAtRequest, failureMode }),
      });
      if (!response.ok) throw new Error(`careflow ${response.status}`);
      const payload = await response.json() as { result: CareFlowRun };
      if (activeRequest.current?.turnId !== turnId) return null;
      const result = payload.result;
      if (!result?.orchestration || !Array.isArray(result.trace) || !Array.isArray(result.toolCalls)) throw new Error('invalid_run');
      const preferences = reconcileCarePreferences(requestConsentRevision, consentRevision.current, turn.memoryAtRequest, memoryRef.current, result.memory);
      result.memory = preferences.resultMemory;
      if (!preferences.apply) result.memoryDelta = '运行期间授权或偏好已改变；本轮返回的旧偏好已丢弃，保留当前选择。';
      else if (!result.memory.consented) result.memoryDelta = '未授权或已撤销；不保留本轮服务偏好。';
      updateSession(finishCareTurn(sessionRef.current, turnId, { result }, new Date().toISOString()));
      setRun(result);
      if (preferences.apply) {
        setMemory(preferences.memory);
        memoryRef.current = preferences.memory;
      }
      setSelectedTurnId(turnId);
      setVisibleSteps(result.trace.length);
      setExpandedStep(result.intent === 'urgent' ? 'finish' : 'verify');
      try {
        if (preferences.apply) {
          if (preferences.memory.consented) window.localStorage.setItem('careflow-consented-memory', JSON.stringify(preferences.memory));
          else window.localStorage.removeItem('careflow-consented-memory');
        }
      } catch { /* Preference storage is optional; session inputs are never persisted. */ }
      return result;
    } catch {
      if (activeRequest.current?.turnId !== turnId) return null;
      const message = '本轮执行或校验失败，没有生成成功结果。可查看历史记录；关闭故障演练后重新运行。';
      updateSession(finishCareTurn(sessionRef.current, turnId, { error: message }, new Date().toISOString()));
      setErrorMessage(message);
      return null;
    } finally {
      if (activeRequest.current?.turnId === turnId) { activeRequest.current = null; setRunning(false); }
    }
  }, [failureMode, updateSession]);

  const cancelTurn = () => {
    const pending = activeRequest.current;
    if (!pending) return;
    activeRequest.current = null;
    pending.controller.abort();
    updateSession(finishCareTurn(sessionRef.current, pending.turnId, { error: '已停止等待；本轮不会被迟到响应覆盖。服务端可能继续执行本地演示。', cancelled: true }, new Date().toISOString()));
    setRunning(false);
  };

  const resetSession = () => {
    cancelTurn();
    updateSession(createCareSession('CF-SESSION-' + crypto.randomUUID(), new Date().toISOString()));
    setSelectedTurnId(undefined);
    setQuery('');
    setErrorMessage('');
    setRun(firstRun);
    setVisibleSteps(firstRun.trace.length);
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'run_careflow_service_task',
      title: '运行 CareFlow 服务任务',
      description: '运行安全可溯源的医疗服务流程演示。只处理预约、材料、记录与费用流程，不提供医学建议。',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 4, maxLength: 1200 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input: unknown) {
        if (!input || typeof input !== 'object' || typeof (input as { query?: unknown }).query !== 'string') throw new Error('query is required');
        const result = await execute((input as { query: string }).query, false);
        if (!result) throw new Error('CareFlow execution failed safely; no success result was produced.');
        return { runId: result.id, status: result.status, intent: result.intent, toolCalls: result.toolCalls.map((item) => item.tool), safe: result.safety.passed };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [execute]);

  const toggleConsent = () => {
    const consented = !memoryRef.current.consented;
    consentRevision.current++;
    const next = consented ? { ...memoryRef.current, consented } : { consented: false };
    setMemory(next);
    memoryRef.current = next;
    if (!consented) {
      try { window.localStorage.removeItem('careflow-consented-memory'); } catch { /* optional persistence */ }
    }
  };

  const clearMemory = () => {
    consentRevision.current++;
    setMemory({ consented: false });
    memoryRef.current = { consented: false };
    try { window.localStorage.removeItem('careflow-consented-memory'); } catch { /* optional persistence */ }
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[#15201c]">
      <header className="sticky top-0 z-40 border-b border-[#ddd8cb] bg-[#f7f8fa]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => window.location.assign('/agent-lab')} className="grid size-9 shrink-0 place-items-center rounded-md border border-[#d8d2c4] bg-white" aria-label="返回 工具首页"><ArrowLeft className="size-4" /></button>
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6b766f]">服务工具</p><h1 className="text-base font-semibold tracking-[-0.025em] sm:text-lg">CareFlow <span className="hidden font-normal text-[#6d766f] sm:inline">服务请求</span></h1></div>
          </div>
          <div className="flex items-center gap-2"><Badge className="bg-[#dbe7f7] text-[#242a33] hover:bg-[#dbe7f7]">CareFlow 工作台</Badge><Badge variant="outline" className="hidden border-[#d3cec1] bg-white text-[#53645d] sm:inline-flex">LangGraph</Badge></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.34fr)_360px]">
          <Card className="overflow-hidden border-0 bg-[#242a33] text-white ">
            <CardHeader className="gap-3 px-5 pt-6 sm:px-7">
              <CardTitle className="max-w-4xl text-2xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-xl">把一次问答，推进为可复查的服务流程</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-6 sm:px-7">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{careFlowPresets.map((preset, index) => <button key={preset} onClick={() => setQuery(preset)} className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-semibold ${query === preset ? 'border-[#dbe7f7] bg-[#dbe7f7] text-[#242a33]' : 'border-white/15 bg-white/7 text-[#c7d3cd]'}`}>案例 {index + 1}</button>)}</div>
              <Textarea maxLength={1200} value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-24 resize-none border-white/15 bg-white/8 p-4 text-[15px] leading-6 text-white placeholder:text-white/40 focus-visible:border-[#dbe7f7] focus-visible:ring-[#dbe7f7]/20" aria-label="输入服务任务" />
              <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9fb2a9]">故障演练</span>{([
                ['none', '正常链路'], ['retrieval-timeout', '检索超时 → 自动重试'], ['tool-timeout', '工具瞬时失败 → 重试'], ['tool-invalid-output', '损坏工具结果 → 拒绝'],
              ] as const).map(([value, label]) => <button key={value} onClick={() => setFailureMode(value)} className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold ${failureMode === value ? 'border-[#dbe7f7] bg-[#dbe7f7] text-[#242a33]' : 'border-white/15 text-[#c7d3cd]'}`}>{label}</button>)}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm leading-5 text-[#9fb2a9]">合成数据 · 不提交真实预约或工单 · 不提供医疗建议</p><Button disabled={running || query.trim().length < 4 || session.turns.length >= CARE_SESSION_LIMIT} onClick={() => void execute(query)} className="h-10 rounded-md bg-[#dbe7f7] px-5 font-semibold text-[#242a33] hover:bg-white">{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}{running ? '运行中' : '运行独立任务'}</Button></div>
              {errorMessage && <p role="alert" className="mt-4 rounded-xl bg-red-950 p-4 text-sm leading-6 text-white">{errorMessage}</p>}
              <p className="mt-3 text-xs leading-5 text-[#d5ded9]">紧急情况请直接联系急救或现场人员，本工具不会代为联系。</p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
            <CardHeader className="border-b border-[#e5e0d5]"><div className="flex items-center justify-between"><div><CardTitle className="mt-1">本机偏好</CardTitle></div><CircleUserRound className="size-5 text-[#3a6755]" /></div></CardHeader>
            <CardContent>
              <button aria-label={memory.consented ? '关闭长期记忆' : '开启长期记忆'} aria-pressed={memory.consented} onClick={toggleConsent} className={`flex w-full items-center justify-between rounded-2xl p-4 text-left ${memory.consented ? 'bg-[#ecf7e4]' : 'bg-[#f3f1eb]'}`}><div><p className="text-sm font-semibold">允许保存服务偏好</p><p className="mt-1 text-[11px] text-[#6b766f]">仅城市、时段、任务类型；默认关闭，可随时清空</p></div><span className={`relative h-6 w-11 rounded-md transition ${memory.consented ? 'bg-[#285f49]' : 'bg-[#b6b8b2]'}`}><span className={`absolute top-1 size-4 rounded-md bg-white transition ${memory.consented ? 'left-6' : 'left-1'}`} /></span></button>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-[#e0ddd4] p-3"><p className="text-[10px] text-[#7e8782]">城市</p><p className="mt-1 font-semibold">{memory.city || '未记录'}</p></div>
                <div className="rounded-xl border border-[#e0ddd4] p-3"><p className="text-[10px] text-[#7e8782]">偏好时段</p><p className="mt-1 font-semibold">{memory.preferredTime || '未记录'}</p></div>
                <div className="col-span-2 rounded-xl border border-[#e0ddd4] p-3"><p className="text-[10px] text-[#7e8782]">最近任务</p><p className="mt-1 font-semibold">{memory.recentIntent ? intentLabels[memory.recentIntent] : '未记录'}</p></div>
              </div>
              <button onClick={clearMemory} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[#d8d2c5] py-2.5 text-xs font-semibold text-[#5c6963]"><Eraser className="size-3.5" />清空本机记忆</button>
            </CardContent>
          </Card>
        </div>

        <CareFlowSessionPanel
          session={session} selectedTurnId={selectedTurnId} running={running}
          onSelect={(turn) => { setSelectedTurnId(turn.id); if (turn.result) { setRun(turn.result); setVisibleSteps(turn.result.trace.length); } }}
          onClarify={(input) => { void execute(input, false, true); }}
          onReview={(turnId, decision, note) => {
            try { updateSession(reviewCareTurn(sessionRef.current, turnId, decision, note, new Date().toISOString())); }
            catch (error) { setErrorMessage(error instanceof Error ? error.message : '无法确认草稿。'); }
          }}
          onReset={resetSession} onCancel={cancelTurn}
        />

        {showRun && <>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#eaf0e8] px-4 py-3 text-xs text-[#426250]">
          <p>{!selectedTurn ? '初始示例 · 尚未执行，不属于本次会话' : `${isLatestResult ? '最新运行结果' : '历史结果 · 只读'} · 第 ${session.turns.indexOf(selectedTurn) + 1} 轮`}</p>
          <span className="break-all font-mono text-[10px]">{run.id}</span>
        </div>
        <div className="mt-3 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_370px]">
          <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
            <CardHeader className="border-b border-[#e8e3d9]"><div className="flex items-center justify-between"><CardTitle>执行记录</CardTitle><span className="font-mono text-[10px] text-[#748078]">{run.orchestration ? run.orchestration.wallClockMs + ' ms' : '示例，非实测'}</span></div></CardHeader>
            <CardContent className="space-y-1">
              {run.trace.map((step, index) => {
                const Icon = agentIcons[step.agent];
                const visible = index < visibleSteps;
                const expanded = expandedStep === step.id && visible;
                return <button key={step.id} disabled={!visible} onClick={() => setExpandedStep(expanded ? '' : step.id)} className={`w-full rounded-xl p-3 text-left transition ${expanded ? 'bg-[#edf6e8]' : visible ? 'hover:bg-[#f6f5f1]' : 'opacity-35'}`}><div className="flex gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-md ${step.status === 'warning' ? 'bg-[#f5e5c6] text-[#7b592d]' : 'bg-[#242a33] text-[#dbe7f7]'}`}>{visible ? <Icon className="size-4" /> : <LoaderCircle className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{step.label}</p><ChevronDown className={`size-3.5 text-[#87908a] ${expanded ? 'rotate-180' : ''}`} /></div><p className="mt-1 text-[10px] text-[#78837d]">{step.agent === 'Coordinator' ? '流程' : step.agent === 'Evidence Agent' ? '检索' : '校验'}</p></div></div>{expanded && <p className="ml-11 mt-2 border-l-2 border-[#ced9d0] pl-3 text-[11px] leading-5 text-[#65716b]">{step.detail}</p>}</button>;
              })}
            </CardContent>
          </Card>

          <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
            <CardHeader className="border-b border-[#e8e3d9]"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="mt-1">{intentLabels[run.intent]}</CardTitle></div><Badge className={run.status === 'handoff' ? 'bg-[#f3dfc0] text-[#714c20]' : 'bg-[#e5f4df] text-[#2a6248]'}>{run.status === 'handoff' ? '待人工处理（草稿）' : run.status === 'needs-clarification' ? '等待补充' : '完成'}</Badge></div></CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-base leading-7 text-[#405249]">{run.answer}</p>
              <div className="mt-5 rounded-2xl bg-[#f7f8fa] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#66766e]">下一步</p><div className="mt-3 space-y-2">{run.nextActions.map((action, index) => <p key={action} className="flex items-center gap-2 text-xs text-[#56665e]"><span className="grid size-5 place-items-center rounded-md bg-white text-[9px] font-semibold text-[#285f49]">{index + 1}</span>{action}</p>)}</div></div>
              <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#66766e]">来源与更新时间</p><div className="mt-2 space-y-2">{run.citations.length ? run.citations.map((citation) => <div key={citation.id} className="rounded-xl border border-[#e3dfd5] p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{citation.title}</p><span className="font-mono text-[9px] text-[#7d8881]">{citation.id}</span></div><p className="mt-1 text-[11px] leading-5 text-[#6b7770]">{citation.excerpt}</p><p className="mt-1 text-[10px] text-[#819087]">更新于 {citation.updatedAt} · 演示规则库</p></div>) : <p className="rounded-xl bg-[#f5f3ee] p-3 text-xs text-[#6e7973]">本轮没有足够来源，因此只返回澄清问题。</p>}</div></div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
              <CardHeader className="border-b border-[#e8e3d9]"><CardTitle>运行信息</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>计划来源：<strong>{run.orchestration?.modelMode === 'openai' ? run.orchestration.model : run.orchestration?.modelMode === 'test-fixture' ? '离线测试输入' : run.orchestration ? (run.orchestration.modelAttempted ? '模型调用后采用规则计划' : '规则计划（未调用模型）') : '初始示例，尚未运行'}</strong></p>
                <p className="leading-6 text-[#596a60]">{run.orchestration?.plannerReason || '点击运行后显示服务端记录。'}</p>
                <div><p className="font-semibold">计划工具</p><p className="mt-1 break-words font-mono">{run.orchestration?.plannedTools?.join(' → ') || '无'}</p></div>
                <div><p className="font-semibold">实际工具</p><p className="mt-1 break-words font-mono">{run.orchestration?.executedTools?.join(' → ') || '无'}</p></div>
                <p>Token：{run.orchestration?.usage?.totalTokens ?? '未调用或未返回'} · 恢复：{run.orchestration?.recoveredFailures ?? 0} 次</p>
                <p className="text-[#596a60]">本地演示工具；没有连接医院 API。检查点仅在进程内。</p>
                <Button variant="outline" disabled={!run.orchestration || running} onClick={() => {
                  const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
                  const anchor = document.createElement('a'); anchor.href = url; anchor.download = run.id + '.json'; anchor.click(); URL.revokeObjectURL(url);
                }}>下载本次运行记录</Button>
              </CardContent>
            </Card>
            <Card className="border-0 bg-[#303b4b] text-white"><CardHeader className="border-b border-white/10"><div className="flex items-center justify-between"><CardTitle className="text-white">安全闸门</CardTitle><ShieldCheck className="size-5 text-[#dbe7f7]" /></div></CardHeader><CardContent><p className="text-sm font-semibold text-[#dbe7f7]">{run.safety.passed ? 'PASS' : 'BLOCK'}</p><p className="mt-2 text-xs leading-5 text-[#c4d3d9]">{run.safety.reason}</p><div className="mt-4 flex items-center gap-2 rounded-xl bg-white/8 p-3 text-[11px] text-[#d5e0e4]"><LockKeyhole className="size-3.5 text-[#dbe7f7]" />独立校验节点不可被计划器省略。</div></CardContent></Card>
            <Card className="border-0 bg-white ring-1 ring-[#ded9cd]"><CardHeader className="border-b border-[#e8e3d9]"><CardTitle>工具调用</CardTitle></CardHeader><CardContent className="space-y-2">{run.toolCalls.map((call) => <div key={call.id} className="rounded-xl bg-[#f5f4ef] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-[10px] font-semibold text-[#315b4a]">{call.tool}</p>{call.status === 'ok' ? <CheckCircle2 className="size-3.5 shrink-0 text-[#3c795d]" /> : <AlertTriangle className="size-3.5 shrink-0 text-[#aa7640]" />}</div><p className="mt-1 text-[10px] leading-4 text-[#768078]">{call.output}</p></div>)}</CardContent></Card>
          </div>
        </div>

        </>}

        <div className="mt-6 flex justify-end"><Button variant="outline" onClick={() => window.location.assign('/agentbench')}>打开评测</Button></div>
      </section>

      <footer className="border-t border-[#ddd8cb] bg-white/60"><div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11px] text-[#69746e]"><p>CareFlow · 本地演示工具</p><p className="flex items-center gap-1.5"><Stethoscope className="size-3.5" />服务流程工程演示，不提供医疗建议</p></div></footer>
    </main>
  );
}
