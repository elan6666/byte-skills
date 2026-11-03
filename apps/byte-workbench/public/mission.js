const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
const key=s=>s.harness+':'+s.nativeId;
const labels={todo:'待办',in_progress:'进行中',blocked:'受阻',review:'待核验',done:'已完成'};
const button=(text,fn)=>{const b=el('button','mission-button',text);b.type='button';b.onclick=fn;return b;};
function field(label,tag='input'){const l=el('label','mission-field',label),input=el(tag);input.setAttribute('aria-label',label);l.append(input);return {l,input};}
export function mountMission({root,api,onSnapshot,toast,onView,onSession}){
 let snap,epoch=0,tab='office',editing=false,lastItems=null;
 const bar=el('div','mission-switch'),office=button('像素办公室',()=>view('office')),tech=button('协作指挥台',()=>view('tech'));
 const register=button('登记展示会话',()=>{picker.hidden=!picker.hidden;if(!picker.hidden)renderPicker();});
 bar.append(office,tech,register);root.append(bar);
 const picker=el('section','mission-picker');picker.hidden=true;
 const ptitle=el('h2','','登记展示会话'),hint=el('p','small','只登记本次要关注的对话。未登记的历史会话不会进入办公室；登记不连接、不唤醒 Agent。');
 const ps=field('筛选可登记会话'),checks=el('div','mission-checks'),save=button('保存展示登记',savePicker);
 picker.append(ptitle,hint,ps.l,checks,save,button('关闭',()=>picker.hidden=true));root.append(picker);
 ps.input.oninput=()=>filterPicker();
 const dashboard=el('section','mission-tech');dashboard.hidden=true;
 const head=el('div','mission-head');head.append(el('div','', 'BYTE / MISSION CONTROL'),el('h2','','把目标、执行与交接连起来'));
 const stats=el('div','mission-stats'),graph=el('div','mission-graph'),groups=el('div','mission-groups');dashboard.append(head,stats,graph,groups);root.append(dashboard);
 const todos=el('section','mission-todos');todos.id='mission-todos';todos.append(el('h2','','任务与方案'),el('p','small','进度按登记步骤统计；Bridge 记录、证据引用和独立验收分别展示。'));
 const actions=el('div','mission-actions');actions.append(button('＋ 新建任务方案',()=>openTask()),button('＋ 登记合作',openCollaboration));todos.append(actions);
 const editor=el('div','mission-editor');editor.hidden=true;const list=el('div','mission-items');todos.append(editor,list);root.append(todos);
 const empty=el('div','mission-empty');root.append(empty);
 function view(next){tab=next;dashboard.hidden=next!=='tech';office.setAttribute('aria-pressed',String(next==='office'));tech.setAttribute('aria-pressed',String(next==='tech'));onView(next);}
 async function persist(action,value,original){if(!snap||snap.demo)return toast('示例不保存真实登记');if(action==='task'&&original&&JSON.stringify(snap.board.items.find(x=>x.id===original.id))!==JSON.stringify(original))return toast('方案已被其他操作更新，请重新打开后保存');const version=epoch;try{const result=await api('/api/workboard?'+new URLSearchParams({project:snap.project.id}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:snap.board.revision,action,value})});if(version!==epoch)return;onSnapshot(result.snapshot);toast('登记已保存');return true;}catch(e){toast(e.message);}}
 function renderPicker(){if(!snap)return;checks.replaceChildren();const chosen=new Set((snap.board?.displaySessions||[]).map(key)),unique=new Map();for(const s of snap.sessionCatalog||[])unique.set(key(s),s);
  for(const s of unique.values()){const l=el('label','mission-session'),c=el('input');c.type='checkbox';c.checked=chosen.has(key(s));c.dataset.harness=s.harness;c.dataset.nativeId=s.nativeId;l.dataset.search=[s.title,s.harness,s.nativeId].join(' ').toLowerCase();l.append(c,el('span','',s.title),el('small','',s.harness+(s.parentNativeId?' · 子代理':'')));checks.append(l);}
  for(const s of snap.board?.displaySessions||[])if(!unique.has(key(s))){const l=el('label','mission-session'),c=el('input');c.type='checkbox';c.checked=true;c.dataset.harness=s.harness;c.dataset.nativeId=s.nativeId;l.dataset.search=s.nativeId.toLowerCase();l.append(c,el('span','',s.nativeId+' · 来源暂不可用，可取消登记'));checks.append(l);}
  filterPicker();
 }
 function filterPicker(){const q=ps.input.value.trim().toLowerCase();for(const l of checks.children)l.hidden=q&&!l.dataset.search?.includes(q);}
 async function savePicker(){const value=[...checks.querySelectorAll('input:checked:not(:disabled)')].map(c=>({harness:c.dataset.harness,nativeId:c.dataset.nativeId}));if(await persist('display',value))picker.hidden=true;}
 function begin(title){editing=true;editor.hidden=false;editor.replaceChildren(el('h3','',title));}
 function end(){editing=false;editor.hidden=true;editor.replaceChildren();}
 function openTask(item){if(!snap||snap.demo)return toast('请选择真实项目');begin(item?'编辑方案':'新建任务方案');
  const title=field('任务名称'),objective=field('目标与方案','textarea'),steps=field('执行步骤（每行一步）','textarea'),acceptance=field('验收条件（每行一条）','textarea');
  title.input.value=item?.title||'';objective.input.value=item?.objective||'';steps.input.value=(item?.steps||[]).map(s=>s.title).join('\n');acceptance.input.value=(item?.acceptance||[]).join('\n');editor.append(title.l,objective.l,steps.l,acceptance.l);
  editor.append(button('保存任务方案',async()=>{const names=steps.input.value.split('\n').map(x=>x.trim()).filter(Boolean);const next={id:item?.id||crypto.randomUUID(),title:title.input.value.trim(),objective:objective.input.value.trim(),status:item?.status||'todo',participants:item?.participants||[],acceptance:acceptance.input.value.split('\n').map(x=>x.trim()).filter(Boolean),steps:names.map((name,i)=>{const old=item?.steps[i];return old?.title===name?old:{id:crypto.randomUUID(),title:name,status:'todo',evidence:[]};})};if(await persist('task',next,item))end();}),button('取消',end));
 }
 function openCollaboration(){if(!snap||snap.demo)return toast('请选择真实项目');if(snap.sessions.length<2)return toast('请先登记至少两个会话');begin('登记合作关系');const title=field('合作名称'),members=el('div','mission-checks');editor.append(title.l,members);
  const byKey=new Map(snap.sessions.map(s=>[key(s),s]));for(const s of byKey.values()){const row=el('label','mission-session'),check=el('input'),role=el('input');check.type='checkbox';check.dataset.harness=s.harness;check.dataset.nativeId=s.nativeId;role.placeholder='分工：主执行 / 评审 / 监督';role.setAttribute('aria-label',s.title+'的分工');row.append(check,el('span','',s.title),role);members.append(row);}
  const taskChoices=el('div','mission-checks');for(const t of snap.board.items){const l=el('label'),c=el('input');c.type='checkbox';c.dataset.task=t.id;l.append(c,el('span','',t.title));taskChoices.append(l);}editor.append(el('p','','关联任务方案'),taskChoices);
  editor.append(button('保存合作登记',async()=>{const ms=[...members.querySelectorAll('input[type=checkbox]:checked')].map(c=>({harness:c.dataset.harness,nativeId:c.dataset.nativeId,role:c.parentNode.querySelector('input:not([type=checkbox])').value.trim()}));const value={id:crypto.randomUUID(),title:title.input.value.trim(),members:ms,taskIds:[...taskChoices.querySelectorAll('input:checked')].map(c=>c.dataset.task),bridgeTaskIds:[]};if(await persist('collaboration',value))end();}),button('取消',end));
 }
 function drawGraph(){graph.replaceChildren();const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 440');svg.setAttribute('role','img');svg.setAttribute('aria-label','登记会话之间的实际 Bridge 协作与计划关系');const nodes=snap.sessions.slice(0,24),positions=new Map();
  nodes.forEach((s,i)=>{const angle=2*Math.PI*i/Math.max(nodes.length,1)-Math.PI/2;positions.set(s.id,{x:500+340*Math.cos(angle),y:220+160*Math.sin(angle)});});
  const line=(a,b,label,planned)=>{const p=positions.get(a),q=positions.get(b);if(!p||!q)return;const l=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:p.x,y1:p.y,x2:q.x,y2:q.y,stroke:planned?'#687d96':'#34e4cf','stroke-width':2,'stroke-dasharray':planned?'7 8':'none'}))l.setAttribute(k,String(v));const tt=document.createElementNS(ns,'title');tt.textContent=label;l.append(tt);svg.append(l);};
  for(const c of snap.board.collaborations){const ids=c.members.map(m=>snap.sessions.find(s=>key(s)===key(m))?.id).filter(Boolean);for(let i=1;i<ids.length;i++)line(ids[0],ids[i],c.title+' · 登记计划',true);}
  for(const t of snap.tasks)line(t.source,t.target,(t.label||t.state)+' · '+t.goal,false);
  for(const s of nodes){const p=positions.get(s.id),g=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle');g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label','查看会话 '+s.title);g.addEventListener('click',()=>onSession?.(s.id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSession?.(s.id);}});for(const [k,v] of Object.entries({cx:p.x,cy:p.y,r:31,fill:'#112c40',stroke:'#34e4cf','stroke-width':2}))circle.setAttribute(k,String(v));g.append(circle);
    for(const [value,y,size] of [[s.harness,p.y+5,12],[s.title.slice(0,17),p.y+52,13]]){const tx=document.createElementNS(ns,'text');tx.setAttribute('x',p.x);tx.setAttribute('y',y);tx.setAttribute('text-anchor','middle');tx.setAttribute('fill','#e2effa');tx.setAttribute('font-size',size);tx.textContent=value;g.append(tx);}svg.append(g);}
  graph.append(svg,el('p','mission-legend','实线：本项目 Bridge 任务记录　虚线：登记的合作计划；均不代表当前在线。'));
  if(nodes.length<snap.sessions.length)graph.append(el('p','mission-legend','拓扑展示前 24 个会话；其余会话可在名册查看。'));
 }
 function render(){if(!snap)return;register.disabled=!!snap.demo;const b=snap.board||{items:[],collaborations:[],displaySessions:[]};
  if(!snap.sessions.length&&!snap.demo)empty.replaceChildren(el('strong','','还没有登记展示会话'),el('p','','点击“登记展示会话”，选择本次项目需要关注的对话。历史会话不会自动加入。'));else empty.replaceChildren();
  const signature=JSON.stringify([snap.project.id,b.items]);
  if(signature!==lastItems){lastItems=signature;list.replaceChildren();for(const item of b.items){const card=el('article','mission-item'),done=item.steps.filter(s=>s.status==='done').length;card.append(el('h3','',item.title),el('p','',item.objective),el('div','mission-item-progress',`${done}/${item.steps.length} 步 · ${labels[item.status]} · 登记进度`));const progress=el('progress');progress.max=item.steps.length;progress.value=done;card.append(progress);
    const accept=el('ul');item.acceptance.forEach(a=>accept.append(el('li','',a)));card.append(accept);
    for(const step of item.steps){const row=el('div','mission-step'),select=el('select');select.setAttribute('aria-label',item.title+' / '+step.title+'状态');for(const [v,label]of Object.entries(labels)){const o=el('option','',label);o.value=v;select.append(o);}select.value=step.status;
      const evidence=el('input');evidence.placeholder='证据引用或产物路径；完成时必填';evidence.value=step.evidence.join('\n');evidence.setAttribute('aria-label',step.title+'证据');row.append(el('span','',step.title),select,evidence,button('更新',async()=>{const next=structuredClone(item),target=next.steps.find(s=>s.id===step.id);target.status=select.value;target.evidence=evidence.value.split('\n').map(x=>x.trim()).filter(Boolean);next.status=next.steps.every(s=>s.status==='done')?'done':next.steps.some(s=>s.status==='blocked')?'blocked':next.steps.some(s=>s.status==='review')?'review':next.steps.some(s=>s.status!=='todo')?'in_progress':'todo';await persist('task',next,item);}));card.append(row);}
    card.append(button('编辑方案',()=>openTask(item)));list.append(card);
  }if(!b.items.length)list.append(el('p','small','暂无任务方案。讨论或规划形成可执行任务后，可由 Byte 保存，也可在这里登记。'));}
  stats.replaceChildren();for(const [title,value]of [['已登记会话',snap.sessions.length],['任务方案',b.items.length],['步骤登记进度',snap.planProgress?.percent==null?'—':snap.planProgress.percent+'%'],['Bridge 任务记录',snap.tasks.length]]){const n=el('div');n.append(el('small','',title),el('strong','',value));stats.append(n);}
  if(!snap.demo)drawGraph();groups.replaceChildren();for(const c of b.collaborations){const section=el('article','mission-group');section.append(el('h3','',c.title));for(const m of c.members)section.append(el('p','',`${snap.sessions.find(s=>key(s)===key(m))?.title||m.nativeId} · ${m.role}`));
    const members=new Set(c.members.map(key)),ids=new Set(snap.sessions.filter(s=>members.has(key(s))).map(s=>s.id));const actual=snap.tasks.filter(t=>ids.has(t.source)&&ids.has(t.target));
    const plans=b.items.filter(t=>c.taskIds.includes(t.id)),steps=plans.flatMap(t=>t.steps),done=steps.filter(s=>s.status==='done').length;
    section.append(el('p','',steps.length?`关联方案：${done}/${steps.length} 步已登记完成`:'尚未关联任务方案'));
    section.append(el('p','',actual.length?`匹配到 ${actual.length} 条参与者之间的 Bridge 任务记录（不自动等同于关联方案执行）`:'仅登记计划 · 尚无匹配的 Bridge 任务记录'));
    for(const t of actual)section.append(el('p','mission-actual',`${t.label||t.state} · ${t.goal}`));groups.append(section);}
  if(!b.collaborations.length)groups.append(el('p','mission-legend','尚未登记合作关系。可在下方“登记合作”中关联会话、分工和任务方案。'));
 }
 return {update(next){if(snap?.project.id!==next.project.id){epoch++;end();picker.hidden=true;ps.input.value='';}snap=next;render();},view};
}
