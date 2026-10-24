/* Reviewed incremental Rakuten import. User data is supplied only through the form. */
(function(){
const undoKey='kakeibo_rakuten_review_undo_v1';let previewSignature='';
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
const merchant=s=>norm(s).replace(/^jcb国内利用jcb/,'').replace(/^jcb国内利用/,'');
const source=t=>['楽天カード','楽天','rakuten'].map(norm).includes(norm(t.source));
function result(){return document.getElementById('rakutenPasteResults');}
function analyze(){
 const text=document.getElementById('rakutenPasteText').value.replace(/^\uFEFF/,'');
 const lines=text.split(/\r?\n/).filter(l=>l.trim());
 const headerIndex=lines.findIndex(line=>{const fields=csvSplit(line);return fields[0]==='利用日'&&fields[1]==='利用店名・商品名';});
 if(headerIndex<0)throw Error('楽天の利用明細CSVを、見出し行を含めて貼り付けてください。');
 const header=csvSplit(lines[headerIndex]);
 const monthBillIndex=header.findIndex(h=>/^\d{1,2}月支払金額$/.test(h));
 const currentBillIndex=header.indexOf('当月請求額');
 if(currentBillIndex<0&&monthBillIndex<0)throw Error('当月請求額または月別の支払金額がある楽天CSVを貼り付けてください。');
 // 当月請求額がある場合は0円もそのまま尊重し、旧形式だけ月別欄を使う。
 const bill=currentBillIndex>=0?currentBillIndex:monthBillIndex,pay=header.indexOf('支払月');
 const headerMonth=header.map(h=>h.match(/^(\d{1,2})月支払金額$/)).find(Boolean);
 const used=new Set(),inFile=new Set();const add=[],updates=[];let skipped=0,outside=0,cancel=false,ambiguous=0;
 for(const line of lines.slice(headerIndex+1)){
  const c=csvSplit(line);if((c[0]||'').includes('キャンセル')){cancel=true;continue;}
  if(cancel||!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(c[0]||''))continue;
  const date=normalizeDate(c[0]);const charged=Number((c[bill]||'').replace(/,/g,''));
  if(!inMonth({date},currentYear,currentMonth)&&!(c[bill]!==''&&charged>0)){outside++;continue;}
  const gross=Number((c[4]||'').replace(/,/g,''));const total=Number((c[header.indexOf('支払総額')]||'').replace(/,/g,''));const amount=Number.isFinite(gross)&&gross>0?gross:total;
  if(!Number.isFinite(amount)||amount<=0||!((c[bill]!==''&&charged>0)||(/^\d{1,2}月以降$/.test(c[pay]||'')&&c[bill]===''))){skipped++;continue;}
  const name=c[1]||'';const key=JSON.stringify([date,norm(name),amount]);
  const seen=inFile.has(key);inFile.add(key);
  const matches=transactions.filter(t=>source(t)&&!t.cashParentId&&t.date===date&&Number(t.amount)===amount&&t.type==='expense');
  const exact=matches.find(t=>merchant(t.name)===merchant(name)&&!used.has(t.id));
  // 同一CSV行でも既存の別IDに対応する請求は照合する。新規の重複追加は防ぐ。
  if(seen&&!exact){skipped++;continue;}
  const explicit=(c[pay]||'').match(/^(\d{1,2})月$/);const month=Number(explicit?.[1]||headerMonth?.[1]);
  let metadata={paymentMonth:'',paymentAmount:null,paymentMonthConfidence:'unresolved'};
  const unresolved=/以降/.test(c[pay]||'');
  if(!unresolved&&charged>0&&Number.isInteger(month)&&month>=1&&month<=12){
   const purchaseYear=Number(date.slice(0,4)),purchaseMonth=Number(date.slice(5,7));
   const year=purchaseYear+(month<purchaseMonth?1:0);
   metadata={paymentMonth:year+'-'+String(month).padStart(2,'0'),paymentAmount:charged,paymentMonthConfidence:'confirmed'};
  }
  const scheduleFor=t=>{const schedule=Array.isArray(t?.paymentSchedule)?t.paymentSchedule.map(p=>({...p})):[];if(t?.paymentMonthConfidence==='confirmed'&&t.paymentMonth&&!schedule.some(p=>p.month===t.paymentMonth))schedule.push({month:t.paymentMonth,amount:t.paymentAmount||t.amount,confidence:'confirmed'});if(metadata.paymentMonthConfidence==='confirmed'){const row={month:metadata.paymentMonth,amount:metadata.paymentAmount,confidence:'confirmed'},index=schedule.findIndex(p=>p.month===row.month);if(index<0)schedule.push(row);else schedule[index]=row;}return schedule.sort((a,b)=>a.month.localeCompare(b.month));};
  if(exact){used.add(exact.id);const after={...exact,...metadata,paymentSchedule:scheduleFor(exact)};if(JSON.stringify(after)!==JSON.stringify(exact))updates.push({id:exact.id,before:JSON.stringify(exact),after});else skipped++;continue;}
  if(matches.length){ambiguous++;continue;}
  const n=norm(name);const investment=/楽天証券|投信積立/.test(name);const charge=/suica|スイカ/.test(n);
  let category=detectCategory(name,'expense');
  if(investment)category='積立';else if(charge)category='交通費';
  else if(/キユウシユウデンリヨク|キュウシュウデンリョク/.test(String(name).normalize('NFKC')))category='電気';
  add.push({...metadata,paymentSchedule:scheduleFor(null),date,name,amount,type:'expense',source:'楽天カード',category,excluded:investment||charge,
    ...(investment||charge?{exclusionReason:investment?'投信積立は資産購入として生活費集計から除外。':'Suicaチャージは資金移動として生活費集計から除外。'}:{})});
 }
 return {add,updates,skipped,outside,ambiguous};
}
function sig(p){return JSON.stringify({rows:p.add,updates:p.updates,skipped:p.skipped,outside:p.outside,ambiguous:p.ambiguous});}
window.reviewRakutenPaste=function(){
 try{
 const p=analyze();previewSignature=sig(p);
 result().innerHTML='<p>未登録 '+p.add.length+'件 ／ 支払い月を更新 '+p.updates.length+'件 ／ 登録済み・取消・請求0円など '+p.skipped+'件 ／ 月外 '+p.outside+'件 ／ 同日同額で要確認 '+p.ambiguous+'件</p>'+
 [...p.add,...p.updates.map(u=>u.after)].map(t=>'<p>'+escHtml(t.date)+' '+escHtml(t.name)+' '+fmt(t.amount)+' ／ '+escHtml(t.category)+' ／ 支払い月 '+escHtml(t.paymentMonth||'未確定')+(t.paymentAmount?' '+fmt(t.paymentAmount):'')+(t.excluded?'（資金移動・集計除外）':'')+'</p>').join('')+
 '<p>追加総額 '+fmt(p.add.reduce((s,t)=>s+t.amount,0))+' ／ 支出集計への追加 '+fmt(p.add.filter(t=>!t.excluded).reduce((s,t)=>s+t.amount,0))+'</p>'+
 '<p>同日・同額・楽天カードの既存取引がある場合は追加しません。既存のカテゴリ・除外設定は変更しません。</p>'+
 (p.add.length||p.updates.length?'<button type="button" onclick="importReviewedRakutenPaste()">未登録の'+p.add.length+'件の追加・'+p.updates.length+'件の支払い月更新を保存</button>':'');
 }catch(e){previewSignature='';result().textContent=e.message;}
};
window.importReviewedRakutenPaste=function(){
 let p;try{p=analyze();}catch(e){result().textContent=e.message;return;}
 if(!(p.add.length||p.updates.length)||sig(p)!==previewSignature){reviewRakutenPaste();return;}
 const before=JSON.stringify(transactions);const rows=p.add.map(t=>({...t,id:makeId(),importMethod:'reviewed-rakuten-paste-v1'}));
 try{localStorage.setItem(undoKey+'_full_backup',before);localStorage.setItem(undoKey,JSON.stringify({added:rows,updated:p.updates.map(u=>({before:JSON.parse(u.before),after:u.after}))}));}catch(e){result().textContent='バックアップを保存できなかったため追加していません。';return;}
 const updateMap=new Map(p.updates.map(u=>[u.id,u.after]));transactions=transactions.map(t=>updateMap.get(t.id)||t).concat(rows);
 try{save();}catch(e){transactions=JSON.parse(before);result().textContent='保存に失敗したため追加を取り消しました。';return;}
 renderAll();previewSignature='';reviewRakutenPaste();
 result().insertAdjacentHTML('afterbegin','<p role="status">'+rows.length+'件を追加して保存しました。</p>');
};
window.undoReviewedRakutenPaste=function(){
 let added;try{added=JSON.parse(localStorage.getItem(undoKey)||'[]');}catch(e){return;}
 const updated=Array.isArray(added)?[]:added.updated;added=Array.isArray(added)?added:added.added;
 const byId=new Map(added.map(t=>[t.id,t]));const before=transactions;let count=0;
 transactions=transactions.filter(t=>{const a=byId.get(t.id);if(a&&JSON.stringify(a)===JSON.stringify(t)){count++;return false;}return true;});
 let restored=0;const updateMap=new Map(updated.map(u=>[u.after.id,u]));transactions=transactions.map(t=>{const u=updateMap.get(t.id);if(u&&JSON.stringify(t)===JSON.stringify(u.after)){restored++;return u.before;}return t;});
 try{save();}catch(e){transactions=before;return;}
 localStorage.removeItem(undoKey);renderAll();result().textContent=count+'件の追加・'+restored+'件の支払い月更新を元に戻しました。追加後に編集された取引は保護して残しました。';
};
const section=document.createElement('section');section.style.cssText='padding:14px;margin-top:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px';
section.innerHTML='<h3>楽天明細：未登録分だけ追加</h3><p>利用月の明細を取り込み、CSVにある支払い月へ表示します。請求額がある行は利用月にかかわらず対象です。請求未確定の行は表示中の利用月だけを対象にします。支払い月未確定の明細は未確定として保存します。取消欄・請求額0円・別の月は対象外です。</p><label for="rakutenPasteText">楽天CSVの内容</label><textarea id="rakutenPasteText" rows="6" style="width:100%;margin:8px 0"></textarea><button type="button" onclick="reviewRakutenPaste()">楽天明細の未登録分を確認</button> <button type="button" onclick="undoReviewedRakutenPaste()">直前の楽天追加を元に戻す</button><div id="rakutenPasteResults"></div>';
document.getElementById('tab2').appendChild(section);
})();

