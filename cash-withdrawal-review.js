/* Cash withdrawal review: explicit action only; bank amounts stay unchanged. */
(function(){
  const key='kakeibo_cash_withdrawal_undo_v1';
  let pending='';
  function candidates(){
    return transactions.filter(t=>inMonth(t,currentYear,currentMonth)&&t.source==='ゆうちょ'&&t.type==='expense'&&!t.excluded&&!t.cashParentId&&
      /^(カード(?:\s|$))|ATM|ＡＴＭ/.test(t.name||'')&&
      !transactions.some(s=>s.cashParentId===t.id));
  }
  function signature(rows){return JSON.stringify(rows.map(t=>[t.id,t.date,t.name,t.amount]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
  function box(){return document.getElementById('cashWithdrawalResults');}
  window.reviewCashWithdrawals=function(){
    const rows=candidates();
    pending=signature(rows);
    const cash=transactions.filter(t=>inMonth(t,currentYear,currentMonth)&&t.source==='現金'&&t.type==='expense'&&!t.excluded&&!t.cashParentId).reduce((s,t)=>s+Number(t.amount),0);
    const total=rows.reduce((s,t)=>s+Number(t.amount),0);
    box().innerHTML='<p>'+currentYear+'年'+(currentMonth+1)+'月：現金払い '+fmt(cash)+' ／ 未除外の現金引き出し '+rows.length+'件・'+fmt(total)+'</p>'+
      rows.map(t=>'<p>'+escHtml(t.date)+' '+escHtml(t.name)+' '+fmt(t.amount)+'</p>').join('')+
      '<p>現金引き出しは資金移動として集計から外します。銀行明細の金額と、個別の現金払いは維持します。差額は未確認のため、残高には自動加算しません。振り分け済みの引き出しは対象外です。</p>'+
      (rows.length?'<button type="button" onclick="excludeReviewedCashWithdrawals()">'+rows.length+'件を集計から外す</button>':'<p>対象はありません（除外済みの取引は再処理しません）。</p>');
  };
  window.excludeReviewedCashWithdrawals=function(){
    const rows=candidates();
    if(!rows.length||signature(rows)!==pending){reviewCashWithdrawals();return;}
    const before=rows.map(t=>({id:t.id,excluded:t.excluded,hadExcluded:Object.prototype.hasOwnProperty.call(t,'excluded'),reason:t.exclusionReason,hadReason:Object.prototype.hasOwnProperty.call(t,'exclusionReason')}));
    const full=JSON.stringify(transactions);
    try{
      localStorage.setItem(key,JSON.stringify(before));
      localStorage.setItem(key+'_full_backup',full);
    }catch(e){box().textContent='バックアップを保存できなかったため変更していません。';return;}
    rows.forEach(t=>{t.excluded=true;t.exclusionReason='現金引出は資金移動。個別の現金払い明細で支出計上。';});
    try{save();}catch(e){transactions=JSON.parse(full);box().textContent='保存できなかったため変更を取り消しました。';return;}
    pending='';renderAll();reviewCashWithdrawals();
    box().insertAdjacentHTML('afterbegin','<p role="status">'+rows.length+'件・'+fmt(rows.reduce((s,t)=>s+Number(t.amount),0))+'を支出集計から外して保存しました。</p>');
  };
  window.undoCashWithdrawalExclusion=function(){
    let before;try{before=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){return;}
    if(!before.length){box().textContent='元に戻す対象はありません。';return;}
    const marker='現金引出は資金移動。個別の現金払い明細で支出計上。';
    const current=JSON.stringify(transactions);let count=0;
    before.forEach(b=>{
      const t=transactions.find(t=>t.id===b.id);
      if(!t||t.excluded!==true||t.exclusionReason!==marker)return;
      if(b.hadExcluded)t.excluded=b.excluded;else delete t.excluded;
      if(b.hadReason)t.exclusionReason=b.reason;else delete t.exclusionReason;
      count++;
    });
    try{save();}catch(e){transactions=JSON.parse(current);box().textContent='保存できなかったため元に戻していません。';return;}
    localStorage.removeItem(key);renderAll();reviewCashWithdrawals();
    box().insertAdjacentHTML('afterbegin','<p role="status">'+count+'件の集計除外を元に戻しました。</p>');
  };
  const section=document.createElement('section');
  section.style.cssText='padding:14px;margin-top:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px';
  section.innerHTML='<h3>現金引き出しの二重計上を修正</h3><p>表示中の月のゆうちょ現金引き出しを確認して、資金移動として支出集計から外します。</p><button type="button" onclick="reviewCashWithdrawals()">表示中の月の現金引き出しを確認</button> <button type="button" onclick="undoCashWithdrawalExclusion()">現金引き出しの除外を元に戻す</button><div id="cashWithdrawalResults"></div>';
  document.getElementById('tab2').appendChild(section);
})();
