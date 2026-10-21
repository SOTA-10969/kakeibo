/* Reviewed incremental Rakuten import. User data is supplied only through the form. */
(function(){
const undoKey='kakeibo_rakuten_review_undo_v1';let previewSignature='';
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
const source=t=>['楽天カード','楽天','rakuten'].map(norm).includes(norm(t.source));
function result(){return document.getElementById('rakutenPasteResults');}
function analyze(){
 const text=document.getElementById('rakutenPasteText').value.replace(/^\uFEFF/,'');
 const lines=text.split(/\r?\n/).filter(l=>l.trim());const header=csvSplit(lines[0]||'');
 if(header[0]!=='利用日'||header[1]!=='利用店名・商品名'||!header.includes('当月請求額'))throw Error('楽天の利用明細CSVを、見出し行から貼り付けてください。');
 const bill=header.indexOf('当月請求額'),pay=header.indexOf('支払月');
 const used=new Set(),inFile=new Set();const add=[];let skipped=0,outside=0,cancel=false,ambiguous=0;
 for(const line of lines.slice(1)){
  const c=csvSplit(line);if((c[0]||'').includes('キャンセル')){cancel=true;continue;}
  if(cancel||!/^\d{4}\/\d{2}\/\d{2}$/.test(c[0]||''))continue;
  const date=normalizeDate(c[0]);if(!inMonth({date},currentYear,currentMonth)){outside++;continue;}
  const amount=Number((c[4]||'').replace(/,/g,''));const charged=Number((c[bill]||'').replace(/,/g,''));
  if(!Number.isFinite(amount)||amount<=0||!((c[bill]!==''&&charged>0)||(c[pay]==='11月以降'&&c[bill]===''))){skipped++;continue;}
  const name=c[1]||'';const key=JSON.stringify([date,norm(name),amount]);
  if(inFile.has(key)){skipped++;continue;}inFile.add(key);
  const matches=transactions.filter(t=>source(t)&&!t.cashParentId&&t.date===date&&Number(t.amount)===amount&&t.type==='expense');
  const exact=matches.find(t=>norm(t.name)===norm(name)&&!used.has(t.id));
  if(exact){used.add(exact.id);skipped++;continue;}
  if(matches.length){ambiguous++;continue;}
  const n=norm(name);const investment=/楽天証券|投信積立/.test(name);const charge=/suica|スイカ/.test(n);
  let category=detectCategory(name,'expense');
  if(investment)category='積立';else if(charge)category='交通費';
  else if(/キユウシユウデンリヨク|キュウシュウデンリョク/.test(String(name).normalize('NFKC')))category='電気';
  add.push({date,name,amount,type:'expense',source:'楽天カード',category,excluded:investment||charge,
    ...(investment||charge?{exclusionReason:investment?'投信積立は資産購入として生活費集計から除外。':'Suicaチャージは資金移動として生活費集計から除外。'}:{})});
 }
 return {add,skipped,outside,ambiguous};
}
function sig(p){return JSON.stringify({rows:p.add,skipped:p.skipped,outside:p.outside,ambiguous:p.ambiguous});}
window.reviewRakutenPaste=function(){
 try{
 const p=analyze();previewSignature=sig(p);
 result().innerHTML='<p>未登録 '+p.add.length+'件 ／ 登録済み・取消・請求0円など '+p.skipped+'件 ／ 月外 '+p.outside+'件 ／ 同日同額で要確認 '+p.ambiguous+'件</p>'+
 p.add.map(t=>'<p>'+escHtml(t.date)+' '+escHtml(t.name)+' '+fmt(t.amount)+' ／ '+escHtml(t.category)+(t.excluded?'（資金移動・集計除外）':'')+'</p>').join('')+
 '<p>追加総額 '+fmt(p.add.reduce((s,t)=>s+t.amount,0))+' ／ 支出集計への追加 '+fmt(p.add.filter(t=>!t.excluded).reduce((s,t)=>s+t.amount,0))+'</p>'+
 '<p>同日・同額・楽天カードの既存取引がある場合は追加しません。既存のカテゴリ・除外設定は変更しません。</p>'+
 (p.add.length?'<button type="button" onclick="importReviewedRakutenPaste()">未登録の'+p.add.length+'件を追加する</button>':'');
 }catch(e){previewSignature='';result().textContent=e.message;}
};
window.importReviewedRakutenPaste=function(){
 let p;try{p=analyze();}catch(e){result().textContent=e.message;return;}
 if(!p.add.length||sig(p)!==previewSignature){reviewRakutenPaste();return;}
 const before=JSON.stringify(transactions);const rows=p.add.map(t=>({...t,id:makeId(),importMethod:'reviewed-rakuten-paste-v1'}));
 try{localStorage.setItem(undoKey+'_full_backup',before);localStorage.setItem(undoKey,JSON.stringify(rows));}catch(e){result().textContent='バックアップを保存できなかったため追加していません。';return;}
 transactions=transactions.concat(rows);
 try{save();}catch(e){transactions=JSON.parse(before);result().textContent='保存に失敗したため追加を取り消しました。';return;}
 renderAll();previewSignature='';reviewRakutenPaste();
 result().insertAdjacentHTML('afterbegin','<p role="status">'+rows.length+'件を追加して保存しました。</p>');
};
window.undoReviewedRakutenPaste=function(){
 let added;try{added=JSON.parse(localStorage.getItem(undoKey)||'[]');}catch(e){return;}
 const byId=new Map(added.map(t=>[t.id,t]));const before=transactions;let count=0;
 transactions=transactions.filter(t=>{const a=byId.get(t.id);if(a&&JSON.stringify(a)===JSON.stringify(t)){count++;return false;}return true;});
 try{save();}catch(e){transactions=before;return;}
 localStorage.removeItem(undoKey);renderAll();result().textContent=count+'件の追加を元に戻しました。追加後に編集された取引は保護して残しました。';
};
const section=document.createElement('section');section.style.cssText='padding:14px;margin-top:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px';
section.innerHTML='<h3>楽天明細：未登録分だけ追加</h3><p>表示中の月の利用分だけを確認します。取消欄・請求額0円・別の月は対象外です。</p><label for="rakutenPasteText">楽天CSVの内容</label><textarea id="rakutenPasteText" rows="6" style="width:100%;margin:8px 0"></textarea><button type="button" onclick="reviewRakutenPaste()">楽天明細の未登録分を確認</button> <button type="button" onclick="undoReviewedRakutenPaste()">直前の楽天追加を元に戻す</button><div id="rakutenPasteResults"></div>';
document.getElementById('tab2').appendChild(section);
})();
