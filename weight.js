let weightTablePage=0,weightChartEnd=null;
// An ongoing weight projection and optional body-composition estimates. No health targets are inferred.
function weightToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function weightDay(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;const [y,m,d]=date.split('-').map(Number);const time=Date.UTC(y,m-1,d);return new Date(time).toISOString().slice(0,10)===date?time/86400000:NaN;}
function weightDate(start,week){return new Date((weightDay(start)+week*7)*86400000).toISOString().slice(0,10);}
function weightDateLabel(date){return new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function weightTarget(plan,week){return plan.startWeight*Math.pow(1+(plan.direction==='loss'?-1:1)*plan.rate/100,week);}
function weightComposition(weight,bf){return bf===null||bf===undefined?null:{fat:weight*bf/100,nonFat:weight*(1-bf/100)};}
function weightWeek(plan,date){const days=weightDay(date)-weightDay(plan.startDate);return Number.isFinite(days)&&days>=4?Math.round(days/7):null;}
function weightBF(value){return value===''?null:Number(value);}
function validWeightBF(value){return value===null||(Number.isFinite(value)&&value>0&&value<100);}
function weightSigned(value){return `${value>0?'+':''}${value.toFixed(1)} lb`;}
function weightAheadLabel(plan,entry){
 const target=weightTarget(plan,entry.week),ahead=plan.direction==='gain'?entry.weight-target:target-entry.weight;
 return ahead>=.05?` · ${ahead.toFixed(1)} lb ahead of initial plan`:'';
}
function weightPlanComposition(plan,week){if(plan.startBF===null||plan.goalBF===null)return null;return weightComposition(weightTarget(plan,week),plan.startBF+(plan.goalBF-plan.startBF)*Math.min(1,week/plan.weeks));}
function updatedWeightTarget(tracking,week){
 const updated=tracking.updatedPlan;
 return updated&&week>=updated.week?updated.weight*Math.pow(1+(updated.direction==='loss'?-1:1)*updated.rate/100,week-updated.week):weightTarget(tracking.initialPlan||tracking.plan,week);
}
function syncWeightProjection(tracking){
 const entry=tracking.entries.at(-1);
 tracking.updatedPlan=entry?{week:(weightDay(entry.date)-weightDay(tracking.plan.startDate))/7,date:entry.date,weight:entry.weight,rate:tracking.plan.rate,direction:tracking.plan.direction}:null;
}
function focusWeeklyField(id){const input=document.getElementById(id);input.focus();if(input.type!=='date')input.select();}
function useTodayForWeighIn(){document.getElementById('weeklyWeightDate').value=weightToday();focusWeeklyField('weeklyWeight');}
function weeklyEntryNext(event,id){if(event.key==='Enter'){event.preventDefault();focusWeeklyField(id);}}
function weightChartWindow(plan,entries){
 const raw=document.getElementById('weightChartPeriod').value,span=Number(raw),focus=Math.max(entries.at(-1)?.week||0,Math.max(0,Math.round((weightDay(weightToday())-weightDay(plan.startDate))/7))),horizon=Math.max(plan.weeks,focus);
 if(raw==='all'||![4,12,26,52].includes(span))return {start:0,end:horizon,horizon,span:null};
 const end=Math.max(span,Math.min(Math.max(span,horizon),weightChartEnd??focus+1));return {start:end-span,end,horizon:Math.max(span,horizon),span};
}
function changeWeightChartPeriod(){weightChartEnd=null;renderWeightCharts();}
function moveWeightChart(direction){const tracking=db.weightTracking,range=weightChartWindow(tracking.plan,tracking.entries);if(!range.span)return;weightChartEnd=range.end+direction*range.span;renderWeightCharts();}
function renderWeightCharts(){
 const tracking=db.weightTracking,plan=tracking.plan;if(!plan)return;
 const original=tracking.initialPlan||plan,entries=tracking.entries,range=weightChartWindow(plan,entries),count=Math.max(1,Math.ceil(Math.min(range.end-range.start,104)));
 const weeks=Array.from({length:count+1},(_,i)=>range.start+i*(range.end-range.start)/count);
 const actual=[{week:0,value:plan.startWeight},...entries.map(e=>({week:e.week,value:e.weight}))];
 const series=[{name:'Actual weight',color:'#1679b9',points:actual},{name:'Initial plan',color:'#7b8495',dashed:true,points:weeks.map(week=>({week,value:weightTarget(original,week)}))}];
 if(tracking.updatedPlan){const start=Math.max(range.start,tracking.updatedPlan.week);const updatedWeeks=[...new Set([start,...weeks.filter(week=>week>=start)])].filter(week=>week<=range.end);series.push({name:'Updated plan',color:'#8b4eb6',dashed:true,points:updatedWeeks.map(week=>({week,value:updatedWeightTarget(tracking,week)}))});}
 renderWeightChart('bodyWeightChart',series,range);
 const samples=[{week:0,weight:plan.startWeight,bodyFat:plan.startBF},...entries].filter(e=>e.bodyFat!==null&&e.bodyFat!==undefined);
 const compositionSeries=[{name:'Estimated fat',color:'#c05a24',points:samples.map(e=>({week:e.week,value:weightComposition(e.weight,e.bodyFat).fat}))},{name:'Non-fat weight',color:'#147966',points:samples.map(e=>({week:e.week,value:weightComposition(e.weight,e.bodyFat).nonFat}))}];
 if(original.startBF!==null&&original.goalBF!==null)compositionSeries.push({name:'Initial planned fat',color:'#c05a24',dashed:true,points:weeks.map(week=>({week,value:weightPlanComposition(original,week).fat}))},{name:'Initial planned non-fat',color:'#147966',dashed:true,points:weeks.map(week=>({week,value:weightPlanComposition(original,week).nonFat}))});
 const compositionView=document.getElementById('compositionChartView').value;
 renderWeightChart('compositionWeightChart',compositionSeries.filter(s=>compositionView==='fat'?s.name.toLowerCase().includes('fat')&&!s.name.toLowerCase().includes('non-fat'):compositionView==='nonFat'?s.name.toLowerCase().includes('non-fat'):true),range);
 document.getElementById('weightChartRangeLabel').textContent=`${weightDateLabel(weightDate(plan.startDate,range.start))} – ${weightDateLabel(weightDate(plan.startDate,range.end))}`;
 document.getElementById('weightChartPrevious').disabled=!range.span||range.start===0;document.getElementById('weightChartNext').disabled=!range.span||range.end>=range.horizon;
}
function saveWeightPlan(event){
 event.preventDefault();
 const plan={startDate:document.getElementById('weightStartDate').value,startWeight:Number(document.getElementById('weightStart').value),direction:document.getElementById('weightDirection').value,rate:Number(document.getElementById('weightRate').value),endDate:document.getElementById('weightEndDate').value,startBF:weightBF(document.getElementById('weightStartBF').value),goalBF:weightBF(document.getElementById('weightGoalBF').value)};
 plan.weeks=(weightDay(plan.endDate)-weightDay(plan.startDate))/7;
 if(!Number.isFinite(new Date((weightDay(plan.startDate)+plan.weeks*7)*86400000).getTime())||!Number.isFinite(weightDay(plan.startDate))||plan.startDate>weightToday()||!Number.isFinite(plan.startWeight)||plan.startWeight<=0||!['loss','gain'].includes(plan.direction)||![.25,.5,1].includes(plan.rate)||!Number.isFinite(plan.weeks)||plan.weeks<=0||!Number.isFinite(weightTarget(plan,plan.weeks))||weightTarget(plan,plan.weeks)<=0||!validWeightBF(plan.startBF)||!validWeightBF(plan.goalBF)){toast('Choose an end date after the start date, a valid weight and optional body-fat percentages');return;}
 const tracking=db.weightTracking;
 if(tracking.entries.length&&tracking.plan&&(plan.startDate!==tracking.plan.startDate||plan.startWeight!==tracking.plan.startWeight)){toast('Keep the original start date and weight so weigh-ins stay aligned');return;}
 if(!tracking.entries.length){tracking.initialPlan={...plan};}else{tracking.initialPlan??={...tracking.plan};}
 tracking.plan=plan;syncWeightProjection(tracking);saveDB();renderWeightTracking();toast('Plan saved');
}
function saveWeeklyWeight(event){
 event.preventDefault();const tracking=db.weightTracking,plan=tracking.plan;if(!plan)return;
 const date=document.getElementById('weeklyWeightDate').value,weight=Number(document.getElementById('weeklyWeight').value),bodyFat=weightBF(document.getElementById('weeklyBF').value),week=weightWeek(plan,date);
 if(!Number.isFinite(weight)||weight<=0||!validWeightBF(bodyFat)||date>weightToday()||week===null){toast('Use a valid past or current date after the starting week, a weight, and optional body-fat %');return;}
 const existing=tracking.entries.findIndex(entry=>entry.week===week);
 if(existing>=0&&!confirm(`Replace the weigh-in for week ${week}?`))return;
 const entry={date,weight,bodyFat,week};if(existing>=0)tracking.entries[existing]=entry;else tracking.entries.push(entry);
 tracking.entries.sort((a,b)=>a.week-b.week);syncWeightProjection(tracking);saveDB();renderWeightTracking();toast(`Week ${week} weigh-in saved`);
}
function editWeeklyWeight(week){const entry=db.weightTracking.entries.find(e=>e.week===week);if(!entry)return;document.getElementById('weeklyWeightDate').value=entry.date;document.getElementById('weeklyWeight').value=entry.weight;document.getElementById('weeklyBF').value=entry.bodyFat??'';document.getElementById('weeklyWeightForm').scrollIntoView({behavior:'smooth',block:'center'});}
function deleteWeeklyWeight(week){if(!confirm(`Delete the week ${week} weigh-in?`))return;db.weightTracking.entries=db.weightTracking.entries.filter(e=>e.week!==week);syncWeightProjection(db.weightTracking);saveDB();renderWeightTracking();}
function renderWeightChart(id,series,range){
 series=series.map(s=>({...s,points:s.points.filter(p=>p.week>=range.start&&p.week<=range.end)}));
 const el=document.getElementById(id),all=series.flatMap(s=>s.points);
 if(!all.length){el.innerHTML='<p class="muted">No body-fat measurements in this period. Body-fat % is optional.</p>';return;}
 const W=640,H=260,L=52,R=16,T=18,B=36,min=Math.min(...all.map(p=>p.value)),max=Math.max(...all.map(p=>p.value)),pad=Math.max(2,(max-min)*.1),low=Math.max(0,min-pad),high=max+pad;
 const x=week=>L+(W-L-R)*(week-range.start)/(range.end-range.start),y=value=>T+(H-T-B)*(high-value)/(high-low);
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${id==='bodyWeightChart'?'Actual weight compared with your plan':'Estimated fat and non-fat weight over time'}">`;
 for(let i=0;i<5;i++){const value=low+(high-low)*i/4,cy=y(value);svg+=`<line x1="${L}" y1="${cy}" x2="${W-R}" y2="${cy}" stroke="#d5dfeb" stroke-width="1"/><text x="${L-8}" y="${cy+4}" text-anchor="end" fill="#66717d" font-size="12">${value.toFixed(0)}</text>`;}
 for(const week of [...new Set([range.start,Math.round(range.start+(range.end-range.start)/4),Math.round((range.start+range.end)/2),Math.round(range.start+(range.end-range.start)*3/4),range.end])])svg+=`<text x="${x(week)}" y="${H-10}" text-anchor="middle" fill="#66717d" font-size="12">W${Number(week.toFixed(1))}</text>`;
 series.forEach(s=>{if(!s.points.length)return;svg+=`<polyline points="${s.points.map(p=>`${x(p.week)},${y(p.value)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.dashed?2:3}" ${s.dashed?'stroke-dasharray="6 5"':''}/>`;if(!s.dashed)s.points.forEach(p=>svg+=`<circle cx="${x(p.week)}" cy="${y(p.value)}" r="4" fill="${s.color}"><title>${escapeHTML(s.name)} · Week ${p.week}: ${p.value.toFixed(1)} lb</title></circle>`);});
 svg+='</svg>';el.innerHTML=svg+`<div class="weight-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${escapeHTML(s.name)}${s.dashed?' (dashed)':''}</span>`).join('')}</div>`;
}
function renderWeightTracking(){
 document.querySelectorAll('#weight input[inputmode="decimal"]').forEach(input=>input.onfocus=()=>input.select());
 const tracking=db.weightTracking,plan=tracking.plan,locked=!!tracking.entries.length;
 document.getElementById('weightStartDate').value=plan?.startDate||weightToday();document.getElementById('weightStart').value=plan?.startWeight||'';
 document.getElementById('weightDirection').value=plan?.direction||'loss';document.getElementById('weightRate').value=plan?.rate||.5;
 document.getElementById('weightStartBF').value=plan?.startBF??'';document.getElementById('weightGoalBF').value=plan?.goalBF??'';document.getElementById('weightEndDate').value=plan?(plan.endDate||weightDate(plan.startDate,plan.weeks)):'';
 document.getElementById('weightStartDate').disabled=locked;document.getElementById('weightStart').disabled=locked;
 document.getElementById('weightDashboard').hidden=!plan;document.getElementById('weightPlanDetails').open=!plan;
 if(!plan)return;
 if(!tracking.initialPlan){tracking.initialPlan={...plan};saveDB();}
 syncWeightProjection(tracking);
 const entries=tracking.entries,horizon=Math.max(plan.weeks,entries.at(-1)?.week||0,Math.max(0,Math.round((weightDay(weightToday())-weightDay(plan.startDate))/7))),latest=entries.at(-1)||{week:0,date:plan.startDate,weight:plan.startWeight,bodyFat:plan.startBF};
 const compositionEntries=entries.filter(e=>validWeightBF(e.bodyFat)&&e.bodyFat!==null&&e.bodyFat!==undefined),baselineEntry=plan.startBF!==null&&plan.startBF!==undefined?{date:plan.startDate,weight:plan.startWeight,bodyFat:plan.startBF}:compositionEntries[0],lastComposition=compositionEntries.at(-1)||baselineEntry;
 const baseline=baselineEntry?weightComposition(baselineEntry.weight,baselineEntry.bodyFat):null,composition=lastComposition?weightComposition(lastComposition.weight,lastComposition.bodyFat):null,hasCompositionChange=!!(baseline&&composition&&baselineEntry.date!==lastComposition.date);
 document.getElementById('weightYearGoal').textContent=`End-date target: ${updatedWeightTarget(tracking,plan.weeks).toFixed(1)} lb · ${weightDateLabel(weightDate(plan.startDate,plan.weeks))}.`;
 document.getElementById('weightCurrent').textContent=latest.weight.toFixed(1);const gap=latest.weight-weightTarget(tracking.initialPlan,latest.week);const ahead=tracking.initialPlan.direction==='gain'?gap:-gap;document.getElementById('weightAheadStat').hidden=ahead<.05;document.getElementById('weightGap').textContent=ahead>=.05?ahead.toFixed(1):'';document.getElementById('weightPlanSummary').textContent=`${latest.week?'Week '+latest.week:'Starting measurement'} · ${weightDateLabel(latest.date)}.`;
 document.getElementById('weightRevisionSummary').textContent=tracking.updatedPlan?`Updated plan automatically follows your latest weigh-in: ${weightDateLabel(latest.date)} · ${latest.weight.toFixed(1)} lb. Your initial plan stays visible.`:'The updated line appears automatically after your first weigh-in.';
 document.getElementById('weightChange').textContent=weightSigned(latest.weight-plan.startWeight);
 document.getElementById('fatChange').textContent=hasCompositionChange?weightSigned(composition.fat-baseline.fat):'—';document.getElementById('nonFatChange').textContent=hasCompositionChange?weightSigned(composition.nonFat-baseline.nonFat):'—';
 document.getElementById('compositionAsOf').textContent=hasCompositionChange?`Estimated change from ${weightDateLabel(baselineEntry.date)} to ${weightDateLabel(lastComposition.date)}.`:baseline?'Save another weigh-in with body-fat % to calculate changes.':'Add body-fat % to two weigh-ins, or enter a starting body-fat % and a later weigh-in.';
 document.getElementById('weeklyWeightDate').value=weightToday();document.getElementById('weeklyWeight').value='';document.getElementById('weeklyBF').value='';
 const next=entries.length?latest.week+1:1;document.getElementById('weeklyDue').textContent=`Next check-in: ${weightDateLabel(weightDate(plan.startDate,next))} · Week ${next}.`;
 renderWeightCharts();
 document.getElementById('weeklyWeightLog').innerHTML=entries.length?entries.slice().reverse().map(e=>{const c=weightComposition(e.weight,e.bodyFat);return `<div class="weekly-entry"><div class="row between"><strong>Week ${e.week} · ${escapeHTML(weightDateLabel(e.date))}</strong><span><button class="secondary small" type="button" data-weight-edit="${e.week}">Edit</button> <button class="secondary small" type="button" data-weight-delete="${e.week}">Delete</button></span></div><p>${e.weight.toFixed(1)} lb${weightAheadLabel(tracking.initialPlan,e)}${c?`<br>Fat: ${c.fat.toFixed(1)} lb · Non-fat: ${c.nonFat.toFixed(1)} lb (${e.bodyFat}% body fat)`:''}</p></div>`;}).join(''):'<p class="muted">Your weekly weigh-ins will appear here.</p>';
 document.querySelectorAll('[data-weight-edit]').forEach(button=>button.onclick=()=>editWeeklyWeight(Number(button.dataset.weightEdit)));document.querySelectorAll('[data-weight-delete]').forEach(button=>button.onclick=()=>deleteWeeklyWeight(Number(button.dataset.weightDelete)));
 renderWeightPlanPage();
}
function renderWeightPlanPage(){
 const {plan,entries}=db.weightTracking;if(!plan)return;
 const horizon=Math.max(plan.weeks,entries.at(-1)?.week||0,Math.max(0,Math.round((weightDay(weightToday())-weightDay(plan.startDate))/7))),pages=Math.floor(horizon/26)+1;
 weightTablePage=Math.max(0,Math.min(pages-1,weightTablePage));
 const start=weightTablePage*26,end=Math.min(horizon,start+25);
 document.getElementById('weightPageLabel').textContent=`Weeks ${start}–${end} of ${horizon}. Targets continue as you keep tracking.`;
 document.getElementById('weightPagePrevious').disabled=weightTablePage===0;document.getElementById('weightPageNext').disabled=weightTablePage===pages-1;
 document.getElementById('weightPlanRows').innerHTML=Array.from({length:end-start+1},(_,i)=>{const week=start+i,value=weightTarget(db.weightTracking.initialPlan||plan,week),updated=db.weightTracking.updatedPlan&&week>=db.weightTracking.updatedPlan.week?updatedWeightTarget(db.weightTracking,week):null,e=entries.find(e=>e.week===week)||(week===0?{weight:plan.startWeight,bodyFat:plan.startBF}:null),c=e?weightComposition(e.weight,e.bodyFat):null;return `<tr><th scope="row">${week}</th><td>${escapeHTML(weightDateLabel(weightDate(plan.startDate,week)))}</td><td>${value.toFixed(1)}</td><td>${updated===null?'—':updated.toFixed(1)}</td><td>${e?e.weight.toFixed(1):'—'}</td><td>${e?weightAheadLabel(db.weightTracking.initialPlan||plan,{...e,week}).replace(' · ',''):''}</td><td>${c?c.fat.toFixed(1):'—'}</td><td>${c?c.nonFat.toFixed(1):'—'}</td></tr>`;}).join('');
}
function changeWeightPlanPage(direction){weightTablePage+=direction;renderWeightPlanPage();}
