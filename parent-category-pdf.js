/* Parent-facing PDF: aggregate categories only; no transaction detail is rendered. */
(function(){
function withdrawal(t){return isCardPaymentWithdrawal(t);}
function selectedWithdrawal(t){return withdrawal(t)&&String(t.date).slice(0,7)===currentYear+'-'+String(currentMonth+1).padStart(2,'0');}
function validateRows(t,rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('カテゴリ内訳を1件以上入力してください。');
 const result=rows.map(r=>{
  const category=typeof r.category==='string'?r.category.trim():'';
  if(!category||category.length>80||typeof r.amount!=='number'||!Number.isSafeInteger(r.amount)||r.amount<=0)throw Error('カテゴリ名と正の整数金額を入力してください。');
  return {category,amount:r.amount};
 });
 if(result.reduce((a,r)=>a+r.amount,0)!==Number(t.amount))throw Error('内訳合計が口座引き落とし額と一致しません。');
 return result;
}
function allTransactions(){return typeof transactions==='undefined'?[]:transactions;}
function model(){
 const rows=getMonthTx(currentYear,currentMonth);
 const payments=allTransactions().filter(selectedWithdrawal);
 const inc=new Map(),exp=new Map();let income=0,expense=0;
 function add(kind,category,amount){
  if(!Number.isFinite(amount)||amount<=0)return;
  const target=kind==='income'?inc:exp;category=String(category||'未分類');target.set(category,(target.get(category)||0)+amount);
  if(kind==='income')income+=amount;else expense+=amount;
 }
 rows.forEach(t=>add(t.type,t.category,t.type==='expense'?getEffectiveAmount(t):Number(t.amount)));
 const paymentChecks=payments.map(t=>{
  let breakdown;try{breakdown=validateRows(t,t.parentPaymentBreakdown);}catch(e){}
  // The shared month aggregation already includes each withdrawal exactly once.
  return {id:t.id,date:t.date,name:t.name,amount:Number(t.amount),confirmed:!!breakdown,rows:breakdown||[]};
 });
 const entries=(map,kind)=>[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja')).map(([category,amount])=>({kind,category,amount}));
 return {year:currentYear,month:currentMonth+1,income,expense,balance:income-expense,paymentChecks,rows:[...entries(inc,'収入'),...entries(exp,'支出')]};
}
window.parentPaymentValidateRows=validateRows;
window.parentPaymentIsWithdrawal=withdrawal;
let reviewed=null;
window.reviewParentPaymentBreakdown=function(){
 const status=document.getElementById('parentPaymentStatus'),button=document.getElementById('parentPaymentSave');
 reviewed=null;button.disabled=true;
 try{
  const raw=document.getElementById('parentPaymentInput').value,items=JSON.parse(raw);
  if(!Array.isArray(items)||!items.length)throw Error('配列で1件以上入力してください。');
  const ids=new Set();const updates=items.map(item=>{
   const t=allTransactions().find(t=>String(t.id)===String(item.withdrawalId));
   if(!t||!selectedWithdrawal(t))throw Error('表示月のカード口座引き落としIDを指定してください。');
   if(ids.has(t.id))throw Error('同じ引き落としIDが重複しています。');ids.add(t.id);
   return {id:t.id,rows:validateRows(t,item.rows),before:JSON.stringify(t)};
  });
  reviewed={raw,year:currentYear,month:currentMonth,updates};
  status.textContent=updates.map(u=>{const t=allTransactions().find(t=>t.id===u.id);return t.date+' '+t.name+' '+money(t.amount)+'：'+u.rows.map(r=>r.category+' '+money(r.amount)).join(' ／ ');}).join('\n')+'\n引き落とし額と内訳合計が一致しています。確認後に保存してください。';button.disabled=false;
 }catch(e){status.textContent='確認できません：'+e.message;}
};
window.saveParentPaymentBreakdown=function(){
 const status=document.getElementById('parentPaymentStatus'),button=document.getElementById('parentPaymentSave');
 try{
  if(!reviewed||reviewed.raw!==document.getElementById('parentPaymentInput').value||reviewed.year!==currentYear||reviewed.month!==currentMonth)throw Error('入力または表示月が変わりました。もう一度内訳を確認してください。');
  const updates=reviewed.updates.map(u=>{const t=allTransactions().find(t=>t.id===u.id);if(!t||JSON.stringify(t)!==u.before)throw Error('取引が変更されました。もう一度確認してください。');validateRows(t,u.rows);return {t,rows:u.rows};});
  const before=updates.map(u=>({t:u.t,had:Object.hasOwn(u.t,'parentPaymentBreakdown'),rows:u.t.parentPaymentBreakdown}));
  try{updates.forEach(u=>{u.t.parentPaymentBreakdown=u.rows;});save();}
  catch(e){before.forEach(u=>{if(u.had)u.t.parentPaymentBreakdown=u.rows;else delete u.t.parentPaymentBreakdown;});throw e;}
  reviewed=null;button.disabled=true;status.textContent='支払い明細のカテゴリ内訳を保存しました。';if(typeof renderAll==='function')renderAll();window.previewParentPDF();
 }catch(e){reviewed=null;button.disabled=true;status.textContent='保存できません：'+e.message;}
};
window.parentReportModel=model;
const money=n=>Math.round(n).toLocaleString('ja-JP')+'円';
function pages(m){
 const parts=[];for(let i=0;i<Math.max(1,m.rows.length);i+=20)parts.push(m.rows.slice(i,i+20));
 return parts.map((rows,i)=>'<section class="parent-pdf-page" style="box-sizing:border-box;width:760px;background:#fff;color:#222;padding:30px 36px;font-family:Arial,\'Yu Gothic\',sans-serif;font-size:14px;line-height:1.6;margin:0 auto 16px">'+
 '<h1 style="font-size:24px;border-bottom:3px solid #287d69;padding-bottom:12px;margin:0 0 8px">'+m.year+'年'+m.month+'月 収支報告</h1><p style="font-size:12px;color:#555;margin:0 0 20px">親提出用・カテゴリ別 ／ 支払い月基準</p><p style="font-size:11px;color:#555">カードは口座引き落とし月に計上し、利用明細と二重計上しません。</p>'+
 (i===0?'<div style="display:flex;gap:12px;margin-bottom:24px">'+[['収入合計',m.income],['支出合計',m.expense],['収支',m.balance]].map(([k,v])=>'<div style="flex:1;background:#f1f6f3;padding:12px;border-radius:6px"><div style="font-size:12px">'+k+'</div><strong style="font-size:21px">'+money(v)+'</strong></div>').join('')+'</div>':'')+
 '<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="padding:9px;text-align:left;border-bottom:2px solid #aaa">区分</th><th style="padding:9px;text-align:left;border-bottom:2px solid #aaa">カテゴリ</th><th style="padding:9px;text-align:right;border-bottom:2px solid #aaa">金額</th></tr></thead><tbody>'+
 (rows.length?rows.map(r=>'<tr><td style="padding:9px;border-bottom:1px solid #ddd">'+r.kind+'</td><td style="padding:9px;border-bottom:1px solid #ddd;word-break:break-all">'+escHtml(r.category)+'</td><td style="padding:9px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap">'+money(r.amount)+'</td></tr>').join(''):'<tr><td colspan="3" style="padding:12px">登録済みデータなし</td></tr>')+
 '</tbody></table><p style="font-size:11px;color:#666;margin-top:20px">登録済みデータの集計 ／ '+(i+1)+' / '+parts.length+'ページ</p></section>').join('');
}
window.previewParentPDF=function(){
 const preview=document.getElementById('parentPDFPreview');
 const m=model();preview.innerHTML=pages(m);preview.hidden=false;
 const check=document.getElementById('parentPaymentChecks');if(check)check.textContent=m.paymentChecks.length?m.paymentChecks.map(p=>p.date+' '+p.name+' '+money(p.amount)+' ／ '+(p.confirmed?'内訳照合済み':'内訳未確認：引き落とし総額を計上')+' ／ ID: '+p.id).join('\n'):'この月に登録されたカード口座引き落としはありません。';
 document.getElementById('parentPDFStatus').textContent='支払い月基準のカテゴリ別収支です。内訳未確認のカード支払いは総額を計上しています。';
};
function rasterPDF(images){
 const enc=new TextEncoder(),parts=[];let size=0;const offsets=[0];
 const add=v=>{const b=typeof v==='string'?enc.encode(v):v;parts.push(b);size+=b.length;};
 const obj=(id,body)=>{offsets[id]=size;add(id+' 0 obj\n');add(body);add('\nendobj\n');};
 add('%PDF-1.4\n');
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 images.forEach((image,i)=>{
  const page=3+i*3,content=page+1,img=page+2;
  const w=Math.min(516,762*image.width/image.height),h=w*image.height/image.width;
  const stream='q\n'+w+' 0 0 '+h+' '+((595.28-w)/2)+' '+(841.89-40-h)+' cm\n/Img Do\nQ';
  obj(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Img '+img+' 0 R >> >> /Contents '+content+' 0 R >>');
  obj(content,'<< /Length '+enc.encode(stream).length+' >>\nstream\n'+stream+'\nendstream');
  offsets[img]=size;add(img+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.bytes.length+' >>\nstream\n');add(image.bytes);add('\nendstream\nendobj\n');
 });
 const xref=size;add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
 for(let i=1;i<offsets.length;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 add('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 const bytes=new Uint8Array(size);let p=0;for(const b of parts){bytes.set(b,p);p+=b.length;}return bytes;
}
window.exportParentPDF=async function(){
 const status=document.getElementById('parentPDFStatus'),button=document.getElementById('parentPDFDownload');
 button.disabled=true;status.textContent='親提出用PDFを作成しています…';
 let host;
 try{
 const m=model();
 if(typeof html2canvas!=='function')throw Error('画像描画ライブラリを読み込めませんでした。');
 if(document.fonts?.ready)await document.fonts.ready;
 host=document.createElement('div');host.style.cssText='position:absolute;left:-12000px;top:0;width:760px;background:#fff;';host.innerHTML=pages(m);document.body.appendChild(host);
 const images=[];
 for(const page of host.querySelectorAll('.parent-pdf-page')){
  const canvas=await html2canvas(page,{scale:2,backgroundColor:'#ffffff',logging:false});
  const binary=atob(canvas.toDataURL('image/jpeg',0.98).split(',')[1]);
  images.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(binary,c=>c.charCodeAt(0))});
 }
 const filename=m.year+'-'+String(m.month).padStart(2,'0')+'_親提出用_カテゴリ別収支.pdf';
 const url=URL.createObjectURL(new Blob([rasterPDF(images)],{type:'application/pdf'}));
 const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 status.textContent=filename+' を保存しました。';
 }catch(e){status.textContent='出力できませんでした：'+e.message;}
 finally{host?.remove();button.disabled=false;}
};
const card=document.createElement('div');card.className='pdf-card';card.style.marginBottom='12px';
card.innerHTML='<h3>親提出用PDF（カテゴリのみ）</h3><p>実際に支払った月で集計します。カードは口座引き落としを計上し、利用日の明細を除きます。内訳を登録するまでは「カード支払（内訳未確認）」として総額を計上します。店名・日付ごとの明細・支払方法は載せません。</p><button type="button" class="primary-btn" onclick="previewParentPDF()">親提出用をプレビュー</button> <button type="button" class="primary-btn" id="parentPDFDownload" onclick="exportParentPDF()">親提出用PDFを保存</button><p id="parentPDFStatus" role="status" style="margin-top:10px"></p><div id="parentPaymentChecks" style="white-space:pre-wrap;font-size:12px"></div><details style="margin:16px 0"><summary>カード内訳の設定</summary><p>引き落としIDごとにカテゴリと金額を入力します。合計が引き落とし額と一致する場合に保存できます。</p><label for="parentPaymentInput">支払い明細のカテゴリ内訳（JSON）</label><textarea id="parentPaymentInput" rows="8" style="width:100%;box-sizing:border-box" placeholder="引き落としIDとカテゴリ内訳の配列を入力"></textarea><button type="button" class="primary-btn" onclick="reviewParentPaymentBreakdown()">内訳を確認</button> <button type="button" class="primary-btn" id="parentPaymentSave" disabled onclick="saveParentPaymentBreakdown()">確認した内訳を保存</button><p id="parentPaymentStatus" role="status" style="white-space:pre-wrap"></p></details><div style="overflow:auto"><div id="parentPDFPreview" hidden></div></div>';
document.getElementById('tab5').prepend(card);
})();

