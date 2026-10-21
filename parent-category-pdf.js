/* Parent-facing PDF: aggregate categories only; no transaction detail is rendered. */
(function(){
function model(){
 const rows=getMonthTx(currentYear,currentMonth);
 const inc=new Map(),exp=new Map();let income=0,expense=0;
 rows.forEach(t=>{
  const amount=t.type==='expense'?getEffectiveAmount(t):Number(t.amount);
  if(!Number.isFinite(amount)||amount<=0)return;
  const target=t.type==='income'?inc:exp;
  const category=String(t.category||'未分類');target.set(category,(target.get(category)||0)+amount);
  if(t.type==='income')income+=amount;else expense+=amount;
 });
 const entries=(map,kind)=>[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja')).map(([category,amount])=>({kind,category,amount}));
 return {year:currentYear,month:currentMonth+1,income,expense,balance:income-expense,rows:[...entries(inc,'収入'),...entries(exp,'支出')]};
}
window.parentReportModel=model;
const money=n=>Math.round(n).toLocaleString('ja-JP')+'円';
function pages(m){
 const parts=[];for(let i=0;i<Math.max(1,m.rows.length);i+=20)parts.push(m.rows.slice(i,i+20));
 return parts.map((rows,i)=>'<section class="parent-pdf-page" style="box-sizing:border-box;width:760px;background:#fff;color:#222;padding:30px 36px;font-family:Arial,\'Yu Gothic\',sans-serif;font-size:14px;line-height:1.6;margin:0 auto 16px">'+
 '<h1 style="font-size:24px;border-bottom:3px solid #287d69;padding-bottom:12px;margin:0 0 8px">'+m.year+'年'+m.month+'月 収支報告</h1><p style="font-size:12px;color:#555;margin:0 0 20px">親提出用・カテゴリ別</p>'+
 (i===0?'<div style="display:flex;gap:12px;margin-bottom:24px">'+[['収入合計',m.income],['支出合計',m.expense],['収支',m.balance]].map(([k,v])=>'<div style="flex:1;background:#f1f6f3;padding:12px;border-radius:6px"><div style="font-size:12px">'+k+'</div><strong style="font-size:21px">'+money(v)+'</strong></div>').join('')+'</div>':'')+
 '<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="padding:9px;text-align:left;border-bottom:2px solid #aaa">区分</th><th style="padding:9px;text-align:left;border-bottom:2px solid #aaa">カテゴリ</th><th style="padding:9px;text-align:right;border-bottom:2px solid #aaa">金額</th></tr></thead><tbody>'+
 (rows.length?rows.map(r=>'<tr><td style="padding:9px;border-bottom:1px solid #ddd">'+r.kind+'</td><td style="padding:9px;border-bottom:1px solid #ddd;word-break:break-all">'+escHtml(r.category)+'</td><td style="padding:9px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap">'+money(r.amount)+'</td></tr>').join(''):'<tr><td colspan="3" style="padding:12px">登録済みデータなし</td></tr>')+
 '</tbody></table><p style="font-size:11px;color:#666;margin-top:20px">登録済みデータの集計 ／ '+(i+1)+' / '+parts.length+'ページ</p></section>').join('');
}
window.previewParentPDF=function(){
 const preview=document.getElementById('parentPDFPreview');
 preview.innerHTML=pages(model());preview.hidden=false;
 document.getElementById('parentPDFStatus').textContent='カテゴリ別の収入・支出のみを表示しています。';
};
async function library(){
 if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';s.onload=resolve;s.onerror=()=>reject(Error('PDF出力に必要なライブラリを読み込めませんでした。接続を確認してください。'));document.head.appendChild(s);});
 if(!window.jspdf?.jsPDF)throw Error('PDF出力の準備に失敗しました。');
 return window.jspdf.jsPDF;
}
window.exportParentPDF=async function(){
 const status=document.getElementById('parentPDFStatus'),button=document.getElementById('parentPDFDownload');
 button.disabled=true;status.textContent='親提出用PDFを作成しています…';
 let host;
 try{
 const m=model(),PDF=await library();
 if(typeof html2canvas!=='function')throw Error('画像描画ライブラリを読み込めませんでした。');
 if(document.fonts?.ready)await document.fonts.ready;
 host=document.createElement('div');host.style.cssText='position:absolute;left:-12000px;top:0;width:760px;background:#fff;';host.innerHTML=pages(m);document.body.appendChild(host);
 const pdf=new PDF({orientation:'portrait',unit:'mm',format:'a4'});pdf.setProperties({title:m.year+'年'+m.month+'月 カテゴリ別収支',subject:'親提出用'});
 let i=0;
 for(const page of host.querySelectorAll('.parent-pdf-page')){
  const canvas=await html2canvas(page,{scale:2,backgroundColor:'#ffffff',logging:false});
  if(i++)pdf.addPage();
  const w=Math.min(182,269*canvas.width/canvas.height),h=w*canvas.height/canvas.width;
  pdf.addImage(canvas.toDataURL('image/png'),'PNG',(210-w)/2,14,w,h);
 }
 const filename=m.year+'-'+String(m.month).padStart(2,'0')+'_親提出用_カテゴリ別収支.pdf';
 pdf.save(filename);status.textContent=filename+' を保存しました。';
 }catch(e){status.textContent='出力できませんでした：'+e.message;}
 finally{host?.remove();button.disabled=false;}
};
const card=document.createElement('div');card.className='pdf-card';card.style.marginBottom='12px';
card.innerHTML='<h3>親提出用PDF（カテゴリのみ）</h3><p>表示中の月の収入合計・支出合計・収支と、カテゴリ別金額を出力します。店名・日付ごとの明細・支払方法は載せません。</p><button type="button" class="primary-btn" onclick="previewParentPDF()">親提出用をプレビュー</button> <button type="button" class="primary-btn" id="parentPDFDownload" onclick="exportParentPDF()">親提出用PDFを保存</button><p id="parentPDFStatus" role="status" style="margin-top:10px"></p><div style="overflow:auto"><div id="parentPDFPreview" hidden></div></div>';
document.getElementById('tab5').prepend(card);
})();
