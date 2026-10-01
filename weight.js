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
function weightPlanComposition(plan,week){if(plan.startBF===null||plan.goalBF===null)return null;return weightComposition(weightTarget(plan,week),plan.startBF+(plan.goalBF-plan.startBF)*Math.min(1,week/plan.weeks));}
function updatedWeightTarget(tracking,week){
 const updated=tracking.updatedPlan;
 return updated&&week>=updated.week?updated.weight*Math.pow(1+(updated.direction==='loss'?-1:1)*updated.rate/100,week-updated.week):weightTarget(tracking.initialPlan||tracking.plan,week);
}
function updateWeightProjection(){
 const tracking=db.weightTracking,entry=tracking.entries.at(-1);
 if(!entry){toast('Save a weigh-in first');return;}
 tracking.initialPlan??={...tracking.plan};
 tracking.updatedPlan={week:entry.week,date:entry.date,weight:entry.weight,rate:tracking.plan.rate,direction:tracking.plan.direction};
 saveDB();renderWeightTracking();toast('Updated projection added; initial plan preserved');
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
 const original=tracking.initialPlan||plan,entries=tracking.entries,range=weightChartWindow(plan,entries),count=Math.min(range.end-range.start,104);
 const weeks=Array.from({length:count+1},(_,i)=>Math.round(range.start+i*(range.end-range.start)/count));
 const actual=[{week:0,value:plan.startWeight},...entries.map(e=>({week:e.week,value:e.weight}))];
 const series=[{name:'Actual weight',color:'#1679b9',points:actual},{name:'Initial plan',color:'#7b8495',dashed:true,points:weeks.map(week=>({week,value:weightTarget(original,week)}))}];
 if(tracking.updatedPlan){const start=Math.max(range.start,tracking.updatedPlan.week);const updatedWeeks=[...new Set([start,...weeks.filter(week=>week>=start)])].filter(week=>week<=range.end);series.push({name:'Updated plan',color:'#8b4eb6',dashed:true,points:updatedWeeks.map(week=>({week,value:updatedWeightTarget(tracking,week)}))});}
 renderWeightChart('bodyWeightChart',series,range);
 const samples=[{week:0,weight:plan.startWeight,bodyFat:plan.startBF},...entries].filter(e=>e.bodyFat!==null&&e.bodyFat!==undefined);
 const compositionSeries=[{name:'Estimated fat',color:'#c05a24',points:samples.map(e=>({week:e.week,value:weightComposition(e.weight,e.bodyFat).fat}))},{name:'Non-fat weight',color:'#147966',points:samples.map(e=>({week:e.week,value:weightComposition(e.weight,e.bodyFat).nonFat}))}];
 if(original.startBF!==null&&original.goalBF!==null)compositionSeries.push({name:'Initial planned fat',color:'#c05a24',dashed:true,points:weeks.map(week=>({week,value:weightPlanComposition(original,week).fat}))},{name:'Initial planned non-fat',color:'#147966',dashed:true,points:weeks.map(week=>({week,value:weightPlanComposition(original,week).nonFat}))});
 renderWeightChart('compositionWeightChart',compositionSeries,range);
 document.getElementById('weightChartRangeLabel').textContent=`${weightDateLabel(weightDate(plan.startDate,range.start))} – ${weightDateLabel(weightDate(plan.startDate,range.end))}`;
 document.getElementById('weightChartPrevious').disabled=!range.span||range.start===0;document.getElementById('weightChartNext').disabled=!range.span||range.end>=range.horizon;
}
function saveWeightPlan(event){
 event.preventDefault();
 const plan={startDate:document.getElementById('weightStartDate').value,startWeight:Number(document.getElementById('weightStart').value),direction:document.getElementById('weightDirection').value,rate:Number(document.getElementById('weightRate').value),weeks:Number(document.getElementById('weightPlanWeeks').value),startBF:weightBF(document.getElementById('weightStartBF').value),goalBF:weightBF(document.getElementById('weightGoalBF').value)};
 if(!Number.isFinite(new Date((weightDay(plan.startDate)+plan.weeks*7)*86400000).getTime())||!Number.isFinite(weightDay(plan.startDate))||plan.startDate>weightToday()||!Number.isFinite(plan.startWeight)||plan.startWeight<=0||!['loss','gain'].includes(plan.direction)||![.25,.5,1].includes(plan.rate)||!Number.isInteger(plan.weeks)||plan.weeks<1||!Number.isFinite(weightTarget(plan,plan.weeks))||weightTarget(plan,plan.weeks)<=0||!validWeightBF(plan.startBF)||!validWeightBF(plan.goalBF)){toast('Check the start date, weight and optional body-fat percentages');return;}
 const tracking=db.weightTracking;
 if(tracking.entries.length&&tracking.plan&&(plan.startDate!==tracking.plan.startDate||plan.startWeight!==tracking.plan.startWeight)){toast('Keep the original start date and weight so weigh-ins stay aligned');return;}
 if(!tracking.entries.length){tracking.initialPlan={...plan};tracking.updatedPlan=null;}else{tracking.initialPlan??={...tracking.plan};if(plan.rate!==tracking.plan.rate||plan.direction!==tracking.plan.direction){const entry=tracking.entries.at(-1);tracking.updatedPlan={week:entry.week,date:entry.date,weight:entry.weight,rate:plan.rate,direction:plan.direction};}}
 tracking.plan=plan;saveDB();renderWeightTracking();toast('Plan saved');
}
function saveWeeklyWeight(event){
 event.preventDefault();const tracking=db.weightTracking,plan=tracking.plan;if(!plan)return;
 const date=document.getElementById('weeklyWeightDate').value,weight=Number(document.getElementById('weeklyWeight').value),bodyFat=weightBF(document.getElementById('weeklyBF').value),week=weightWeek(plan,date);
 if(!Number.isFinite(weight)||weight<=0||!validWeightBF(bodyFat)||date>weightToday()||week===null){toast('Use a valid past or current date after the starting week, a weight, and optional body-fat %');return;}
 const existing=tracking.entries.findIndex(entry=>entry.week===week);
 if(existing>=0&&!confirm(`Replace the weigh-in for week ${week}?`))return;
 const entry={date,weight,bodyFat,week};if(existing>=0)tracking.entries[existing]=entry;else tracking.entries.push(entry);
 tracking.entries.sort((a,b)=>a.week-b.week);saveDB();renderWeightTracking();toast(`Week ${week} weigh-in saved`);
}
function editWeeklyWeight(week){const entry=db.weightTracking.entries.find(e=>e.week===week);if(!entry)return;document.getElementById('weeklyWeightDate').value=entry.date;document.getElementById('weeklyWeight').value=entry.weight;document.getElementById('weeklyBF').value=entry.bodyFat??'';document.getElementById('weeklyWeightForm').scrollIntoView({behavior:'smooth',block:'center'});}
function deleteWeeklyWeight(week){if(!confirm(`Delete the week ${week} weigh-in?`))return;db.weightTracking.entries=db.weightTracking.entries.filter(e=>e.week!==week);saveDB();renderWeightTracking();}
function renderWeightChart(id,series,range){
 series=series.map(s=>({...s,points:s.points.filter(p=>p.week>=range.start&&p.week<=range.end)}));
 const el=document.getElementById(id),all=series.flatMap(s=>s.points);
 if(!all.length){el.innerHTML='<p class="muted">No body-fat measurements in this period. Body-fat % is optional.</p>';return;}
 const W=640,H=260,L=52,R=16,T=18,B=36,min=Math.min(...all.map(p=>p.value)),max=Math.max(...all.map(p=>p.value)),pad=Math.max(2,(max-min)*.1),low=Math.max(0,min-pad),high=max+pad;
 const x=week=>L+(W-L-R)*(week-range.start)/(range.end-range.start),y=value=>T+(H-T-B)*(high-value)/(high-low);
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${id==='bodyWeightChart'?'Actual weight compared with your plan':'Estimated fat and non-fat weight over time'}">`;
 for(let i=0;i<5;i++){const value=low+(high-low)*i/4,cy=y(value);svg+=`<line x1="${L}" y1="${cy}" x2="${W-R}" y2="${cy}" stroke="#d5dfeb" stroke-width="1"/><text x="${L-8}" y="${cy+4}" text-anchor="end" fill="#66717d" font-size="12">${value.toFixed(0)}</text>`;}
 for(const week of [...new Set([range.start,Math.round(range.start+(range.end-range.start)/4),Math.round((range.start+range.end)/2),Math.round(range.start+(range.end-range.start)*3/4),range.end])])svg+=`<text x="${x(week)}" y="${H-10}" text-anchor="middle" fill="#66717d" font-size="12">W${week}</text>`;
 series.forEach(s=>{if(!s.points.length)return;svg+=`<polyline points="${s.points.map(p=>`${x(p.week)},${y(p.value)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.dashed?2:3}" ${s.dashed?'stroke-dasharray="6 5"':''}/>`;if(!s.dashed)s.points.forEach(p=>svg+=`<circle cx="${x(p.week)}" cy="${y(p.value)}" r="4" fill="${s.color}"><title>${escapeHTML(s.name)} · Week ${p.week}: ${p.value.toFixed(1)} lb</title></circle>`);});
 svg+='</svg>';el.innerHTML=svg+`<div class="weight-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${escapeHTML(s.name)}${s.dashed?' (dashed)':''}</span>`).join('')}</div>`;
}
function renderWeightTracking(){
 document.querySelectorAll('#weight input[inputmode="decimal"]').forEach(input=>input.onfocus=()=>input.select());
 const tracking=db.weightTracking,plan=tracking.plan,locked=!!tracking.entries.length;
 document.getElementById('weightStartDate').value=plan?.startDate||weightToday();document.getElementById('weightStart').value=plan?.startWeight||'';
 document.getElementById('weightDirection').value=plan?.direction||'loss';document.getElementById('weightRate').value=plan?.rate||.5;
 document.getElementById('weightStartBF').value=plan?.startBF??'';document.getElementById('weightGoalBF').value=plan?.goalBF??'';document.getElementById('weightPlanWeeks').value=plan?.weeks||52;
 document.getElementById('weightStartDate').disabled=locked;document.getElementById('weightStart').disabled=locked;
 document.getElementById('weightDashboard').hidden=!plan;document.getElementById('weightPlanDetails').open=!plan;
 if(!plan)return;
 if(!tracking.initialPlan){tracking.initialPlan={...plan};saveDB();}
 const entries=tracking.entries,horizon=Math.max(plan.weeks,entries.at(-1)?.week||0,Math.max(0,Math.round((weightDay(weightToday())-weightDay(plan.startDate))/7))),latest=entries.at(-1)||{week:0,date:plan.startDate,weight:plan.startWeight,bodyFat:plan.startBF};
 const baseline=weightComposition(plan.startWeight,plan.startBF),compositionEntries=entries.filter(e=>e.bodyFat!==null&&e.bodyFat!==undefined),lastComposition=compositionEntries.at(-1)||{date:plan.startDate,weight:plan.startWeight,bodyFat:plan.startBF},composition=weightComposition(lastComposition.weight,lastComposition.bodyFat);
 document.getElementById('weightYearGoal').textContent=`Week ${plan.weeks} target: ${updatedWeightTarget(tracking,plan.weeks).toFixed(1)} lb · ${weightDateLabel(weightDate(plan.startDate,plan.weeks))}.`;
 document.getElementById('weightCurrent').textContent=latest.weight.toFixed(1);const gap=latest.weight-updatedWeightTarget(tracking,latest.week);document.getElementById('weightGap').textContent=`${gap>0?'+':''}${gap.toFixed(1)}`;document.getElementById('weightPlanSummary').textContent=`${latest.week?'Week '+latest.week:'Starting measurement'} · ${weightDateLabel(latest.date)}. Positive is above plan; negative is below.`;
 document.getElementById('weightRevisionSummary').textContent=tracking.updatedPlan?`Updated from week ${tracking.updatedPlan.week}: ${tracking.updatedPlan.weight.toFixed(1)} lb. Latest weigh-in vs initial plan: ${weightSigned(latest.weight-weightTarget(tracking.initialPlan,latest.week))}.`:'Your initial plan stays on the chart when you update the projection.';document.getElementById('updateWeightProjection').disabled=!entries.length;
 document.getElementById('weightChange').textContent=weightSigned(latest.weight-plan.startWeight);
 document.getElementById('fatChange').textContent=baseline&&composition?weightSigned(composition.fat-baseline.fat):'—';document.getElementById('nonFatChange').textContent=baseline&&composition?weightSigned(composition.nonFat-baseline.nonFat):'—';
 document.getElementById('compositionAsOf').textContent=baseline&&composition?`Composition changes estimated as of ${weightDateLabel(lastComposition.date)}.`:'Enter starting body-fat % and body-fat % at weigh-ins to estimate composition changes.';
 document.getElementById('weeklyWeightDate').value=weightToday();document.getElementById('weeklyWeight').value='';document.getElementById('weeklyBF').value='';
 const next=entries.length?latest.week+1:1;document.getElementById('weeklyDue').textContent=`Next check-in: ${weightDateLabel(weightDate(plan.startDate,next))} · Week ${next}.`;
 renderWeightCharts();
 document.getElementById('weeklyWeightLog').innerHTML=entries.length?entries.slice().reverse().map(e=>{const c=weightComposition(e.weight,e.bodyFat);return `<div class="weekly-entry"><div class="row between"><strong>Week ${e.week} · ${escapeHTML(weightDateLabel(e.date))}</strong><span><button class="secondary small" type="button" data-weight-edit="${e.week}">Edit</button> <button class="secondary small" type="button" data-weight-delete="${e.week}">Delete</button></span></div><p>${e.weight.toFixed(1)} lb · ${weightSigned(e.weight-updatedWeightTarget(tracking,e.week))} vs plan${c?`<br>Fat: ${c.fat.toFixed(1)} lb · Non-fat: ${c.nonFat.toFixed(1)} lb (${e.bodyFat}% body fat)`:''}</p></div>`;}).join(''):'<p class="muted">Your weekly weigh-ins will appear here.</p>';
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
 document.getElementById('weightPlanRows').innerHTML=Array.from({length:end-start+1},(_,i)=>{const week=start+i,value=weightTarget(db.weightTracking.initialPlan||plan,week),updated=db.weightTracking.updatedPlan&&week>=db.weightTracking.updatedPlan.week?updatedWeightTarget(db.weightTracking,week):null,e=entries.find(e=>e.week===week)||(week===0?{weight:plan.startWeight,bodyFat:plan.startBF}:null),c=e?weightComposition(e.weight,e.bodyFat):null;return `<tr><th scope="row">${week}</th><td>${escapeHTML(weightDateLabel(weightDate(plan.startDate,week)))}</td><td>${value.toFixed(1)}</td><td>${updated===null?'—':updated.toFixed(1)}</td><td>${e?e.weight.toFixed(1):'—'}</td><td>${e?weightSigned(e.weight-(updated??value)):'—'}</td><td>${c?c.fat.toFixed(1):'—'}</td><td>${c?c.nonFat.toFixed(1):'—'}</td></tr>`;}).join('');
}
function changeWeightPlanPage(direction){weightTablePage+=direction;renderWeightPlanPage();}
