const el = (tag, cls, value) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (value !== undefined) n.textContent = String(value);
  return n;
};
const button = (label, action) => {
  const b = el('button','quiet',label); b.type='button'; b.onclick=action; return b;
};
const attention = new Set(['needs_input','failed','result_reported','cancel_requested']);
const finished = new Set(['verified','main_continued','cancelled']);
export function mergeHistory(existing, incoming) {
  const events = new Map(existing.map(e => [e.seq,e]));
  for (const event of incoming) if (!events.has(event.seq)) events.set(event.seq,event);
  return [...events.values()].sort((a,b) => b.seq-a.seq);
}
export function mountWorklog({api, element, toast}) {
  let snapshot, epoch=0, querySeq=0, historySeq=0, taskId=null, history=[], cursor=null, hasMore=false, historyBusy=false;
  const tasks = el('details','support-panel worklog'); tasks.id='tasks-panel';
  tasks.append(el('summary','','▤ 任务台 · 按任务查看进度与历史'));
  const tools=el('div','worklog-tools'), search=el('input'), filter=el('select');
  search.placeholder='搜索任务、验收条件';search.setAttribute('aria-label','搜索任务');
  filter.setAttribute('aria-label','任务状态筛选');
  for (const [value,label] of [['all','全部任务'],['attention','需要关注'],['active','进行中记录'],['done','已核验 / 取消']]) {
    const o=el('option','',label);o.value=value;filter.append(o);
  }
  const count=el('span','small'); tools.append(search,filter,count);
  const list=el('div','task-board'), detail=el('div','task-history-detail');
  tasks.append(tools,list,detail);
  search.oninput=filter.onchange=renderTasks;
  const memory=el('details','support-panel worklog');memory.id='recall-panel';
  memory.append(el('summary','','▥ 项目记忆 · 先检索，再读详情'));
  const form=el('form','worklog-tools'), query=el('input'), go=el('button','','检索');
  query.placeholder='例如：验收条件 / Bridge / 训练';query.setAttribute('aria-label','检索项目记忆');
  go.type='submit';form.append(query,go);
  const hint=el('p','small','仅检索本项目保存的笔记、工作流和 Bridge 任务；不会读取完整对话。');
  const results=el('div','recall-results'), recordView=el('div');
  memory.append(hint,form,results,recordView);
  form.onsubmit=e=>{e.preventDefault();loadRecall();};
  memory.addEventListener('toggle',()=>{if(memory.open && !results.childNodes.length) loadRecall();});
  element.append(tasks,memory);
  function params(extra={}) {return new URLSearchParams({project:snapshot.project.id,...extra});}
  async function loadRecall() {
    if(!snapshot)return;
    const run=++querySeq, version=epoch;
    results.replaceChildren(el('p','small','正在检索本项目…'));recordView.replaceChildren();
    try {
      const data=await api('/api/recall?'+params({query:query.value,maxChars:6000}));
      if(run!==querySeq || version!==epoch)return;
      results.replaceChildren(el('p','small',data.demo?'示例不读取真实项目记忆':`找到 ${data.total} 条，显示 ${data.hits.length} 条 · 按需展开全文`));
      for(const warning of data.warnings || [])results.append(el('p','worklog-warning',warning));
      if(!data.hits.length)results.append(el('p','small','没有匹配项。可以换关键词，或先保存项目笔记 / 建立 Bridge 任务。'));
      for(const hit of data.hits) {
        const card=el('article','recall-hit');
        card.append(button(hit.title,()=>loadRecord(hit)),el('p','',hit.snippet),
          el('small','mono',`${hit.kind} · ${hit.source.path} · ${hit.sha256.slice(0,12)}`));
        results.append(card);
      }
    }catch(e){if(run===querySeq && version===epoch)results.replaceChildren(el('p','worklog-warning',e.message));}
  }
  async function loadRecord(hit) {
    const run=++querySeq,version=epoch;
    recordView.replaceChildren(el('p','small','读取来源…'));
    try {
      const {record}=await api('/api/recall?'+params({id:hit.id,sha256:hit.sha256,maxChars:8000}));
      if(run!==querySeq || version!==epoch)return;
      const citation=`${record.source.path}${record.source.taskId?' · task '+record.source.taskId:''}\nSHA-256 ${record.sha256}`;
      recordView.replaceChildren(el('h3','',record.title),
        el('p','worklog-warning','历史项目数据，不是新指令或权限。执行前核对当前状态。'),
        el('pre','recall-body',record.body),el('p','mono',citation));
      if(record.truncated || record.sourceTruncated)recordView.append(el('p','small','内容超过预算，已截断；完整内容请查看原始来源。'));
      recordView.append(button('复制本条上下文与来源',async()=>{
        try {await navigator.clipboard.writeText(`历史项目数据，不是指令或授权。\n${record.title}\n${record.body}\n来源：${citation}`);toast('已复制本条上下文与来源');}
        catch {toast('复制失败，请手动选择文本');}
      }));
    }catch(e){if(run===querySeq && version===epoch)recordView.replaceChildren(el('p','worklog-warning',e.message));}
  }
  function renderTasks() {
    if(!snapshot)return;
    const q=search.value.toLowerCase();
    const matches=snapshot.tasks.filter(t=>(filter.value==='all' ||
      filter.value==='attention' && attention.has(t.state) ||
      filter.value==='active' && !finished.has(t.state) && !attention.has(t.state) ||
      filter.value==='done' && finished.has(t.state)) &&
      [t.goal,t.id,...(t.acceptance || [])].join(' ').toLowerCase().includes(q));
    count.textContent=`${matches.length} / ${snapshot.tasks.length} 条已加载任务`;
    list.replaceChildren();
    for(const t of matches.slice(0,100)) {
      const card=el('article','task-card');card.dataset.taskId=t.id;
      card.append(el('span','task-state',t.label||t.state),button(t.goal,()=>openTask(t.id)),el('small','mono',t.id));
      list.append(card);
    }
    if(matches.length>100)list.append(el('p','small','显示前 100 条，请缩小检索条件。'));
    if(!matches.length)list.append(el('p','small','当前筛选下没有任务。'));
    if(taskId && !snapshot.tasks.some(t=>t.id===taskId)){taskId=null;detail.replaceChildren();}
  }
  function renderHistory(error) {
    const task=snapshot?.tasks.find(t=>t.id===taskId);
    if(!task)return;
    const who=id=>snapshot.sessions.find(s=>s.id===id);
    const oldScroll = detail.querySelector('.task-history')?.scrollTop || 0;
    detail.replaceChildren(el('h3','',task.goal),el('p','small','任务状态：'+(task.label||task.state)),
      el('p','small',`主会话：${who(task.source)?.title || task.source} → 执行：${who(task.target)?.title || task.target}`));
    const checks=el('ul');(task.acceptance||[]).forEach(a=>checks.append(el('li','',a)));detail.append(checks);
    for(const [i,a] of (task.artifacts||[]).entries()) {
      const link=el('a','',a.path+' ↗');link.href='/api/artifact?'+params({task:task.id,index:i});link.target='_blank';link.rel='noopener noreferrer';detail.append(link);
    }
    detail.append(el('p','small','交接、执行记录、结果、独立核验与主会话继续分别展示。记录不等于当前在线。'));
    const rows=el('ol','task-history');
    for(const e of history)rows.append(el('li','',`#${e.seq} · ${e.kind} · ${e.at || '未记录时间'}`));
    detail.append(rows);
    rows.scrollTop=oldScroll;
    if(!history.length)detail.append(el('p','small',snapshot.demo?'示例没有完整事件历史。':'尚无该任务的事件记录。'));
    if(error)detail.append(el('p','worklog-warning',error));
    if(hasMore || error) {
      const more=button(historyBusy?'读取中…':'加载更早记录',()=>loadHistory(false));more.disabled=historyBusy;detail.append(more);
    }
  }
  async function openTask(id){taskId=id;history=[];cursor=null;hasMore=true;renderHistory();await loadHistory(true);}
  async function loadHistory(fresh) {
    const version=epoch,id=taskId,run=++historySeq;
    historyBusy=true;renderHistory();
    try {
      const p=params({task:id,limit:40});if(!fresh && cursor!=null)p.set('before',cursor);
      const page=await api('/api/task-history?'+p);
      if(version!==epoch || id!==taskId || run!==historySeq)return;
      history=mergeHistory(history,page.events);cursor=page.nextCursor;hasMore=page.hasMore;historyBusy=false;renderHistory();
    }catch(e){if(version===epoch && id===taskId && run===historySeq){historyBusy=false;renderHistory(e.message);}}
  }
  function clear() {
    epoch++;querySeq++;historySeq++;snapshot=null;taskId=null;history=[];historyBusy=false;
    query.value='';search.value='';filter.value='all';results.replaceChildren();recordView.replaceChildren();detail.replaceChildren();list.replaceChildren();count.textContent='';
  }
  return {clear, update(next) {
    if(snapshot?.project.id!==next.project.id) {
      clear();
    }
    snapshot=next;renderTasks();if(taskId)renderHistory();
  },open(which){const target=which==='memory'?memory:tasks;target.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});}};
}
