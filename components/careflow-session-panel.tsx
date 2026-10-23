'use client';

import { useState } from 'react';
import { ArrowRight, Check, Download, History, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CARE_SESSION_LIMIT, canClarify, careReviewBlock, exportCareSession, type CareSession, type CareSessionTurn } from '@/lib/careflow-session';

type Props = {
  session: CareSession;
  selectedTurnId?: string;
  running: boolean;
  onSelect: (turn: CareSessionTurn) => void;
  onClarify: (input: string) => void;
  onReview: (turnId: string, decision: 'approved' | 'rejected', note: string) => void;
  onReset: () => void;
  onCancel: () => void;
};

const statusLabel = (turn: CareSessionTurn) => turn.status === 'running' ? '正在执行' : turn.status === 'cancelled' ? '已取消' : turn.status === 'failed' ? '执行失败' : turn.review?.decision === 'approved' ? '已核对 · 本地' : turn.review?.decision === 'rejected' ? '已退回 · 本地' : turn.result?.intent === 'urgent' ? '安全升级' : turn.result?.status === 'needs-clarification' ? '等待补充' : turn.result?.status === 'handoff' ? '人工草稿待核对' : '执行完成';

function ReviewForm({ session, selected, onReview }: { session: CareSession; selected: CareSessionTurn; onReview: Props['onReview'] }) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const blocked = careReviewBlock(session, selected.id);
  const run = selected.result;
  return <div>
    <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-[#285f49]" />人工核对草稿</div>
    <p className="mt-2 text-xs leading-5 text-[#64746d]">核对第 {session.turns.indexOf(selected) + 1} 轮的实际工具结果。通过或退回只记录本地决定，没有发送、预约、转接或核验身份的权限。</p>
    {run && <div className="mt-3 rounded-xl border border-[#dedfd7] bg-white p-3 text-xs leading-5"><p className="font-semibold">{run.status === 'handoff' ? '转接摘要草稿' : '服务结果摘要'}</p><p className="mt-1 whitespace-pre-line text-[#596a61]">{run.answer}</p><p className="mt-2 text-[10px] text-[#6b766f]">来源：{run.citations.map((citation) => citation.id).join(' / ') || '无'} · 无外部提交</p></div>}
    {selected.review && <p className="mt-3 rounded-xl bg-[#eaf0e8] p-3 text-xs leading-5" aria-live="polite">{selected.review.decision === 'approved' ? '草稿已核对，正式操作仍需由本人通过机构渠道完成。' : `草稿已退回：${selected.review.note}`}<br />{new Date(selected.review.at).toLocaleString('zh-CN')}</p>}
    {blocked ? <p className="mt-3 text-xs leading-5 text-[#85612f]">{blocked}</p> : <>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs leading-5"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 accent-[#285f49]" />我已核对本轮信息、来源与边界，理解确认不会提交任何真实服务。</label>
      <Textarea aria-label="人工核对备注或退回原因" value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="核对备注（可选）；退回需填写至少 4 字原因" className="mt-3 min-h-20 bg-white text-xs" />
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!checked} onClick={() => onReview(selected.id, 'approved', note)} className="bg-[#285f49] text-white"><Check className="size-3.5" />核对通过 · 仅本地</Button><Button size="sm" variant="outline" disabled={note.trim().length < 4} onClick={() => onReview(selected.id, 'rejected', note)}><X className="size-3.5" />退回草稿</Button></div>
    </>}
  </div>;
}

export function CareFlowSessionPanel({ session, selectedTurnId, running, onSelect, onClarify, onReview, onReset, onCancel }: Props) {
  const [followUp, setFollowUp] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const latest = session.turns.at(-1);
  const selected = session.turns.find((turn) => turn.id === selectedTurnId) || latest;
  const clarify = canClarify(latest) && selected?.id === latest?.id;
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportCareSession(session, new Date().toISOString())], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${session.id}-audit.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section id="session-workbench" className="mt-5 scroll-mt-24 overflow-hidden rounded-2xl border border-[#d7ded6] bg-white">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e4e7df] p-5">
      <div><div className="flex items-center gap-2"><History className="size-4 text-[#285f49]" /><h2 className="text-base font-semibold">会话工作台</h2><span className="rounded-full bg-[#eaf0e8] px-2 py-1 text-[10px] text-[#426250]">仅页面内存</span></div><p className="mt-2 max-w-2xl text-xs leading-5 text-[#64746d]">独立任务 → 缺项澄清 → 实际执行 → 草稿核对 → 审计导出。最多 {CARE_SESSION_LIMIT} 轮，刷新即清空；原始输入不会写入浏览器存储。</p></div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={!session.turns.length || running} onClick={download}><Download className="size-3.5" />导出完整会话</Button><Button variant="ghost" size="sm" disabled={!session.turns.length} onClick={() => setResetRequested(true)}><RotateCcw className="size-3.5" />清空会话</Button></div>
    </div>
    {resetRequested && <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs"><p>清空会移除全部输入、结果和核对记录；需要保留时请先导出。</p><Button size="sm" variant="outline" onClick={() => { onReset(); setResetRequested(false); setFollowUp(''); }}>清空并开始新会话</Button><button onClick={() => setResetRequested(false)}>保留会话</button></div>}
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="p-5 lg:border-r lg:border-[#e4e7df]">
        <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-[#596a61]">任务时间线</p><p className="font-mono text-[11px] text-[#7a857e]">{session.turns.length} / {CARE_SESSION_LIMIT}</p></div>
        {!session.turns.length ? <div className="rounded-xl border border-dashed border-[#d6ded4] p-5 text-sm leading-6 text-[#68786e]"><p>从上方运行一个任务，这里会保留真实返回和失败记录。</p><p className="mt-2 text-xs">可以先输入「帮我预约复诊」，再补充「北京，下周二下午」，观察字段如何补齐。</p></div> : <ol className="max-h-[430px] space-y-2 overflow-auto pr-1">
          {session.turns.map((turn, index) => <li key={turn.id}><button onClick={() => onSelect(turn)} className={`w-full rounded-xl border p-3 text-left ${turn.id === selected?.id ? 'border-[#83a78b] bg-[#f0f6ee]' : 'border-[#e6e8e1] hover:bg-[#f7f8f5]'}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold text-[#53725b]">{String(index + 1).padStart(2, '0')} · {turn.parentTurnId ? '补充澄清' : '独立任务'}</span><span className="text-[10px] text-[#6e786f]">{statusLabel(turn)}</span></div><p className="mt-1 line-clamp-2 break-words text-xs leading-5">{turn.input}</p>{turn.error && <p className="mt-1 text-[11px] leading-5 text-[#9b4c35]">{turn.error}</p>}<p className="mt-2 text-[10px] text-[#7b867c]">{new Date(turn.startedAt).toLocaleTimeString('zh-CN')} · {turn.result?.orchestration ? `${turn.result.orchestration.wallClockMs} ms · ${turn.result.toolCalls.length} 次工具调用` : turn.status === 'running' ? '等待服务端返回' : '未产生成功结果'}</p></button></li>)}
        </ol>}
        <p className="mt-3 text-[10px] leading-5 text-[#78857c]">导出包含原始输入、合并请求、上下文来源、故障模式、完整工具结果、时间与核对记录。请仅使用演示信息。</p>
      </div>
      <div className="border-t border-[#e4e7df] bg-[#f8faf6] p-5 lg:border-t-0">
        {running ? <div aria-live="polite"><h3 className="text-sm font-semibold">本轮正在执行</h3><p className="mt-2 text-xs leading-5 text-[#64746d]">当前结果返回前不能确认旧草稿。取消会停止本页等待；服务端可能继续执行本地演示工具。</p><Button variant="outline" size="sm" className="mt-3" onClick={onCancel}>取消本轮等待</Button></div> : !selected ? <div><p className="text-sm font-semibold">每一步都有边界</p><ul className="mt-3 space-y-3 text-xs leading-5 text-[#64746d]"><li>01 · 澄清仅继承最新任务的已知城市、日期和时段。</li><li>02 · 新任务不继承会话上下文；授权偏好可单独关闭。</li><li>03 · 急症分支不能通过本地确认恢复自动预约。</li><li>04 · 核对决定与原始执行结果一起导出，便于复查。</li></ul></div> : clarify ? <div>
          <h3 className="text-sm font-semibold">补齐第 {session.turns.length} 轮的缺失信息</h3><p className="mt-2 text-xs leading-5 text-[#64746d]">{latest?.result?.nextActions.join(' · ')}</p>
          <Textarea value={followUp} onChange={(event) => setFollowUp(event.target.value)} maxLength={1200} aria-label="补充当前任务信息" placeholder="例如：北京，下周二下午" className="mt-3 min-h-24 bg-white text-sm" />
          <p className="mt-2 text-[11px] leading-5 text-[#718175]">预约仅继承上一轮工具已解析的字段，新字段覆盖旧字段；合并请求最多 1200 字。当前支持北京、上海、深圳、广州、杭州、成都、伦敦，以及明确日期或周几。</p>
          <Button className="mt-3 bg-[#285f49] text-white" size="sm" disabled={!followUp.trim() || session.turns.length >= CARE_SESSION_LIMIT} onClick={() => { onClarify(followUp); setFollowUp(''); }}>补充并重新执行<ArrowRight className="size-3.5" /></Button>
        </div> : <ReviewForm key={selected.id} session={session} selected={selected} onReview={onReview} />}
        {selected?.parentTurnId && <details className="mt-4 rounded-xl border border-[#e0e5db] p-3 text-xs"><summary className="cursor-pointer font-semibold">查看本轮实际提交的上下文</summary><p className="mt-2 text-[11px] text-[#64746d]">继承：{selected.inheritedSlots.join('、') || '无'}。此前对话全文不会拼入请求。</p><p className="mt-2 whitespace-pre-wrap break-words leading-5">{selected.submittedQuery}</p></details>}
        {session.turns.length >= CARE_SESSION_LIMIT && <p className="mt-4 text-xs leading-5 text-[#85612f]">已达到会话上限。不会自动丢弃历史；请导出后清空会话。</p>}
      </div>
    </div>
  </section>;
}
