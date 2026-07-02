const snippets = {
  "page-state-lite": pageStateLiteScript,
  "assignment-description": assignmentDescriptionScript,
  "assignment-review-summary": assignmentReviewSummaryScript,
  "student-detail-summary": studentDetailSummaryScript,
  "roster-page": rosterPageScript,
};

function pageStateLiteScript() {
  return "(()=>{const docs=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean));const t=docs.map(d=>d.body?.innerText||'').join('\\n');return {url:location.href,title:document.title||'',readyState:document.readyState,hints:{login:/\\u767b\\u5f55|cas\\/login|password|captcha/i.test(t+location.href),portal:/\\u4fe1\\u606f\\u95e8\\u6237|portal/i.test(t),personalSpace:/\\u4e2a\\u4eba\\u7a7a\\u95f4/.test(t),course:/\\u8bfe\\u7a0b/.test(t),assignment:/\\u4f5c\\u4e1a/.test(t),review:/\\u6279\\u9605/.test(t)}}})()";
}

function assignmentDescriptionScript() {
  return "(()=>{const C=v=>String(v||'').replace(/\\s+/g,' ').trim(),D=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean));const B=D.map((d,i)=>({docIndex:i,headings:[...d.querySelectorAll('h1,h2,h3,.title,[class*=title]')].map(n=>C(n.innerText||n.textContent||'')).filter(Boolean),text:C(d.body?.innerText||''),attachments:[...d.querySelectorAll('a[href],a[data]')].map(a=>({text:C(a.innerText||a.textContent||''),href:a.href||'',data:a.getAttribute('data')||''})).filter(x=>/doc|docx|pdf|ppt|pptx|mp4|mov|zip|rar|7z|\\u9644\\u4ef6|\\u4e0b\\u8f7d|\\u9884\\u89c8/i.test(x.text+' '+x.href+' '+x.data))}));const best=B.sort((a,b)=>b.text.length-a.text.length)[0]||{headings:[],text:'',attachments:[]};const m=best.text.match(/(\\d+)\\s*(\\u5206|points?|score)/i);return {url:location.href,title:best.headings[0]||document.title||'',totalScore:m?Number(m[1]):null,descriptionText:best.text.slice(0,12000),attachments:best.attachments}})()";
}

function assignmentReviewSummaryScript() {
  return "(()=>{const docs=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean));const t=docs.map(d=>d.body?.innerText||'').join('\\n');return {assignment:((t.match(/[^\\n]{0,20}\\u4f5c\\u4e1a[^\\n]{0,60}/)||[''])[0]).slice(0,80),total:(t.match(/\\u5168\\u90e8\\s*(\\d+)\\s*\\u540d\\u5b66\\u751f/)||[])[1]||null,submitted:(t.match(/\\u5df2\\u4ea4\\s*(\\d+)/)||[])[1]||null,unsubmitted:(t.match(/\\u672a\\u4ea4\\s*(\\d+)/)||[])[1]||null,pendingVisible:(t.match(/\\u5f85\\u6279\\u9605/g)||[]).length,completedVisible:(t.match(/\\u5df2\\u5b8c\\u6210|Completed/g)||[]).length}})()";
}

function studentDetailSummaryScript() {
  return "(()=>{const docs=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean));const t=docs.map(d=>d.body?.innerText||'').join('\\n');const els=docs.flatMap(d=>[...d.querySelectorAll('a,img,video,iframe')].map(el=>({tag:el.tagName.toLowerCase(),text:(el.innerText||el.title||el.alt||'').trim(),href:el.href||el.src||''})));const rel=els.filter(x=>/\\u9644\\u4ef6|\\u4e0b\\u8f7d|\\u9884\\u89c8|\\u67e5\\u770b|objectid|att|mp4|mov|pdf|doc|ppt|jpg|png|jpeg|gif/i.test(x.text+' '+x.href));return {url:location.href,title:document.title||'',hasAssignmentText:/\\u4f5c\\u4e1a\\u8981\\u6c42|\\u4f5c\\u4e1a\\u63cf\\u8ff0|\\u4f5c\\u54c1\\u96c6/.test(t),hasAttachment:rel.length>0,hasScoreInput:/\\u6210\\u7ee9|\\u5206\\u6570|\\u8bc4\\u5206/.test(t),attachmentLikeCount:rel.length,tags:[...new Set(rel.map(x=>x.tag))]}})()";
}

function rosterPageScript() {
  return "(()=>{const C=v=>String(v||'').replace(/\\s+/g,' ').trim(),D=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean)),d=D.find(x=>/(\\u59d3\\u540d|\\u5b66\\u53f7|\\u72b6\\u6001|\\u6279\\u9605)/.test(x.body?.innerText||''))||document;const rows=[...d.querySelectorAll('ul.dataBody_td,tr')].filter(r=>/\\d{6,}/.test(r.innerText||'')).map(r=>{const L=[...r.querySelectorAll('a')].map(a=>({text:C(a.innerText),href:a.href||'',data:a.getAttribute('data')||'',className:a.className||''})),U=L.find(a=>/review-work|workAnswerId/i.test(a.href+a.data));return {text:C(r.innerText),cells:[...r.querySelectorAll('li,td,th')].map(c=>C(c.innerText)).filter(Boolean),links:L,reviewUrl:U?(U.data||U.href):''}});const p=d.querySelector('#page'),I=p?[...p.querySelectorAll('li')].map(i=>({text:C(i.innerText),className:i.className||''})):[],N=I.map(i=>Number(i.text)).filter(n=>Number.isFinite(n)&&n>0),A=I.find(i=>/xl-active/.test(i.className)),X=I.find(i=>/xl-nextPage/.test(i.className));return {rows,pagination:{currentPage:Number(A?.text)||1,totalPages:N.length?Math.max(...N):1,hasNext:!!X&&!/xl-disabled/.test(X.className)}}})()";
}

function getSnippet(name) {
  const builder = snippets[name];
  if (!builder) {
    const names = Object.keys(snippets).join(", ");
    throw new Error(`Unknown snippet "${name}". Available snippets: ${names}`);
  }
  return builder();
}

function main(argv) {
  const name = argv[2];
  if (!name) throw new Error(`Usage: browser-eval-snippets.cjs <${Object.keys(snippets).join("|")}>`);
  process.stdout.write(`${getSnippet(name)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  getSnippet,
  pageStateLiteScript,
  assignmentDescriptionScript,
  assignmentReviewSummaryScript,
  studentDetailSummaryScript,
  rosterPageScript,
};
