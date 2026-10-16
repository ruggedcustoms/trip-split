// Trip Split — app screens. Talks to the Worker API under /api/.
(function(){
"use strict";
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const S={members:[],trips:[],expenses:[],polls:[],votes:[],messages:[],disputes:[]};
let state="loading";              // loading | ready | error
let version=-1, meId=null;
const TABS=["home","money","polls","chat","group"];
let tab=ls.get("ts-tab")||"home";
if(TABS.indexOf(location.hash.slice(1))>=0) tab=location.hash.slice(1);
if(TABS.indexOf(tab)<0) tab="home";
let tripId=ls.get("ts-trip");

const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr=p=>"₹"+(Math.abs(p)/100).toLocaleString("en-IN",{minimumFractionDigits:Math.abs(p)%100?2:0,maximumFractionDigits:2});
const nameOf=id=>{const m=S.members.find(m=>m.id===id);return m?m.name:"Former member"};
const initials=n=>String(n).trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"?";
const fmtDate=d=>{try{return new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"})}catch(e){return d}};
const fmtRange=t=>t.start&&t.end?fmtDate(t.start)+" – "+fmtDate(t.end):t.start?"From "+fmtDate(t.start):"";
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const hasMe=()=>!!meId&&S.members.some(m=>m.id===meId);

function toast(msg){const r=$("#toastRoot");r.innerHTML='<div class="toast" role="status">'+esc(msg)+'</div>';clearTimeout(toast.t);toast.t=setTimeout(()=>r.innerHTML="",3200)}

/* ---------- server ---------- */
async function api(method,path,body){
  let r;
  try{
    r=await fetch(path,{method,credentials:"same-origin",headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  }catch(e){const x=new Error("You're offline. Check your internet and try again.");x.status=0;throw x}
  const type=r.headers.get("content-type")||"";
  if(!type.includes("json")&&r.status!==204){const x=new Error("Something went wrong. Reload and try again.");x.status=r.status;throw x}
  let d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){const x=new Error(d&&d.error||"Something went wrong. Try again.");x.status=r.status;throw x}
  return d;
}
async function write(fn,ok){
  try{await fn();if(ok)toast(ok);await refresh();return true}
  catch(e){toast(e.message);if(e.status===401)setTimeout(()=>location.reload(),2500);return false}
}

/* ---------- trips & money math (all in paise) ---------- */
const trip=()=>S.trips.find(t=>t.id===tripId)||null;
const tripMemberIds=t=>(t&&t.members&&t.members.length?t.members.filter(id=>S.members.some(m=>m.id===id)):S.members.map(m=>m.id));
const membersOf=t=>{const ids=tripMemberIds(t);return S.members.filter(m=>ids.includes(m.id))};
const expOf=id=>S.expenses.filter(e=>e.tripId===id);
const openDisp=e=>S.disputes.filter(d=>d.expenseId===e.id&&d.status!=="resolved");
const disputedIn=id=>expOf(id).filter(e=>openDisp(e).length).length;
function shares(e){
  const ids=(e.split||[]).slice().sort(), n=ids.length; if(!n)return {};
  const base=Math.floor(e.paise/n); let rem=e.paise-base*n; const out={};
  ids.forEach(id=>{out[id]=base+(rem>0?1:0); if(rem>0)rem--});
  return out;
}
function stats(id){
  const paid={},share={},bal={}; let total=0; const list=expOf(id);
  list.forEach(e=>{
    if(!e.paise||!e.paidBy)return;
    total+=e.paise;
    paid[e.paidBy]=(paid[e.paidBy]||0)+e.paise;
    bal[e.paidBy]=(bal[e.paidBy]||0)+e.paise;
    const sh=shares(e); for(const k in sh){share[k]=(share[k]||0)+sh[k];bal[k]=(bal[k]||0)-sh[k]}
  });
  return {total,paid,share,bal,count:list.length};
}
function settlements(b){
  const cr=[],dr=[];
  for(const id in b){if(b[id]>0)cr.push({id,v:b[id]});else if(b[id]<0)dr.push({id,v:-b[id]})}
  cr.sort((a,b)=>b.v-a.v);dr.sort((a,b)=>b.v-a.v);
  const out=[];let i=0,j=0;
  while(i<dr.length&&j<cr.length){
    const x=Math.min(dr[i].v,cr[j].v);
    if(x>0)out.push({from:dr[i].id,to:cr[j].id,v:x});
    dr[i].v-=x;cr[j].v-=x;
    if(dr[i].v<=0)i++; if(cr[j].v<=0)j++;
  }
  return out;
}
const myPill=v=>v>0?'<span class="pill good num">You get back '+inr(v)+'</span>':v<0?'<span class="pill bad num">You owe '+inr(v)+'</span>':'<span class="pill">Settled</span>';

/* ---------- views ---------- */
function banner(){
  if(state==="loading")return '<div class="banner">Loading your trips…</div>';
  if(state==="error")return '<div class="banner">Couldn\'t load your trips. Check your internet; the app will keep trying.</div>';
  return "";
}
function noTrip(){
  return '<div class="card empty"><b>Create a trip first</b>Expenses, polls and chat each belong to a trip.<div style="margin-top:14px"><button class="btn" data-act="newTrip" type="button">+ New trip</button></div></div>';
}
function tripBar(){
  const t=trip();
  return '<button class="tripbar" data-act="pickTrip" type="button"><span class="main"><span class="label">Trip</span><span class="tn">'+esc(t.name)+'</span></span><span class="sw">Switch ▾</span></button>';
}

function viewHome(){
  const all={paid:0,share:0,bal:0,total:0}, per={}, ts={};
  S.trips.forEach(t=>{
    const s=stats(t.id); ts[t.id]=s; all.total+=s.total;
    for(const k in s.paid){per[k]=per[k]||{paid:0,share:0};per[k].paid+=s.paid[k]}
    for(const k in s.share){per[k]=per[k]||{paid:0,share:0};per[k].share+=s.share[k]}
    all.paid+=s.paid[meId]||0;all.share+=s.share[meId]||0;all.bal+=s.bal[meId]||0;
  });
  const nT=S.trips.length+' trip'+(S.trips.length===1?'':'s');
  let h='<section class="card hero stack" style="gap:10px">';
  h+='<span class="label">You\'ve spent across '+nT+'</span><div class="big num">'+inr(all.share)+'</div>';
  h+='<div class="stats"><div><span class="label">You paid</span><b class="num">'+inr(all.paid)+'</b></div><div><span class="label">'+(all.bal>0?"Owed to you":all.bal<0?"You owe":"Balance")+'</span><b class="num">'+(all.bal===0?"Settled":inr(all.bal))+'</b></div><div><span class="label">Group total</span><b class="num">'+inr(all.total)+'</b></div></div>';
  h+='</section>';

  if(S.members.length<2) h+='<div class="card empty"><b>Add your friends</b>Add each friend\'s name, then share the link and group password.<div style="margin-top:14px"><button class="btn" data-act="goGroup" type="button">Add friends</button></div></div>';

  h+='<section class="stack" style="gap:10px"><div class="row"><h2>Trips</h2><button class="btn small" data-act="newTrip" type="button">+ New trip</button></div>';
  if(!S.trips.length) h+='<div class="card empty"><b>No trips yet</b>Create a trip, pick who\'s going, then add expenses, polls and chat to it.</div>';
  S.trips.forEach(t=>{
    const s=ts[t.id], going=tripMemberIds(t), range=fmtRange(t), meIn=going.includes(meId), nd=disputedIn(t.id);
    h+='<div class="card tripcard'+(t.id===tripId?' current':'')+'"><button class="tripopen" data-act="openTrip" data-id="'+esc(t.id)+'" type="button">';
    h+='<div class="row" style="align-items:flex-start"><div style="min-width:0"><div class="tripname">'+esc(t.name)+'</div><div class="s">'+(range?esc(range)+' · ':'')+going.length+' going · '+s.count+' expense'+(s.count===1?'':'s')+'</div>'+(nd?'<span class="pill bad" style="display:inline-block;margin-top:4px">'+nd+' disputed</span>':'')+'</div><div style="text-align:right"><div class="amt num">'+inr(s.total)+'</div><div class="s">total</div></div></div>';
    if(meIn) h+='<div class="row" style="margin-top:8px;flex-wrap:wrap"><span class="s num">You spent '+inr(s.share[meId]||0)+' · paid '+inr(s.paid[meId]||0)+'</span>'+myPill(s.bal[meId]||0)+'</div>';
    h+='</button><div class="foot"><span class="hint">'+(t.id===tripId?'Current trip':'Tap to open')+'</span><button class="btn link" data-act="editTrip" data-id="'+esc(t.id)+'" type="button">Edit trip</button></div></div>';
  });
  h+='</section>';

  if(S.trips.length&&all.total>0){
    const rows=S.members.map(m=>({m,share:(per[m.id]||{}).share||0,paid:(per[m.id]||{}).paid||0})).sort((a,b)=>b.share-a.share);
    const max=Math.max(1,...rows.map(r=>r.share));
    h+='<section class="card stack" style="gap:12px"><div class="row"><h2>Who spent what</h2><span class="hint">all trips</span></div><div class="list">';
    rows.forEach(r=>{
      h+='<div class="item" style="align-items:center"><div class="avatar'+(r.m.id===meId?' me-av':'')+'">'+esc(initials(r.m.name))+'</div><div class="main"><div class="row"><span class="t">'+esc(r.m.name)+(r.m.id===meId?' <span class="hint">(you)</span>':'')+'</span><span class="amt num">'+inr(r.share)+'</span></div><div class="track"><i style="width:'+Math.round(r.share/max*100)+'%"></i></div><div class="s num" style="margin-top:4px">Paid '+inr(r.paid)+'</div></div></div>';
    });
    h+='</div><div class="hint">“Spent” is each person\'s share of the bills. “Paid” is what they paid upfront.</div></section>';
  }
  return h;
}

function viewMoney(){
  const t=trip(); if(!t) return noTrip();
  const s=stats(t.id), st=settlements(s.bal), mem=membersOf(t), meIn=tripMemberIds(t).includes(meId);
  let h='<section class="card hero stack" style="gap:10px"><span class="label">Trip total</span><div class="big num">'+inr(s.total)+'</div>';
  if(meIn){
    const b=s.bal[meId]||0;
    h+='<div class="stats"><div><span class="label">You spent</span><b class="num">'+inr(s.share[meId]||0)+'</b></div><div><span class="label">You paid</span><b class="num">'+inr(s.paid[meId]||0)+'</b></div><div><span class="label">'+(b>0?"Owed to you":b<0?"You owe":"Balance")+'</span><b class="num">'+(b===0?"Settled":inr(b))+'</b></div></div>';
  }else{
    h+='<div class="stats"><div><span class="label">Expenses</span><b class="num">'+s.count+'</b></div><div><span class="label">People</span><b class="num">'+mem.length+'</b></div><div><span class="label">Per person</span><b class="num">'+inr(mem.length?Math.round(s.total/mem.length):0)+'</b></div></div>';
  }
  h+='</section>';

  h+='<section class="card stack" style="gap:12px"><div class="row"><h2>Settle up</h2><span class="hint">fewest payments</span></div>';
  const nd=disputedIn(t.id);
  if(nd) h+='<div class="dispute"><span class="who">'+nd+' expense'+(nd>1?'s are':' is')+' disputed</span><span>These amounts may change. Sort out the dispute'+(nd>1?'s':'')+' before anyone pays.</span></div>';
  if(!st.length) h+='<div class="hint">Everyone is even. Nothing to pay.</div>';
  else{
    h+='<div class="list">';
    st.forEach(x=>{
      h+='<div class="item"><div class="main settle"><b>'+esc(x.from===meId?"You":nameOf(x.from))+'</b><span class="arrow">pays</span><b>'+esc(x.to===meId?"you":nameOf(x.to))+'</b></div><div class="amt num '+(x.from===meId?"neg":x.to===meId?"pos":"")+'">'+inr(x.v)+'</div></div>';
    });
    h+='</div><div class="hint">After paying someone back, add it as an expense: paid by the payer, split with only the person they paid.</div>';
  }
  h+='</section>';

  h+='<section class="card stack" style="gap:12px"><div class="row"><h2>Who spent what</h2><span class="hint">this trip</span></div><div class="list">';
  mem.slice().sort((a,b)=>(s.share[b.id]||0)-(s.share[a.id]||0)).forEach(m=>{
    const v=s.bal[m.id]||0;
    h+='<div class="item" style="align-items:center"><div class="avatar'+(m.id===meId?' me-av':'')+'">'+esc(initials(m.name))+'</div><div class="main"><div class="t">'+esc(m.name)+(m.id===meId?' <span class="hint">(you)</span>':'')+'</div><div class="s num">Spent '+inr(s.share[m.id]||0)+' · Paid '+inr(s.paid[m.id]||0)+'</div></div><div class="amt num '+(v>0?"pos":v<0?"neg":"")+'">'+(v>0?"+":v<0?"−":"")+inr(v)+'</div></div>';
  });
  h+='</div><div class="hint">Green gets money back, red owes money.</div></section>';

  const list=expOf(t.id);
  h+='<section class="card stack" style="gap:12px"><div class="row"><h2>Expenses</h2>'+(list.length?'<a class="btn small ghost" href="/api/trips/'+encodeURIComponent(t.id)+'/export.csv" download>Download CSV</a>':'')+'</div>';
  if(!list.length) h+='<div class="empty"><b>No expenses yet</b>Tap “Add expense” to log the first bill for this trip.</div>';
  else{
    h+='<div class="list">';
    list.forEach(e=>{
      const sh=shares(e), my=sh[meId]||0, mine=e.addedBy===meId, ds=openDisp(e);
      const myD=ds.find(d=>d.memberId===meId);
      h+='<div class="item"><div class="main"><div class="t">'+esc(e.desc)+'</div><div class="s">'+esc(e.paidBy===meId?"You":nameOf(e.paidBy))+' paid · split '+(e.split||[]).length+' ways · '+esc(fmtDate(e.date))+(my?' · your share '+inr(my):'')+'</div><div class="s">Added by '+esc(mine?"you":nameOf(e.addedBy))+'</div>';
      ds.forEach(d=>{
        h+='<div class="dispute"><span class="who">'+esc(d.memberId===meId?"You":nameOf(d.memberId))+' disputed this</span><span>'+esc(d.reason)+'</span>'+(mine?'<button class="btn link" data-act="resolveDisp" data-id="'+esc(d.id)+'" type="button">Mark resolved</button>':'')+'</div>';
      });
      h+='<div class="acts">';
      if(mine) h+='<button class="btn link danger" data-act="delExp" data-id="'+esc(e.id)+'" type="button">'+(pendingDel===e.id?"Tap again to delete":"Delete")+'</button>';
      else if(myD) h+='<button class="btn link" data-act="withdrawDisp" data-id="'+esc(e.id)+'" type="button">Withdraw my dispute</button>';
      else h+='<button class="btn link danger" data-act="raiseDisp" data-id="'+esc(e.id)+'" type="button">Raise dispute</button>';
      h+='</div>';
      h+='</div><div style="text-align:right"><div class="amt num">'+inr(e.paise)+'</div>'+(ds.length?'<span class="pill bad" style="display:inline-block;margin-top:4px">Disputed</span>':'')+'</div></div>';
    });
    h+='</div>';
  }
  h+='</section>';
  return h;
}

function viewPolls(){
  const t=trip(); if(!t) return noTrip();
  const mem=membersOf(t), polls=S.polls.filter(p=>p.tripId===t.id);
  if(!polls.length) return '<div class="card empty"><b>No polls for this trip yet</b>Ask the group something: where to stay, which day to leave, where to eat.</div>';
  let h='';
  polls.forEach(p=>{
    const votes=S.votes.filter(v=>v.pollId===p.id && mem.some(m=>m.id===v.memberId));
    const counts=(p.options||[]).map((_,i)=>votes.filter(v=>v.option===i));
    const max=Math.max(0,...counts.map(c=>c.length));
    const myVote=votes.find(v=>v.memberId===meId);
    const pending=mem.filter(m=>!votes.some(v=>v.memberId===m.id));
    const canVote=mem.some(m=>m.id===meId);
    h+='<section class="card"><div class="row" style="align-items:flex-start"><h2>'+esc(p.question)+'</h2><span class="pill '+(p.closed?"":"open")+'">'+(p.closed?"Closed":"Open")+'</span></div>';
    h+='<div class="hint" style="margin-top:4px">'+votes.length+' of '+mem.length+' voted'+(p.createdBy?' · asked by '+esc(p.createdBy===meId?"you":nameOf(p.createdBy)):'')+'</div>';
    h+='<div class="opts">';
    (p.options||[]).forEach((o,i)=>{
      const c=counts[i].length, pct=votes.length?Math.round(c/votes.length*100):0;
      const dis=p.closed||!canVote;
      h+='<button class="opt'+(myVote&&myVote.option===i?" mine":"")+(c&&c===max?" win":"")+'" data-act="vote" data-poll="'+esc(p.id)+'" data-i="'+i+'" type="button"'+(dis?" disabled":"")+'><span class="fill" style="width:'+pct+'%"></span><span><span class="tx">'+esc(o)+'</span>'+(c?'<div class="voters">'+counts[i].map(v=>esc(v.memberId===meId?"You":nameOf(v.memberId))).join(", ")+'</div>':'')+'</span><span class="num" style="font-weight:700">'+c+'</span></button>';
    });
    h+='</div>';
    const foot=[];
    if(!canVote) foot.push('<span class="hint">You\'re not on this trip, so you can\'t vote.</span>');
    else if(!p.closed) foot.push('<span class="hint">'+(myVote?"Tap your choice again to remove your vote.":"Tap an option to vote.")+'</span>');
    if(!p.closed&&pending.length&&pending.length<mem.length) foot.push('<span class="hint">Waiting on '+pending.map(m=>esc(m.name)).join(", ")+'</span>');
    h+='<div class="row" style="margin-top:12px;flex-wrap:wrap"><div class="stack" style="gap:2px">'+foot.join("")+'</div>';
    h+='<div class="inline" style="flex:none">'+(p.closed?'<button class="btn link" data-act="reopen" data-id="'+esc(p.id)+'" type="button">Reopen</button>':'<button class="btn small ghost" data-act="close" data-id="'+esc(p.id)+'" type="button">Close poll</button>')+'<button class="btn link danger" data-act="delPoll" data-id="'+esc(p.id)+'" type="button">'+(pendingDel===p.id?"Tap again":"Delete")+'</button></div>';
    h+='</div></section>';
  });
  return h;
}

function viewChat(){
  if(!trip()) return noTrip();
  if(!S.messages.length) return '<div class="card empty"><b>No messages yet</b>Say hi to everyone on this trip.</div>';
  let h='<div class="chat">', lastDay="", lastWho="";
  S.messages.forEach(m=>{
    const d=new Date(m.at||0), day=d.toDateString();
    if(day!==lastDay){h+='<span class="pill day">'+esc(d.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"}))+'</span>';lastDay=day;lastWho=""}
    const out=m.memberId===meId;
    h+='<div class="msg'+(out?" out":"")+'">'+(!out&&m.memberId!==lastWho?'<span class="who">'+esc(nameOf(m.memberId))+'</span>':'')+'<div class="bubble">'+esc(m.text)+'</div><span class="time">'+esc(d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}))+'</span></div>';
    lastWho=m.memberId;
  });
  return h+'</div>';
}

function viewGroup(){
  let h='<section class="card stack" style="gap:12px"><h2>Your friends</h2>';
  h+='<form class="stack" id="addMember" style="gap:8px"><input type="text" id="memberName" placeholder="Friend\'s name" maxlength="40" autocomplete="off" aria-label="Friend\'s name"><button class="btn" type="submit">Add</button></form>';
  h+='<div class="list">';
  S.members.forEach(m=>{
    h+='<div class="item" style="align-items:center"><div class="avatar'+(m.id===meId?' me-av':'')+'">'+esc(initials(m.name))+'</div><div class="main"><div class="t">'+esc(m.name)+(m.id===meId?' <span class="hint">(you)</span>':'')+'</div></div>'+(m.id===meId?'':'<button class="btn link danger" data-act="delMember" data-id="'+esc(m.id)+'" type="button">'+(pendingDel===m.id?"Tap again":"Remove")+'</button>')+'</div>';
  });
  h+='</div><div class="hint">New friends aren\'t added to existing trips automatically. Use “Edit trip” on the Dashboard to add them.</div></section>';
  h+='<section class="card stack" style="gap:8px"><h2>Inviting friends</h2><div class="hint" style="font-size:.9rem">Add a friend\'s name here, then send them this app\'s link and the group password. They type the password and tap their name. Only the people on this list can sign in. Only the person who adds an expense can delete it; everyone else can raise a dispute.</div><div class="row"><span class="s" id="appUrl" style="overflow-wrap:anywhere">'+esc(location.origin)+'</span><button class="btn small ghost" data-act="copyLink" type="button">Copy link</button></div></section>';
  return h;
}

let pendingDel=null, lastMsgCount=0;
function render(){
  document.querySelectorAll(".tabbar button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab?"true":"false"));
  $("#meBtn").textContent=hasMe()?nameOf(meId):"";
  const scoped=tab==="money"||tab==="polls"||tab==="chat";
  let v=state!=="ready"?"":tab==="home"?viewHome():tab==="money"?viewMoney():tab==="polls"?viewPolls():tab==="chat"?viewChat():viewGroup();
  if(state==="ready"&&scoped&&trip()) v=tripBar()+v;
  const keep={};["memberName","memberEmail"].forEach(id=>{const el=$("#"+id);if(el)keep[id]=el.value});
  const focusId=document.activeElement&&document.activeElement.id;
  $("#view").innerHTML='<div class="stack">'+banner()+v+'</div>';
  for(const id in keep){const el=$("#"+id);if(el)el.value=keep[id]}
  if(focusId&&keep[focusId]!==undefined&&$("#"+focusId))$("#"+focusId).focus();
  const ready=state==="ready"&&!!trip();
  $("#composer").hidden=!(tab==="chat"&&ready);
  const fab=$("#fab");
  fab.hidden=!(ready&&(tab==="money"||tab==="polls"));
  fab.textContent=tab==="money"?"+ Add expense":"+ New poll";
  if(tab==="chat"&&S.messages.length!==lastMsgCount){lastMsgCount=S.messages.length;window.scrollTo(0,document.body.scrollHeight)}
}

/* ---------- sheets ---------- */
function closeSheet(){$("#sheetRoot").innerHTML=""}
function openSheet(html,onSubmit){
  $("#sheetRoot").innerHTML='<div class="scrim" id="scrim"><form class="sheet" id="sheetForm" role="dialog" aria-modal="true">'+html+'</form></div>';
  $("#scrim").addEventListener("click",e=>{if(e.target.id==="scrim")closeSheet()});
  $("#sheetForm").addEventListener("submit",async e=>{e.preventDefault();const btn=e.target.querySelector("[type=submit]");btn.disabled=true;const ok=await onSubmit(e.target);btn.disabled=false;if(ok)closeSheet()});
  const c=$("#cancel"); if(c) c.onclick=closeSheet;
  const f=$("#sheetForm input[type=text]"); if(f) f.focus();
}
function plainSheet(html){
  $("#sheetRoot").innerHTML='<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">'+html+'</div></div>';
  $("#scrim").addEventListener("click",e=>{if(e.target.id==="scrim")closeSheet()});
  const c=$("#cancel"); if(c) c.onclick=closeSheet;
}
const memberChips=(name,ids)=>S.members.map(m=>'<label class="chip"><input type="checkbox" name="'+name+'" value="'+esc(m.id)+'"'+(ids.includes(m.id)?" checked":"")+'>'+esc(m.name)+'</label>').join("");

function tripSheet(t){
  const ids=t?tripMemberIds(t):S.members.map(m=>m.id);
  openSheet(
    '<div class="row"><h2>'+(t?"Edit trip":"New trip")+'</h2><button class="btn link" type="button" id="cancel">Cancel</button></div>'+
    '<div class="field"><label class="label" for="tr-name">Trip name</label><input type="text" id="tr-name" placeholder="Goa, December" maxlength="50" required value="'+esc(t?t.name:"")+'"></div>'+
    '<div class="inline"><div class="field"><label class="label" for="tr-start">Starts</label><input type="date" id="tr-start" value="'+esc(t&&t.start||"")+'"></div><div class="field"><label class="label" for="tr-end">Ends</label><input type="date" id="tr-end" value="'+esc(t&&t.end||"")+'"></div></div>'+
    '<div class="field"><span class="label">Who\'s going</span><div class="chips">'+memberChips("going",ids)+'</div></div>'+
    '<button class="btn" type="submit">'+(t?"Save trip":"Create trip")+'</button>'+
    (t?'<button class="btn link danger" type="button" id="delTrip" style="align-self:center">Delete trip</button>':''),
    async f=>{
      const name=f.querySelector("#tr-name").value.trim(), start=f.querySelector("#tr-start").value||"", end=f.querySelector("#tr-end").value||"";
      const members=[...f.querySelectorAll("input[name=going]:checked")].map(x=>x.value);
      if(!name){toast("Give the trip a name.");return false}
      if(!members.length){toast("Pick at least one person who's going.");return false}
      if(start&&end&&end<start){toast("The end date is before the start date.");return false}
      if(t) return write(()=>api("PUT","/api/trips/"+t.id,{name,start,end,members}),"Trip saved");
      let newId=null;
      const ok=await write(async()=>{newId=(await api("POST","/api/trips",{name,start,end,members})).id},name+" created");
      if(ok&&newId){setTrip(newId);setTab("money")}
      return ok;
    });
  if(t){
    let armed=false;
    $("#delTrip").onclick=async e=>{
      if(expOf(t.id).length){toast("Delete this trip's expenses first, then delete the trip.");return}
      if(!armed){armed=true;e.target.textContent="Tap again to delete this trip";return}
      e.target.disabled=true;
      const ok=await write(()=>api("DELETE","/api/trips/"+t.id),"Trip deleted");
      if(ok)closeSheet(); else e.target.disabled=false;
    };
  }
}
function pickTripSheet(){
  plainSheet('<div class="row"><h2>Switch trip</h2><button class="btn link" type="button" id="cancel">Close</button></div><div class="list">'+
    S.trips.map(t=>{const s=stats(t.id),r=fmtRange(t);return '<div class="item" style="align-items:center"><div class="main"><div class="t">'+esc(t.name)+'</div><div class="s num">'+(r?esc(r)+' · ':'')+inr(s.total)+'</div></div><button class="btn small '+(t.id===tripId?'accent':'ghost')+'" data-act="openTrip" data-id="'+esc(t.id)+'" type="button">'+(t.id===tripId?'Open now':'Open')+'</button></div>'}).join("")+
    '</div><button class="btn" data-act="newTrip" type="button">+ New trip</button>');
}
function expenseSheet(){
  const t=trip(), mem=membersOf(t);
  if(!mem.some(m=>m.id===meId)){toast("You're not on this trip. Add yourself with “Edit trip” first.");return}
  const opts=mem.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===meId?" selected":"")+'>'+esc(m.name)+'</option>').join("");
  const chips=mem.map(m=>'<label class="chip"><input type="checkbox" name="split" value="'+esc(m.id)+'" checked>'+esc(m.name)+'</label>').join("");
  openSheet(
    '<div class="row"><h2>Add expense</h2><button class="btn link" type="button" id="cancel">Cancel</button></div>'+
    '<div class="hint">For '+esc(t.name)+'</div>'+
    '<div class="field"><label class="label" for="e-desc">What for</label><div class="ac"><input type="text" id="e-desc" placeholder="Start typing, e.g. Din…" maxlength="60" required autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acList"><div class="ac-list" id="acList" role="listbox" hidden></div></div></div>'+
    '<div class="inline"><div class="field"><label class="label" for="e-amt">Amount (₹)</label><input type="number" id="e-amt" inputmode="decimal" min="0.01" step="0.01" placeholder="2400" required></div>'+
    '<div class="field"><label class="label" for="e-date">Date</label><input type="date" id="e-date" value="'+today()+'"></div></div>'+
    '<div class="field"><label class="label" for="e-paid">Paid by</label><select id="e-paid">'+opts+'</select></div>'+
    '<div class="field"><div class="row"><span class="label">Split equally between</span><button class="btn link" type="button" id="toggleAll">None</button></div><div class="chips">'+chips+'</div></div>'+
    '<button class="btn" type="submit">Save expense</button>',
    async f=>{
      const desc=f.querySelector("#e-desc").value.trim(), paise=Math.round(parseFloat(f.querySelector("#e-amt").value)*100);
      const split=[...f.querySelectorAll("input[name=split]:checked")].map(x=>x.value);
      if(!desc||!(paise>0)){toast("Enter what it was for and an amount above ₹0.");return false}
      if(!split.length){toast("Pick at least one person to split with.");return false}
      return write(()=>api("POST","/api/expenses",{tripId:t.id,desc,paise,paidBy:f.querySelector("#e-paid").value,split,date:f.querySelector("#e-date").value||today()}),"Expense added");
    });
  setupWhatFor();
  $("#toggleAll").onclick=e=>{const boxes=[...document.querySelectorAll("input[name=split]")];const any=boxes.some(b=>b.checked);boxes.forEach(b=>b.checked=!any);e.target.textContent=any?"All":"None"};
}
const WHAT_FOR=["Breakfast","Lunch","Dinner","Snacks","Tea & coffee","Drinks","Cig","Hotel","Homestay","Fuel","Cab","Auto","Train","Bus","Flight","Tolls & parking","Bike rental","Car rental","Entry tickets","Activities","Groceries","Water","Shopping","Medicines","Tips"];
function setupWhatFor(){
  const inp=$("#e-desc"), list=$("#acList");
  // predefined first, then anything the group has typed before
  const past=[...new Set(S.expenses.map(e=>String(e.desc||"").trim()).filter(Boolean))].filter(d=>!WHAT_FOR.some(w=>w.toLowerCase()===d.toLowerCase()));
  const pool=WHAT_FOR.concat(past);
  let items=[], hi=-1;
  function close(){list.hidden=true;inp.setAttribute("aria-expanded","false");hi=-1}
  function pick(v){inp.value=v;close();$("#e-amt").focus()}
  function paint(){
    list.innerHTML=items.map((it,i)=>'<button type="button" role="option" class="'+(i===hi?"hi ":"")+(it.custom?"custom":"")+'" data-i="'+i+'" aria-selected="'+(i===hi)+'">'+(it.custom?'Use “<b>'+esc(it.v)+'</b>”':esc(it.v))+'</button>').join("");
  }
  function update(){
    const q=inp.value.trim().toLowerCase();
    if(!q){close();return}
    const starts=pool.filter(p=>p.toLowerCase().startsWith(q)), has=pool.filter(p=>!p.toLowerCase().startsWith(q)&&p.toLowerCase().includes(q));
    items=starts.concat(has).slice(0,8).map(v=>({v}));
    if(!pool.some(p=>p.toLowerCase()===q)) items.push({v:inp.value.trim(),custom:true});
    hi=items.length&&!items[0].custom?0:items.length-1;
    paint(); list.hidden=false; inp.setAttribute("aria-expanded","true");
  }
  inp.addEventListener("input",update);
  inp.addEventListener("keydown",e=>{
    if(list.hidden)return;
    if(e.key==="ArrowDown"){e.preventDefault();hi=Math.min(items.length-1,hi+1);paint()}
    else if(e.key==="ArrowUp"){e.preventDefault();hi=Math.max(0,hi-1);paint()}
    else if(e.key==="Enter"){e.preventDefault();if(items[hi])pick(items[hi].v)}
    else if(e.key==="Escape"){e.stopPropagation();close()}
  });
  list.addEventListener("pointerdown",e=>e.preventDefault());
  list.addEventListener("click",e=>{const b=e.target.closest("button[data-i]");if(b)pick(items[+b.dataset.i].v)});
  inp.addEventListener("blur",()=>setTimeout(close,120));
}
function pollSheet(){
  const t=trip();
  const optField=i=>'<input type="text" name="opt" placeholder="Option '+(i+1)+'" maxlength="60" aria-label="Option '+(i+1)+'">';
  openSheet(
    '<div class="row"><h2>New poll</h2><button class="btn link" type="button" id="cancel">Cancel</button></div>'+
    '<div class="hint">For '+esc(t.name)+'</div>'+
    '<div class="field"><label class="label" for="p-q">Question</label><input type="text" id="p-q" placeholder="Which beach on day 2?" maxlength="100" required></div>'+
    '<div class="field"><span class="label">Options</span><div class="stack" id="optList" style="gap:8px">'+[0,1,2].map(optField).join("")+'</div><button class="btn link" type="button" id="addOpt" style="align-self:flex-start">+ Add option</button></div>'+
    '<button class="btn" type="submit">Create poll</button>',
    async f=>{
      const question=f.querySelector("#p-q").value.trim();
      const options=[...f.querySelectorAll("input[name=opt]")].map(x=>x.value.trim()).filter(Boolean);
      if(!question){toast("Type a question.");return false}
      if(options.length<2){toast("Add at least two options.");return false}
      return write(()=>api("POST","/api/polls",{tripId:t.id,question,options}),"Poll created");
    });
  $("#addOpt").onclick=()=>{const l=$("#optList");const n=l.children.length;if(n>=8){toast("Polls can have up to 8 options.");return}l.insertAdjacentHTML("beforeend",optField(n));l.lastElementChild.focus()};
}
function meSheet(){
  plainSheet('<div class="row"><h2>'+esc(nameOf(meId))+'</h2><button class="btn link" type="button" id="cancel">Close</button></div><div class="hint" style="font-size:.9rem">Only you can delete the expenses you add.</div><button class="btn ghost" type="button" id="signOut">Sign out</button>');
  $("#signOut").onclick=async()=>{try{await api("POST","/api/logout")}catch(e){}location.reload()};
}
function disputeSheet(e){
  const quick=["Wrong amount","I wasn't part of this","Wrong person paid","Duplicate entry"];
  openSheet(
    '<div class="row"><h2>Raise a dispute</h2><button class="btn link" type="button" id="cancel">Cancel</button></div>'+
    '<div class="summary"><div class="row"><span class="t">'+esc(e.desc)+'</span><span class="amt num">'+inr(e.paise)+'</span></div><div class="s">'+esc(nameOf(e.paidBy))+' paid · split '+(e.split||[]).length+' ways · added by '+esc(nameOf(e.addedBy))+'</div></div>'+
    '<div class="field"><label class="label" for="d-reason">What\'s wrong?</label><div class="quick">'+quick.map(q=>'<button type="button" data-q="'+esc(q)+'">'+esc(q)+'</button>').join("")+'</div><textarea id="d-reason" maxlength="200" placeholder="e.g. The bill was ₹1,800, not ₹2,400" required></textarea></div>'+
    '<div class="hint">Everyone on the trip will see this. Only '+esc(nameOf(e.addedBy))+' can fix or delete the expense.</div>'+
    '<button class="btn" type="submit">Raise dispute</button>',
    async f=>{
      const reason=f.querySelector("#d-reason").value.trim();
      if(!reason){toast("Say what's wrong with this expense.");return false}
      return write(()=>api("PUT","/api/expenses/"+e.id+"/dispute",{reason}),"Dispute raised");
    });
  document.querySelectorAll(".quick button").forEach(b=>b.onclick=()=>{const ta=$("#d-reason");ta.value=b.dataset.q+(ta.value?". "+ta.value:"");ta.focus()});
  const ta=$("#d-reason"); if(ta) ta.focus();
}

/* ---------- actions ---------- */
function armDelete(id){if(pendingDel===id){pendingDel=null;return true}pendingDel=id;render();clearTimeout(armDelete.t);armDelete.t=setTimeout(()=>{pendingDel=null;render()},3000);return false}
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-act]"); if(!t)return;
  const a=t.dataset.act, id=t.dataset.id;
  if(a==="goGroup"){setTab("group")}
  else if(a==="copyLink"){
    try{await navigator.clipboard.writeText(location.origin);toast("Link copied")}
    catch(err){const s=document.createRange();s.selectNodeContents($("#appUrl"));const sel=getSelection();sel.removeAllRanges();sel.addRange(s);toast("Link selected. Copy it from here.")}
  }
  else if(a==="raiseDisp"){const ex=S.expenses.find(x=>x.id===id);if(ex)disputeSheet(ex)}
  else if(a==="withdrawDisp"){await write(()=>api("DELETE","/api/expenses/"+id+"/dispute"),"Dispute withdrawn")}
  else if(a==="resolveDisp"){await write(()=>api("POST","/api/disputes/"+id+"/resolve"),"Marked resolved")}
  else if(a==="newTrip"){closeSheet();tripSheet(null)}
  else if(a==="editTrip"){const tr=S.trips.find(x=>x.id===id);if(tr)tripSheet(tr)}
  else if(a==="pickTrip"){pickTripSheet()}
  else if(a==="openTrip"){closeSheet();setTrip(id);if(tab==="home")setTab("money");else render()}
  else if(a==="delExp"){if(armDelete(id))await write(()=>api("DELETE","/api/expenses/"+id),"Expense deleted")}
  else if(a==="delMember"){
    if(S.expenses.some(x=>x.paidBy===id||x.addedBy===id||(x.split||[]).includes(id))){toast(nameOf(id)+" is part of an expense, so they can't be removed.");return}
    if(armDelete(id))await write(()=>api("DELETE","/api/members/"+id),"Removed");
  }
  else if(a==="vote"){
    const pid=t.dataset.poll, i=+t.dataset.i;
    const cur=S.votes.find(v=>v.pollId===pid&&v.memberId===meId);
    if(cur&&cur.option===i) await write(()=>api("DELETE","/api/polls/"+pid+"/vote"));
    else await write(()=>api("PUT","/api/polls/"+pid+"/vote",{option:i}));
  }
  else if(a==="close") await write(()=>api("POST","/api/polls/"+id+"/close"),"Poll closed");
  else if(a==="reopen") await write(()=>api("POST","/api/polls/"+id+"/reopen"),"Poll reopened");
  else if(a==="delPoll"){if(armDelete(id))await write(()=>api("DELETE","/api/polls/"+id),"Poll deleted")}
});
document.addEventListener("submit",async e=>{
  if(e.target.id!=="addMember")return; e.preventDefault();
  const name=$("#memberName").value.trim();
  if(!name){toast("Enter your friend's name.");return}
  const ok=await write(()=>api("POST","/api/members",{name}),name+" added");
  if(ok){$("#memberName").value="";$("#memberEmail").value="";$("#memberName").focus()}
});
$("#composer").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$("#msgInput"), text=inp.value.trim(); if(!text||!tripId)return;
  const btn=$("#sendBtn"); btn.disabled=true;
  const ok=await write(()=>api("POST","/api/messages",{tripId,text}));
  btn.disabled=false; if(ok){inp.value="";inp.focus()}
});
function setTab(t){tab=t;ls.set("ts-tab",t);pendingDel=null;lastMsgCount=-1;render();if(t!=="chat")window.scrollTo(0,0)}
document.querySelectorAll(".tabbar button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$("#meBtn").onclick=meSheet;
$("#fab").onclick=()=>tab==="money"?expenseSheet():pollSheet();
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});

/* ---------- data sync ---------- */
function setTrip(id){
  if(tripId===id)return;
  tripId=id; if(id)ls.set("ts-trip",id);
  S.messages=[]; lastMsgCount=-1; loadMessages(); render();
}
async function loadMessages(){
  if(!tripId)return;
  const forTrip=tripId;
  try{const d=await api("GET","/api/messages?trip="+encodeURIComponent(forTrip));if(forTrip===tripId){S.messages=d.messages;render()}}catch(e){}
}
async function refresh(){
  const d=await api("GET","/api/state");
  version=d.version; meId=d.me;
  S.members=d.members;S.trips=d.trips;S.expenses=d.expenses;S.disputes=d.disputes;S.polls=d.polls;S.votes=d.votes;
  if(!S.trips.some(t=>t.id===tripId)){tripId=S.trips[0]?S.trips[0].id:null;if(tripId)ls.set("ts-trip",tripId);S.messages=[]}
  state="ready";
  await loadMessages();
  render();
}
let polling=false;
async function poll(){
  if(polling||document.visibilityState!=="visible")return;
  polling=true;
  try{
    const d=await api("GET","/api/version");
    $("#offline").hidden=true;
    if(d.version!==version) await refresh();
  }catch(e){
    if(e.status===0)$("#offline").hidden=false;
    else if(e.status===401)location.reload();
  }finally{polling=false}
}
setInterval(poll,4000);
document.addEventListener("visibilitychange",poll);
window.addEventListener("online",poll);

/* ---------- first screen ---------- */
function gate(html){
  $("#tabbar").hidden=true;$("#meBtn").hidden=true;$("#fab").hidden=true;$("#composer").hidden=true;
  $("#view").innerHTML='<div class="gate">'+html+'</div>';
}
function loginGate(){
  gate('<form class="card" id="loginForm"><h2>Trip Split</h2><div class="hint">Enter the group password your organizer shared.</div><input type="password" id="loginPw" placeholder="Password" required autocomplete="current-password"><button class="btn" type="submit">Continue</button></form>');
  $("#loginPw").focus();
  $("#loginForm").onsubmit=async e=>{
    e.preventDefault();const password=$("#loginPw").value;if(!password)return;
    let d;try{d=await api("POST","/api/login",{password})}catch(x){toast(x.message);return}
    if(d.ok){location.reload();return}
    if(d.needName){
      gate('<form class="card" id="joinForm"><h2>Welcome to Trip Split</h2><div class="hint">You\'re the organizer. What should your friends call you?</div><input type="text" id="joinName" placeholder="Your name" maxlength="40" required autocomplete="name"><button class="btn" type="submit">Get started</button></form>');
      $("#joinForm").onsubmit=async e=>{
        e.preventDefault();const name=$("#joinName").value.trim();if(!name)return;
        try{await api("POST","/api/login",{password,name});location.reload()}catch(x){toast(x.message)}
      };
      return;
    }
    if(!d.members.length){gate('<div class="card"><h2>No friends added yet</h2><div class="hint">Ask the organizer to add your name on the Friends tab, then try again.</div><button class="btn" type="button" onclick="location.reload()">Try again</button></div>');return}
    gate('<div class="card"><h2>Who are you?</h2><div class="hint">Tap your name.</div>'+d.members.map(m=>'<button class="btn ghost" type="button" data-id="'+esc(m.id)+'">'+esc(m.name)+'</button>').join("")+'<div class="hint">Not on the list? Ask the organizer to add you.</div></div>');
    document.querySelectorAll(".gate [data-id]").forEach(btn=>btn.onclick=async()=>{
      try{await api("POST","/api/login",{password,memberId:btn.dataset.id});location.reload()}catch(x){toast(x.message)}
    });
  };
}
async function boot(){
  render();
  try{await api("GET","/api/me")}
  catch(e){
    if(e.status===401){loginGate();return}
    gate('<div class="card"><h2>Can\'t reach Trip Split</h2><div class="hint">'+esc(e.message)+'</div><button class="btn" type="button" onclick="location.reload()">Try again</button></div>');return;
  }
  $("#tabbar").hidden=false;$("#meBtn").hidden=false;
  try{await refresh()}catch(e){state="error";render();toast(e.message)}
}
boot();

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}))}
})();
