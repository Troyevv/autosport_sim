const TOTAL_LAPS = 58;
const COMPOUNDS = {
  S: { name: 'Soft', title: 'Мягкие', color: '#d35361', wear: 1.35, pace: .991 },
  M: { name: 'Medium', title: 'Средние', color: '#d7b469', wear: .88, pace: 1 },
  H: { name: 'Hard', title: 'Жёсткие', color: '#d9dee6', wear: .56, pace: 1.007 },
};
const GRID = [
  ['sil','Д. Силва','SIL','AURORA Motorsport','#82b5bd',0,'M',81,91],
  ['rin','М. Ринальди','RIN','SCUDERIA Rosso','#b9414f',2.1,'M',79,90],
  ['war','О. Уорд','WAR','NORTHSTAR Racing','#e6c66d',4.8,'S',57,91],
  ['kel','А. Келлер','KEL','VANTA Racing','#c83b4d',6.4,'M',76,89],
  ['lau','А. Лоран','LAU','AURORA Motorsport','#82b5bd',9.7,'M',74,88],
  ['mor','Т. Моро','MOR','TITAN GP','#8b84b2',13.4,'S',54,86],
  ['and','Н. Андерсен','AND','NORTHSTAR Racing','#e6c66d',17.2,'H',89,88],
  ['web','Л. Вебер','WEB','VANTA Racing','#c83b4d',18.3,'M',81,87],
  ['kos','И. Коста','KOS','SCUDERIA Rosso','#b9414f',22.1,'M',78,85],
  ['tan','К. Танака','TAN','NOVA Motorsport','#e2946d',26.9,'M',79,85],
  ['rom','М. Ромеро','ROM','ORION Racing','#a38ac2',30.1,'S',52,84],
  ['lee','Д. Ли','LEE','NOVA Motorsport','#e2946d',34.3,'H',91,83],
  ['dup','Л. Дюпон','DUP','TITAN GP','#8b84b2',37.1,'M',76,82],
  ['pet','М. Петров','PET','ATLAS Motorsport','#85a79c',41.8,'M',80,83],
  ['sch','Ф. Шмидт','SCH','ORION Racing','#a38ac2',46.4,'S',53,82],
  ['alb','Р. Альба','ALB','SOLAR Racing','#b28c7a',49.7,'M',77,81],
  ['kim','А. Ким','KIM','ATLAS Motorsport','#85a79c',53.1,'H',92,80],
  ['fer','П. Ферро','FER','SOLAR Racing','#b28c7a',58.6,'M',81,80],
  ['eri','Л. Эриксен','ERI','NORTH Racing','#7796b5',63.3,'M',78,79],
  ['bat','Н. Батлер','BAT','NORTH Racing','#7796b5',68.5,'H',90,79],
];

function newRace() {
  return {
    elapsed: 1213, running: false, speed: 1, selected: 'kel', intervals: false, finished: false,
    events: [
      { lap: 14, text: 'Келлер: «Баланс хороший. На выходе из медленных поворотов теряем немного сцепления».', kind: 'radio', who: 'КЕЛ' },
      { lap: 13, text: 'Уорд на мягких шинах теряет темп. Окно атаки для Келлера.', kind: 'strategy', who: 'СТРАТЕГ' },
      { lap: 12, text: 'Вебер сохранил шины. План А: первый пит-стоп на 25-м круге.', kind: 'radio', who: 'ВЕБ' },
    ],
    drivers: GRID.map(([id,name,code,team,color,gap,compound,tyres,rating],i)=>({
      id,name,code,team,color,progress:13.43-gap/89.6,compound,tyres,rating,
      lapTime:89.2+i*.053, lastLap:89.2+i*.09, bestLap:88.98+i*.075,
      ers:id==='kel'?68:id==='web'?82:65, pace:'balanced', energy:'balanced', stops:0,
      pitQueued:null,pitTime:0, pitNew:null, tyreAge:13, fuel:1.8,
    })),
  };
}

function fmtLap(t) { return `${Math.floor(t/60)}:${(t%60).toFixed(3).padStart(6,'0')}`; }
function safe(text) { return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shortTime(t) { return `${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`; }

// The circuit is deliberately fictional, so it can be used as a visual reference.
const TRACK_POINTS = [[.13,.66],[.11,.42],[.17,.23],[.33,.18],[.48,.24],[.63,.19],[.79,.21],[.88,.33],[.82,.43],[.66,.44],[.57,.38],[.49,.43],[.56,.55],[.72,.61],[.77,.75],[.65,.84],[.51,.79],[.40,.65],[.29,.73],[.19,.77]];
function makeTrack() {
  const out=[];
  for(let i=0;i<TRACK_POINTS.length;i++){
    const p0=TRACK_POINTS[(i-1+TRACK_POINTS.length)%TRACK_POINTS.length],p1=TRACK_POINTS[i],p2=TRACK_POINTS[(i+1)%TRACK_POINTS.length],p3=TRACK_POINTS[(i+2)%TRACK_POINTS.length];
    for(let j=0;j<25;j++){
      const t=j/25,t2=t*t,t3=t2*t;
      out.push([0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)));
    }
  }
  const len=[0]; let total=0;
  for(let i=1;i<=out.length;i++){const a=out[i-1],b=out[i%out.length];total+=Math.hypot(a[0]-b[0],a[1]-b[1]);len.push(total);}
  return {points:out,lengths:len,total};
}
const CIRCUIT=makeTrack();
function trackPoint(s){
  const target=(((s%1)+1)%1)*CIRCUIT.total;
  let lo=0,hi=CIRCUIT.points.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(CIRCUIT.lengths[mid]<=target)lo=mid;else hi=mid-1;}
  const a=CIRCUIT.points[lo],b=CIRCUIT.points[(lo+1)%CIRCUIT.points.length],t=(target-CIRCUIT.lengths[lo])/(CIRCUIT.lengths[lo+1]-CIRCUIT.lengths[lo]);
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}

export function mountRace(container,ctx){
  const saved=ctx.state.raceDemo;
  let r=saved?.drivers?.length===20 ? structuredClone(saved) : newRace();
  r.running=false;
  const canCommand=ctx.state.role==='manager';
  const discipline=ctx.state.discipline || 'formula';
  const series=discipline==='gt'?'GT WORLD SERIES':discipline==='endurance'?'ENDURANCE WORLD SERIES':'FORMULA WORLD';
  let raf=0,last=0,uiElapsed=0,disposed=false,dialog=null;
  const icon=(n,s=17)=>ctx.icon?ctx.icon(n,s):'';
  const sorted=()=>[...r.drivers].sort((a,b)=>b.progress-a.progress);
  const lap=()=>Math.min(TOTAL_LAPS,Math.floor(sorted()[0].progress)+1);
  const save=()=>{ctx.setState?.({raceDemo:structuredClone({...r,running:false})});};

  function driverCard(id){
    const d=r.drivers.find(x=>x.id===id),isKel=id==='kel';
    return `<section class="race-driver ${isKel?'race-driver-a':'race-driver-b'}" data-driver="${id}">
      <div class="race-driver-heading"><button class="race-driver-identity" data-action="observe" data-id="${id}" aria-label="Наблюдать за ${isKel?'Келлером':'Вебером'}"><span class="race-number">${isKel?'17':'24'}</span><span><small>${isKel?'Адриан':'Лукас'}</small><strong>${isKel?'КЕЛЛЕР':'ВЕБЕР'}</strong></span></button><div class="race-driver-pos"><b data-field="pos">P${isKel?'4':'8'}</b><span data-field="gap">+${isKel?'6.400':'18.300'}</span></div></div>
      <div class="race-driver-stats"><div><span>ПОСЛЕДНИЙ КРУГ</span><b data-field="lastlap">${fmtLap(d.lastLap)}</b></div><div><span>КОМПЛЕКТ</span><b class="race-tyre-readout"><i data-field="tyrechip" class="race-tyre race-tyre-${d.compound}">${d.compound}</i><span data-field="age">13 кругов</span></b></div></div>
      <div class="race-resource"><span>Шины <b data-field="tyres">${d.tyres}%</b></span><div class="race-resource-track"><i data-field="tyrebar" style="width:${d.tyres}%;background:${COMPOUNDS[d.compound].color}"></i></div></div>
      <div class="race-resource"><span>Энергия <b data-field="ers">${d.ers}%</b></span><div class="race-resource-track"><i data-field="ersbar" style="width:${d.ers}%;background:#83aab6"></i></div></div>
      ${canCommand?`<div class="race-command-label"><span>ТЕМП</span><span data-field="pacecaption">По плану</span></div><div class="race-segmented race-pace" role="group" aria-label="Темп ${d.name}">${[['save','Беречь'],['balanced','Баланс'],['attack','Атака']].map(([v,l])=>`<button data-action="pace" data-id="${id}" data-value="${v}" class="${d.pace===v?'is-active':''}">${l}</button>`).join('')}</div>
      <div class="race-driver-actions"><label class="race-ers-label">Энергия<select aria-label="Энергия ${d.name}" data-action="energy" data-id="${id}"><option value="save" ${d.energy==='save'?'selected':''}>Накопление</option><option value="balanced" ${d.energy==='balanced'?'selected':''}>Баланс</option><option value="attack" ${d.energy==='attack'?'selected':''}>Расход</option></select></label><button class="race-pit-btn" data-action="pit" data-id="${id}">${icon('wrench',15)}<span data-field="pitlabel">${d.pitQueued?'Пит запланирован':'В боксы'}</span></button></div>`:`<div class="race-delegated">${icon('headphones',16)} <span>${ctx.state.role==='owner'?'Стратегия делегирована менеджеру':'Наблюдение за клиентской командой'}</span></div><button class="race-observe-wide" data-action="observe" data-id="${id}">${icon('crosshair',15)} Наблюдать за пилотом</button>`}
    </section>`;
  }

  container.innerHTML=`<div class="race-screen">
    <header class="screen-head race-screen-head"><div><div class="eyebrow">ГОНОЧНЫЙ УИК-ЭНД <span class="race-eyebrow-separator">/</span> ЭТАП 06 · ${series}</div><h1>Гоночный центр</h1><p class="race-page-subtitle">Гран-при Лазурного берега <span>·</span> 21 мая 2028</p></div><button class="btn race-briefing-btn" data-action="briefing">${icon('clipboard-list',17)} Брифинг</button></header>
    <div class="race-sessionbar"><div class="race-session-state"><span class="race-status-light"></span><span data-race="status">ГОНКА ПРИОСТАНОВЛЕНА</span><span class="race-demo-label">Демонстрация гонки</span></div><div class="race-session-controls"><span class="race-clock" data-race="clock">20:13</span><div class="race-speed" role="group" aria-label="Скорость демонстрации">${[1,4,16].map(s=>`<button data-action="speed" data-speed="${s}" class="${r.speed===s?'is-active':''}" aria-label="Скорость ${s}x">${s}×</button>`).join('')}</div><button class="race-play" data-action="play" aria-label="Начать гонку">${icon('play',15)}<span>Продолжить</span></button></div></div>
    <div class="race-layout"><div class="race-primary">
      <section class="race-map-panel"><div class="race-map-top"><div class="race-lap"><small>КРУГ</small><strong data-race="lap">14</strong><span>/ 58</span></div><div class="race-conditions"><div>${icon('sun',17)}<span><b>26°</b><small>ВОЗДУХ</small></span></div><div>${icon('thermometer',16)}<span><b>38°</b><small>ТРАССА</small></span></div><div class="race-rain-condition">${icon('cloud-drizzle',17)}<span><b>15%</b><small>ДОЖДЬ</small></span></div></div></div>
        <div class="race-map-stage"><canvas class="race-canvas" aria-label="Схематическая карта трассы с положением двадцати автомобилей" role="img"></canvas><div class="race-sector-label race-sector-s1"><i></i>СЕКТОР 1</div><div class="race-sector-label race-sector-s2"><i></i>СЕКТОР 2</div><div class="race-sector-label race-sector-s3"><i></i>СЕКТОР 3</div><div class="race-track-watermark">CÔTE D’AZUR<small>4.82 KM · 18 ПОВОРОТОВ</small></div><div class="race-map-scale"><span></span>200 м</div><button class="race-follow-button" data-action="follow">${icon('crosshair',14)}<span data-race="observed">КЕЛ · P4</span></button></div>
        <div class="race-map-footer"><span><i class="race-legend-own"></i> VANTA Racing</span><span><i class="race-legend-other"></i> Соперники</span><span class="race-map-help">Выбери пилота в тайминге</span></div>
      </section>
      <div class="race-driver-grid">${driverCard('kel')}${driverCard('web')}</div>
    </div>
    <aside class="race-timing"><div class="race-panel-heading"><h2>Хронометраж</h2><button data-action="intervals" class="race-text-button" data-race="gapmode">${r.intervals?'Интервалы':'От лидера'}</button></div><div class="race-table-head"><span>ПОЗ.</span><span>ПИЛОТ</span><span>ОТРЫВ</span><span>ШИНЫ</span></div><div class="race-timing-rows" role="list" aria-label="Положение пилотов"></div><div class="race-bestlap">${icon('timer',15)}<span>ЛУЧШИЙ КРУГ<b>Силва · 1:28.980</b></span><i>+1</i></div></aside></div>
    <div class="race-bottom-grid"><section class="race-strategy-panel"><div class="race-panel-heading"><h2>${icon('route',17)} Стратегия</h2><span class="race-tag">ПЛАН А</span></div><div class="race-strategy-copy"><strong>Один пит-стоп. Сохраняем темп.</strong><span>Окно остановки: <b>23–27 круг</b> · Потеря на пит-лейн: 22,4 с</span></div><div class="race-stint-plan"><div class="race-stint race-stint-medium"><span>M</span><b>СТАРТ</b></div><div class="race-stint-stop">${icon('wrench',13)}<small>25</small></div><div class="race-stint race-stint-hard"><span>H</span><b>ФИНИШ</b></div><div class="race-strategy-cursor" data-race="strategycursor" style="left:23%"><i></i><span>14</span></div></div><div class="race-forecast"><span>ПРОГНОЗ</span><div>${icon('sun',15)}<b>Сейчас</b><small>26°</small></div><div>${icon('cloud-sun',15)}<b>+15 мин</b><small>25°</small></div><div>${icon('cloud',15)}<b>+30 мин</b><small>24°</small></div><span class="race-forecast-note">Сухая трасса</span></div></section>
    <section class="race-radio-panel"><div class="race-panel-heading"><h2>${icon('radio',17)} Командное радио</h2><span class="race-radio-live">LIVE</span></div><div class="race-events" aria-live="polite"></div></section></div>
    <div class="race-disclaimer">Вымышленный уик-энд · демонстрационная симуляция с ускоренным временем · результаты не меняют чемпионат</div>
  </div>`;

  const canvas=container.querySelector('.race-canvas'),g=canvas.getContext('2d');
  const $=s=>container.querySelector(s);
  let cssWidth=600,cssHeight=360,scale=1;
  function resize(){
    const box=canvas.getBoundingClientRect();cssWidth=Math.max(1,box.width);cssHeight=Math.max(1,box.height);scale=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(cssWidth*scale);canvas.height=Math.round(cssHeight*scale);g.setTransform(scale,0,0,scale,0,0);draw();
  }
  const ro=new ResizeObserver(resize);ro.observe(canvas);

  function addEvent(text,kind='strategy',who='ИНЖЕНЕР'){
    r.events.unshift({lap:lap(),text,kind,who});r.events=r.events.slice(0,12);renderEvents();
  }
  function renderEvents(){
    $('.race-events').innerHTML=r.events.slice(0,3).map(e=>`<div class="race-event"><span class="race-event-lap">${e.lap}<small>КРУГ</small></span><div><span class="race-event-who ${e.kind==='radio'?'race-event-radio':''}">${safe(e.who)}</span><p>${safe(e.text)}</p></div></div>`).join('');
  }
  function updateUI(){
    const order=sorted(),leader=order[0];
    $('[data-race="lap"]').textContent=lap();
    $('[data-race="clock"]').textContent=shortTime(r.elapsed);
    $('[data-race="status"]').textContent=r.finished?'КЛЕТЧАТЫЙ ФЛАГ':r.running?'ГОНКА · ЗЕЛЁНЫЙ ФЛАГ':'ГОНКА ПРИОСТАНОВЛЕНА';
    $('.race-session-state').classList.toggle('is-running',r.running);
    $('.race-play').innerHTML=`${icon(r.running?'pause':r.finished?'rotate-ccw':'play',15)}<span>${r.running?'Пауза':r.finished?'Новая гонка':'Продолжить'}</span>`;
    $('.race-play').setAttribute('aria-label',r.running?'Приостановить гонку':r.finished?'Начать новую гонку':'Продолжить гонку');
    container.querySelectorAll('[data-action="speed"]').forEach(b=>b.classList.toggle('is-active',Number(b.dataset.speed)===r.speed));
    const focusedDriver=document.activeElement?.closest('.race-timing-row')?.dataset.id;
    $('.race-timing-rows').innerHTML=order.map((d,i)=>{
      const ref=r.intervals&&i?order[i-1]:leader,gap=(ref.progress-d.progress)*89.6;
      return `<button class="race-timing-row ${d.team==='VANTA Racing'?'race-own-row':''} ${d.id===r.selected?'is-selected':''}" role="listitem" data-action="observe" data-id="${d.id}" aria-label="${i+1} место, ${safe(d.name)}, ${Math.round(d.tyres)} процентов шин"><span class="race-position">${i+1}</span><span class="race-timing-driver"><i style="background:${d.color}"></i><b>${safe(d.name)}</b>${d.pitTime>0?'<em>PIT</em>':d.pitQueued?'<em class="race-pit-queued">P</em>':''}</span><span class="race-gap">${i?`+${gap.toFixed(3)}`:'ЛИДЕР'}</span><span class="race-timing-tyres"><i class="race-tyre race-tyre-${d.compound}">${d.compound}</i><small>${Math.round(d.tyres)}%</small></span></button>`;
    }).join('');
    if(focusedDriver)$(`.race-timing-row[data-id="${focusedDriver}"]`)?.focus({preventScroll:true});
    for(const id of ['kel','web']){
      const d=r.drivers.find(x=>x.id===id),card=$(`[data-driver="${id}"]`),set=(k,v)=>{const el=card.querySelector(`[data-field="${k}"]`);if(el)el.textContent=v;};
      card.classList.toggle('is-observed',id===r.selected);
      set('pos',`P${order.indexOf(d)+1}`);set('gap',`+${((leader.progress-d.progress)*89.6).toFixed(3)}`);set('lastlap',fmtLap(d.lastLap));set('age',`${d.tyreAge} круг.`);set('tyres',`${Math.round(d.tyres)}%`);set('ers',`${Math.round(d.ers)}%`);
      set('pitlabel',d.pitTime>0?'Пит-стоп…':d.pitQueued?`Пит → ${d.pitQueued}`:'В боксы');set('pacecaption',d.pace==='attack'?'Атаковать':d.pace==='save'?'Сохранение шин':'По плану');
      const tyre=card.querySelector('[data-field="tyrechip"]');tyre.className=`race-tyre race-tyre-${d.compound}`;tyre.textContent=d.compound;
      card.querySelector('[data-field="tyrebar"]').style.width=`${d.tyres}%`;card.querySelector('[data-field="tyrebar"]').style.background=COMPOUNDS[d.compound].color;card.querySelector('[data-field="ersbar"]').style.width=`${d.ers}%`;
      card.querySelectorAll('[data-action="pace"]').forEach(b=>b.classList.toggle('is-active',b.dataset.value===d.pace));
    }
    const watched=order.find(d=>d.id===r.selected);$('[data-race="observed"]').textContent=`${watched.code} · P${order.indexOf(watched)+1}`;
    const cursor=$('[data-race="strategycursor"]');cursor.style.left=`${Math.min(98,lap()/TOTAL_LAPS*100)}%`;cursor.querySelector('span').textContent=lap();
  }

  function draw(){
    if(!g||disposed)return;
    const w=cssWidth,h=cssHeight;g.clearRect(0,0,w,h);
    const x=v=>v*w,y=v=>v*h;
    g.strokeStyle='rgba(95,112,130,.065)';g.lineWidth=1;
    for(let xx=10;xx<w;xx+=30){g.beginPath();g.moveTo(xx,0);g.lineTo(xx,h);g.stroke();}
    for(let yy=10;yy<h;yy+=30){g.beginPath();g.moveTo(0,yy);g.lineTo(w,yy);g.stroke();}
    // A quiet coastline gives the circuit its own character without competing with the data.
    g.beginPath();g.moveTo(w*.96,h*.04);g.bezierCurveTo(w*.91,h*.20,w*.96,h*.31,w*.91,h*.52);g.bezierCurveTo(w*.84,h*.7,w*.95,h*.85,w*.89,h);g.lineTo(w,h);g.lineTo(w,0);g.closePath();g.fillStyle='rgba(70,107,123,.055)';g.fill();g.strokeStyle='rgba(81,119,133,.12)';g.stroke();
    const p=CIRCUIT.points;
    const trace=()=>{g.beginPath();p.forEach((v,i)=>i?g.lineTo(x(v[0]),y(v[1])):g.moveTo(x(v[0]),y(v[1])));g.closePath();};
    trace();g.lineWidth=25;g.strokeStyle='rgba(0,0,0,.30)';g.lineJoin='round';g.lineCap='round';g.stroke();
    trace();g.lineWidth=17;g.strokeStyle='#343a43';g.stroke();
    trace();g.lineWidth=11;g.strokeStyle='#1a2028';g.stroke();
    trace();g.setLineDash([3,8]);g.lineWidth=.7;g.strokeStyle='#707984';g.stroke();g.setLineDash([]);
    const sectorColors=['#b3a17b','#8aa6a0','#9e8190'];
    for(let s=0;s<3;s++){
      g.beginPath();for(let i=s*167;i<Math.min((s+1)*167,p.length);i++){const v=p[i];if(i===s*167)g.moveTo(x(v[0]),y(v[1]));else g.lineTo(x(v[0]),y(v[1]));}
      g.lineWidth=1.8;g.strokeStyle=sectorColors[s];g.stroke();
    }
    g.beginPath();g.moveTo(x(.137),y(.59));g.bezierCurveTo(x(.18),y(.58),x(.20),y(.62),x(.20),y(.70));g.lineTo(x(.23),y(.77));g.lineWidth=4;g.strokeStyle='#444d59';g.stroke();
    g.font='9px ui-monospace,monospace';g.fillStyle='#7c8995';g.fillText('PIT',x(.224),y(.67));
    const finish=trackPoint(0),next=trackPoint(.004),angle=Math.atan2((next[1]-finish[1])*h,(next[0]-finish[0])*w);
    g.save();g.translate(x(finish[0]),y(finish[1]));g.rotate(angle);for(let a=0;a<2;a++)for(let b=0;b<6;b++){g.fillStyle=(a+b)%2?'#e1e5e9':'#333a43';g.fillRect(a*3-3,b*3-9,3,3);}g.restore();
    const cars=sorted().reverse();
    for(const d of cars){
      let pt=trackPoint(d.progress);if(d.pitTime>0)pt=[.195,.65];const px=x(pt[0]),py=y(pt[1]),own=d.team==='VANTA Racing',selected=d.id===r.selected;
      if(selected){g.beginPath();g.arc(px,py,13,0,Math.PI*2);g.strokeStyle=d.color+'88';g.lineWidth=1;g.stroke();g.beginPath();g.arc(px,py,9,0,Math.PI*2);g.fillStyle=d.color+'24';g.fill();}
      g.beginPath();g.arc(px,py,own?5.5:4.1,0,Math.PI*2);g.fillStyle=d.color;g.fill();g.strokeStyle='#0d1116';g.lineWidth=2;g.stroke();
      if(own||selected){const text=d.code,tw=g.measureText(text).width+10,lx=px+10,ly=py-20;g.fillStyle=own?'#511f29':'#202933';g.fillRect(lx,ly,tw,17);g.font='bold 10px ui-monospace,monospace';g.fillStyle='#f0f1f3';g.fillText(text,lx+5,ly+12);}
    }
  }

  function simulate(dt){
    if(!r.running||r.finished)return;
    const seconds=dt*r.speed*8;r.elapsed+=seconds;
    for(const d of r.drivers){
      if(d.pitTime>0){
        d.pitTime=Math.max(0,d.pitTime-seconds);
        if(d.pitTime===0){d.compound=d.pitNew;d.pitNew=null;d.tyres=100;d.tyreAge=0;d.stops++;addEvent(`${d.name}: остановка завершена. Установлены ${COMPOUNDS[d.compound].title.toLowerCase()} шины.`, 'pit',d.code);}
        continue;
      }
      const before=Math.floor(d.progress),pace=d.pace==='attack'?.988:d.pace==='save'?1.016:1,energy=d.energy==='attack'&&d.ers>0?.991:d.energy==='save'?1.006:1,degrade=1+Math.max(0,65-d.tyres)*.0005;
      const lt=d.lapTime*pace*energy*degrade*COMPOUNDS[d.compound].pace;
      d.progress+=seconds/lt;
      d.tyres=Math.max(3,d.tyres-seconds/lt*COMPOUNDS[d.compound].wear*(d.pace==='attack'?1.52:d.pace==='save'?.65:1));
      d.ers=Math.max(0,Math.min(100,d.ers+seconds*(d.energy==='attack'?-.28:d.energy==='save'?.19:.015)));
      if(Math.floor(d.progress)>before){
        d.lastLap=lt+Math.sin(d.progress*3+d.rating)*.11;d.bestLap=Math.min(d.bestLap,d.lastLap);d.tyreAge++;
        if(d.pitQueued){d.pitNew=d.pitQueued;d.pitQueued=null;d.pitTime=22.4;addEvent(`${d.name} заезжает в боксы. Готовим новый комплект ${d.pitNew}.`,'pit',d.code);}
        else if(d.team!=='VANTA Racing'&&d.tyres<43&&d.stops===0){d.pitNew='H';d.pitTime=22.7;}
      }
    }
    if(sorted()[0].progress>=TOTAL_LAPS){r.finished=true;r.running=false;addEvent('Клетчатый флаг. Демонстрационная гонка завершена.','flag','ДИРЕКЦИЯ');ctx.toast?.('Гонка завершена. Результаты доступны в тайминге.');save();}
  }

  function closeDialog(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
  function makeDialog(html){
    closeDialog();dialog=document.createElement('dialog');dialog.className='race-dialog';dialog.innerHTML=html;document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog();}});
    dialog.querySelector('[data-close]')?.addEventListener('click',closeDialog);
    return dialog;
  }
  function openPit(id){
    if(!canCommand)return;
    const d=r.drivers.find(x=>x.id===id);
    if(d.pitTime>0){ctx.toast?.('Пилот уже находится на пит-лейн.');return;}
    let selected=d.pitQueued || 'H';
    const el=makeDialog(`<div class="race-dialog-head"><div><div class="race-eyebrow">СТРАТЕГИЯ · ${d.code}</div><h2>Подготовить пит-стоп</h2></div><button data-close aria-label="Закрыть">${icon('x',20)}</button></div><p class="race-dialog-copy">${d.id==='kel'?'Адриан Келлер':'Лукас Вебер'} заедет в боксы при следующем пересечении стартовой линии. Выбери новый комплект.</p><div class="race-compound-options">${Object.entries(COMPOUNDS).map(([k,c])=>`<button data-compound="${k}" class="${selected===k?'is-selected':''}"><i class="race-tyre race-tyre-${k}">${k}</i><strong>${c.title}</strong><span>${k==='S'?'16–20':k==='M'?'24–30':'32–38'} кругов</span><small>Новый · 100%</small></button>`).join('')}</div><div class="race-pit-estimate"><span>Потеря времени на пит-лейн</span><b>22,4 с</b></div><div class="race-dialog-actions">${d.pitQueued?'<button class="race-dialog-secondary" data-cancel-pit>Отменить остановку</button>':'<button class="race-dialog-secondary" data-close-secondary>Назад</button>'}<button class="race-dialog-primary" data-confirm-pit>Подтвердить пит-стоп</button></div>`);
    el.querySelectorAll('[data-compound]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.compound;el.querySelectorAll('[data-compound]').forEach(x=>x.classList.toggle('is-selected',x===b));}));
    el.querySelector('[data-close-secondary]')?.addEventListener('click',closeDialog);
    el.querySelector('[data-cancel-pit]')?.addEventListener('click',()=>{d.pitQueued=null;closeDialog();updateUI();save();ctx.toast?.('Пит-стоп отменён. Пилот остаётся на трассе.');});
    el.querySelector('[data-confirm-pit]').addEventListener('click',()=>{d.pitQueued=selected;closeDialog();addEvent(`${d.name}: «Принято. Боксы на следующем круге, комплект ${selected}».`,'radio',d.code);ctx.toast?.(`Пит-стоп ${d.code} запланирован: ${COMPOUNDS[selected].title.toLowerCase()} шины.`);updateUI();save();});
  }
  function briefing(){
    const el=makeDialog(`<div class="race-dialog-head"><div><div class="race-eyebrow">ГРАН-ПРИ ЛАЗУРНОГО БЕРЕГА</div><h2>Брифинг перед гонкой</h2></div><button data-close aria-label="Закрыть">${icon('x',20)}</button></div><div class="race-briefing-facts"><div><span>Дистанция</span><b>58 кругов</b></div><div><span>Стратегия</span><b>Medium → Hard</b></div><div><span>Пит-окно</span><b>23–27 круг</b></div><div><span>Прогноз</span><b>Сухо · 26 °C</b></div></div><p class="race-dialog-copy">Келлер борется за подиум. На первом отрезке держим давление на Уорда и сохраняем шины. Вебер работает по свободному воздуху: удлиняем первый отрезок, если соперники остановятся раньше.</p><div class="race-briefing-note">${icon('info',18)}<span>Это интерактивный эталон интерфейса. Темп и расход энергии влияют на состояние машины; время ускорено. Спортивная и физическая модель здесь демонстрационные.</span></div><button class="race-dialog-primary race-dialog-full" data-ack>К гонке</button>`);
    el.querySelector('[data-ack]').addEventListener('click',closeDialog);
  }
  function togglePlay(){
    if(r.finished){r=newRace();r.running=true;renderEvents();}else r.running=!r.running;
    updateUI();save();
  }
  function onClick(e){
    const b=e.target.closest('[data-action]');if(!b||!container.contains(b))return;
    const {action,id,value}=b.dataset;
    if(action==='play')togglePlay();
    if(action==='speed'){r.speed=Number(b.dataset.speed);container.querySelectorAll('[data-action="speed"]').forEach(x=>x.classList.toggle('is-active',x===b));save();}
    if(action==='observe'){r.selected=id;updateUI();draw();save();}
    if(action==='follow'){r.selected=r.selected==='kel'?'web':'kel';updateUI();draw();save();}
    if(action==='intervals'){r.intervals=!r.intervals;$('[data-race="gapmode"]').textContent=r.intervals?'Интервалы':'От лидера';updateUI();save();}
    if(action==='pace'&&canCommand){const d=r.drivers.find(x=>x.id===id);if(d.pace===value)return;d.pace=value;addEvent(`${d.name}: ${value==='attack'?'переходим в атаку. Темп выше, износ шин растёт.':value==='save'?'бережём шины, увеличиваем длину отрезка.':'возвращаемся к плановому темпу.'}`,'radio',d.code);updateUI();save();}
    if(action==='pit')openPit(id);
    if(action==='briefing')briefing();
  }
  function onChange(e){if(e.target.dataset.action==='energy'&&canCommand){const d=r.drivers.find(x=>x.id===e.target.dataset.id);d.energy=e.target.value;addEvent(`${d.name}: режим энергии — ${d.energy==='attack'?'расход':d.energy==='save'?'накопление':'баланс'}.`,'radio',d.code);save();}}
  function onKey(e){if(e.code==='Space'&&!dialog&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName||'')&&!e.repeat){e.preventDefault();togglePlay();}}
  container.addEventListener('click',onClick);container.addEventListener('change',onChange);window.addEventListener('keydown',onKey);
  canvas.addEventListener('click',onCanvasClick);
  function onCanvasClick(e){const b=canvas.getBoundingClientRect(),px=(e.clientX-b.left)/b.width,py=(e.clientY-b.top)/b.height;let near=null,distance=.06;for(const d of r.drivers){const p=trackPoint(d.progress),dis=Math.hypot((p[0]-px),(p[1]-py)*b.height/b.width);if(dis<distance){near=d;distance=dis;}}if(near){r.selected=near.id;updateUI();draw();save();}}
  function tick(t){if(disposed)return;const dt=last?Math.min((t-last)/1000,.1):0;last=t;simulate(dt);uiElapsed+=dt;if(uiElapsed>.3){updateUI();uiElapsed=0;}draw();raf=requestAnimationFrame(tick);}
  renderEvents();updateUI();resize();raf=requestAnimationFrame(tick);
  return ()=>{disposed=true;r.running=false;cancelAnimationFrame(raf);ro.disconnect();closeDialog();container.removeEventListener('click',onClick);container.removeEventListener('change',onChange);canvas.removeEventListener('click',onCanvasClick);window.removeEventListener('keydown',onKey);save();};
}
