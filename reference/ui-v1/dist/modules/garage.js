import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { GarageSoftwareRenderer } from '../vendor/three-software.js';

const DEFAULT_LIVERY = { base: '#c52e45', secondary: '#15191f', accent: '#d6dce5', finish: 'satin', sponsor: 'NORD', number: '17', sponsorZone: 'sidepod', sponsorScale: 1 };
const presets = [
  {name:'VANTA',base:'#c52e45',secondary:'#15191f',accent:'#d6dce5'},
  {name:'ARCTIC',base:'#d6dce5',secondary:'#152329',accent:'#5eb3b7'},
  {name:'HERITAGE',base:'#193b36',secondary:'#111a18',accent:'#c0a272'},
  {name:'OBSIDIAN',base:'#242730',secondary:'#0e1015',accent:'#c52e45'}
];
const esc = value => String(value).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

export function mountGarage(container, ctx) {
  let livery = {...DEFAULT_LIVERY, ...(ctx.state.livery || {})};
  let currentTab = 'overview';
  let technicalLight = false;
  let autoRotate = false;
  let destroyed = false;
  let softwareMode = false;
  let frame = 0;
  let resources = { engine: 78, gearbox: 86, chassis: 94, ...(ctx.state.garageResources || {}) };
  const discipline = ctx.state.discipline || 'formula';
  const isGT = discipline === 'gt';
  const isEndurance = discipline === 'endurance';
  const model = isGT ? 'V28 GT' : isEndurance ? 'V28 H' : 'V28';
  const category = isGT ? 'GT WORLD SERIES' : isEndurance ? 'WORLD ENDURANCE' : 'FORMULA WORLD';
  const icon = (name, size=17) => ctx.icon?.(name,size) || '';
  container.innerHTML = `
    <section class="garage-page">
      <header class="garage-heading"><div><div class="garage-eyebrow">ТЕХНИЧЕСКИЙ ЦЕНТР</div><h1>Гараж</h1><p>Каждая деталь имеет значение.</p></div><div class="garage-heading-actions"><span class="garage-ready">${icon('circle-check')} Допущен к гонке</span><button class="garage-btn" data-action="garage-save">${icon('save')} Сохранить ливрею</button></div></header>
      <nav class="garage-tabs" aria-label="Разделы гаража">
        ${[['overview','Обзор','scan'],['livery','Ливрея','paintbrush'],['sponsors','Спонсоры','badge-dollar-sign'],['components','Компоненты','settings-2']].map(([id,text,i])=>`<button data-tab="${id}" class="${id==='overview'?'active':''}" aria-selected="${id==='overview'}" role="tab">${icon(i)}${text}</button>`).join('')}
      </nav>
      <div class="garage-workspace">
        <div class="garage-stage" aria-label="Интерактивный трёхмерный гараж">
          <div class="garage-canvas" aria-label="3D-модель автомобиля. Перетащите для вращения, прокрутите для приближения."></div>
          <div class="garage-stage-meta"><div><span class="garage-eyebrow">${category} / 2028</span><strong>${model}<span>VANTA RACING</span></strong></div><span class="garage-chassis">ШАССИ 02 / ГОТОВ</span></div>
          <div class="garage-stage-plaque"><span class="garage-live-dot"></span><span>ГАРАЖ 01</span><span class="garage-plaque-divider"></span><span>АДРИАН КЕЛЛЕР <b>#17</b></span></div>
          <div class="garage-stage-controls"><button data-action="garage-camera" title="Вернуть камеру" aria-label="Вернуть камеру">${icon('rotate-ccw',18)}</button><button data-action="garage-rotate" title="Автовращение" aria-label="Автовращение" aria-pressed="false">${icon('orbit',18)}</button><span></span><button data-action="garage-light" class="garage-light-button" aria-pressed="false">${icon('lightbulb',17)}<span>Студийный свет</span></button></div>
          <div class="garage-stage-hint">${icon('mouse-pointer-2',14)} Вращайте · Приближайте</div>
          <div class="garage-render-error" hidden><strong>3D недоступно в этом браузере</strong><p>Для просмотра модели нужен WebGL. Настройки ливреи и компонентов остаются доступны.</p></div>
        </div>
        <aside class="garage-sidebar" aria-live="polite"></aside>
      </div>
      <div class="garage-specs">
        <div><span>МОЩНОСТЬ</span><strong>${isGT?'586':isEndurance?'680':'1 018'}<small>л.с.</small></strong><em>VANTA VP6</em></div>
        <div><span>МАССА</span><strong>${isGT?'1 285':isEndurance?'1 030':'798'}<small>кг</small></strong><em>В пределах регламента</em></div>
        <div><span>АЭРОДИНАМИКА</span><strong>84<small>/ 100</small></strong><em class="garage-positive">+3 к прошлому этапу</em></div>
        <div><span>НАДЁЖНОСТЬ</span><strong id="garage-reliability">${Math.round((resources.engine+resources.gearbox+resources.chassis)/3)}<small>%</small></strong><em>Следующий осмотр — после гонки</em></div>
      </div>
      <div class="garage-footnote">${icon('box',13)} Интерактивная концептуальная 3D-модель · Характеристики демонстрационные</div>
    </section>`;

  const root = container.querySelector('.garage-page');
  const sidebar = root.querySelector('.garage-sidebar');
  const stage = root.querySelector('.garage-stage');
  const canvasHost = root.querySelector('.garage-canvas');
  let scene, camera, renderer, controls, car, envTarget;
  const materials = {};
  const logos = [];
  const lights = [];
  const disposable = new Set();
  const canvasTextures = [];
  const persist = () => ctx.setState?.({livery: {...livery}, garageResources: {...resources}});

  function renderSidebar() {
    if(currentTab === 'overview') sidebar.innerHTML = `
      <div class="garage-panel-eyebrow">СОСТОЯНИЕ БОЛИДА</div><div class="garage-rating"><strong>84</strong><div>Рейтинг автомобиля<span>4-я машина в пелотоне</span></div></div>
      <div class="garage-divider"></div><h3>Готовность к этапу</h3>
      <div class="garage-check">${icon('circle-check')} Техническая проверка пройдена</div><div class="garage-check">${icon('circle-check')} Ливрея утверждена</div><div class="garage-check">${icon('circle-check')} Комплект шин получен</div>
      <div class="garage-divider"></div><h3>Ресурс компонентов</h3>
      ${resourceRow('Двигатель',resources.engine)}${resourceRow('Коробка передач',resources.gearbox)}${resourceRow('Шасси',resources.chassis)}
      <div class="garage-note">${icon('info')} Двигатель ещё готов к гонке. Плановая замена рекомендована после следующего этапа.</div>
      <button class="garage-btn garage-full" data-tab="components">${icon('wrench')} Проверить компоненты</button>`;
    else if(currentTab === 'livery') sidebar.innerHTML = `
      <div class="garage-panel-eyebrow">КОНСТРУКТОР ЛИВРЕИ</div><h3 class="garage-panel-title">Ваши цвета. Ваш характер.</h3>
      <div class="garage-field-label">Пресеты</div><div class="garage-presets">${presets.map((p,i)=>`<button data-preset="${i}" title="${p.name}" aria-label="Ливрея ${p.name}" class="${livery.base===p.base?'selected':''}"><span style="background:linear-gradient(135deg,${p.base} 0%,${p.base} 53%,${p.accent} 54%,${p.accent} 59%,${p.secondary} 60%)"></span><small>${p.name}</small></button>`).join('')}</div>
      <div class="garage-divider"></div><h3>Цветовая схема</h3>${[['base','Основной'],['secondary','Дополнительный'],['accent','Акцент']].map(([key,label])=>`<label class="garage-color-row"><span>${label}</span><span class="garage-color-control"><span data-color-label="${key}">${livery[key].toUpperCase()}</span><input type="color" value="${livery[key]}" data-color="${key}" aria-label="${label} цвет" /></span></label>`).join('')}
      <div class="garage-field-label garage-mt">Покрытие кузова</div><div class="garage-segmented">${[['matte','Мат'],['satin','Сатин'],['gloss','Глянец']].map(([id,label])=>`<button data-finish="${id}" class="${livery.finish===id?'active':''}">${label}</button>`).join('')}</div>
      <label class="garage-field-label garage-mt" for="garage-number">Гоночный номер</label><input id="garage-number" class="garage-input" type="number" min="1" max="99" value="${esc(livery.number)}" aria-label="Гоночный номер"/>
      <div class="garage-note">${icon('info')} Цвета сразу применяются к 3D-модели и сохраняются на этом устройстве.</div>`;
    else if(currentTab === 'sponsors') sidebar.innerHTML = `
      <div class="garage-panel-eyebrow">КОММЕРЧЕСКИЕ ПАРТНЁРЫ</div><h3 class="garage-panel-title">На виду у всего пелотона.</h3>
      <label class="garage-field-label" for="garage-sponsor">Логотип партнёра</label><select id="garage-sponsor" class="garage-input">${['NORD','APEX ENERGY','IONIX','VANTA',...((ctx.state.sponsors||[]).some(s=>String(typeof s==='string'?s:(s.name||s.brand||'')).toUpperCase().includes('HELIX'))?['HELIX']:[])].map(s=>`<option ${livery.sponsor===s?'selected':''}>${s}</option>`).join('')}</select>
      <div class="garage-logo-preview">${esc(livery.sponsor)}</div>
      <div class="garage-field-label">Размещение</div><div class="garage-zone-list">${[['sidepod','Боковые понтоны','Главная зона'],['rear','Заднее антикрыло','Высокая видимость'],['nose','Носовой обтекатель','Фронтальная зона'],['engine','Кожух двигателя','Верхняя зона']].map(([id,label,note])=>`<button data-zone="${id}" class="${livery.sponsorZone===id?'active':''}"><span>${label}<small>${note}</small></span>${icon(livery.sponsorZone===id?'circle-check':'circle',17)}</button>`).join('')}</div>
      <label class="garage-field-label garage-mt" for="garage-scale">Масштаб <span id="garage-scale-label">${Math.round(livery.sponsorScale*100)}%</span></label><input id="garage-scale" class="garage-range" type="range" min="0.6" max="1.35" step="0.05" value="${livery.sponsorScale}"/>
      <div class="garage-contract"><span>ТИТУЛЬНЫЙ ПАРТНЁР</span><strong>NORD</strong><div>€ 7,2 млн <span>/ сезон</span></div><small>Контракт до конца 2029 года</small></div>
      <div class="garage-note">${icon('shield-check')} Размещение в макете свободное. Условия контракта показаны для примера.</div>`;
    else sidebar.innerHTML = `
      <div class="garage-panel-eyebrow">ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ</div><h3 class="garage-panel-title">Готовность начинается здесь.</h3>
      ${[['engine','Двигатель','VANTA VP6','gauge'],['gearbox','Коробка передач','GT8 · 8 передач','cog'],['chassis','Шасси','V28 / монокок №02','box']].map(([id,title,subtitle,i])=>`<div class="garage-component"><div class="garage-component-top"><div class="garage-component-icon">${icon(i,19)}</div><div><h4>${title}</h4><small>${subtitle}</small></div></div>${resourceRow('Остаточный ресурс',resources[id])}<button class="garage-btn garage-full" data-replace="${id}" ${resources[id]===100?'disabled':''}>${resources[id]===100?icon('check')+' Заменён':icon('refresh-cw')+' Заменить компонент'}</button></div>`).join('')}
      <div class="garage-note">${icon('package-check')} На складе есть резервные компоненты. Замена в макете не списывает бюджет.</div>`;
    root.querySelectorAll('.garage-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===currentTab);b.setAttribute('aria-selected',String(b.dataset.tab===currentTab));});
  }

  function resourceRow(label,value) { return `<div class="garage-resource"><div><span>${label}</span><b class="${value<80?'garage-amber':''}">${value}%</b></div><div class="garage-meter"><i style="width:${value}%;${value<80?'background:#cba163':''}"></i></div></div>`; }

  function changeLivery(patch) {livery={...livery,...patch}; applyLivery();persist();}
  function onClick(event) {
    const button = event.target.closest('button');
    if(!button || !root.contains(button)) return;
    if(button.dataset.tab){currentTab=button.dataset.tab;renderSidebar();return;}
    if(button.dataset.preset!==undefined){changeLivery(presets[Number(button.dataset.preset)]);renderSidebar();return;}
    if(button.dataset.finish){changeLivery({finish:button.dataset.finish});renderSidebar();return;}
    if(button.dataset.zone){changeLivery({sponsorZone:button.dataset.zone});renderSidebar();return;}
    if(button.dataset.replace){resources[button.dataset.replace]=100;persist();renderSidebar();root.querySelector('#garage-reliability').innerHTML=`${Math.round((resources.engine+resources.gearbox+resources.chassis)/3)}<small>%</small>`;ctx.toast?.('Резервный компонент установлен. Ресурс — 100%.');return;}
    if(button.dataset.action==='garage-camera'){resetCamera();}
    if(button.dataset.action==='garage-rotate'){autoRotate=!autoRotate;if(controls)controls.autoRotate=autoRotate;button.classList.toggle('active',autoRotate);button.setAttribute('aria-pressed',String(autoRotate));}
    if(button.dataset.action==='garage-light'){technicalLight=!technicalLight;updateLight();button.classList.toggle('active',technicalLight);button.setAttribute('aria-pressed',String(technicalLight));button.querySelector('span').textContent=technicalLight?'Технический свет':'Студийный свет';}
    if(button.dataset.action==='garage-save'){persist();ctx.toast?.('Ливрея сохранена. Цвета, номер и спонсоры применены к болиду.');}
  }
  function onInput(event) {
    const el=event.target;
    if(el.dataset.color){changeLivery({[el.dataset.color]:el.value});root.querySelector(`[data-color-label="${el.dataset.color}"]`).textContent=el.value.toUpperCase();}
    if(el.id==='garage-scale'){changeLivery({sponsorScale:Number(el.value)});root.querySelector('#garage-scale-label').textContent=Math.round(Number(el.value)*100)+'%';}
  }
  function onChange(event) {
    const el=event.target;
    if(el.id==='garage-number'){const n=Math.min(99,Math.max(1,Number(el.value)||17));el.value=n;changeLivery({number:String(n)});}
    if(el.id==='garage-sponsor'){changeLivery({sponsor:el.value});root.querySelector('.garage-logo-preview').textContent=el.value;}
  }
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onChange);
  renderSidebar();

  function init3D() {
    scene=new THREE.Scene();scene.background=new THREE.Color('#0b0e13');scene.fog=new THREE.FogExp2('#0b0e13',.035);
    camera=new THREE.PerspectiveCamera(37,1,.1,80);
    const nativeCanvas=document.createElement('canvas');
    let gl=null;try{gl=nativeCanvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});}catch{}
    if(gl)renderer=new THREE.WebGLRenderer({canvas:nativeCanvas,context:gl,antialias:true,alpha:false,powerPreference:'high-performance'});
    else{softwareMode=true;renderer=new GarageSoftwareRenderer();}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    canvasHost.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D-модель болида VANTA');
    if(!softwareMode){const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();envTarget=pmrem.fromScene(room,.04);scene.environment=envTarget.texture;scene.environmentIntensity=.62;room.dispose();pmrem.dispose();}
    else{root.querySelector('.garage-footnote').innerHTML=icon('box',13)+' Интерактивная 3D-модель · Режим совместимости без WebGL';}
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=5.5;controls.maxDistance=13;controls.minPolarAngle=.25;controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.7;controls.target.set(0,.65,0);resetCamera();
    makeMaterials();makeGarage();
    car=new THREE.Group();scene.add(car);
    if(isGT||isEndurance) makeClosedCar(car,isEndurance);else makeFormula(car);
    applyLivery();
    if(softwareMode)renderer.setModel(car);
    resize();
    let lastFrame=0;const animate=(now=0)=>{if(destroyed)return;frame=requestAnimationFrame(animate);if(softwareMode&&now-lastFrame<40)return;lastFrame=now;controls.update();renderer.render(scene,camera);};animate();
  }

  function mesh(geometry,material,parent=car) {const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);disposable.add(geometry);return m;}
  function box(w,h,d,material,x=0,y=0,z=0,parent=car){const m=mesh(new THREE.BoxGeometry(w,h,d),material,parent);m.position.set(x,y,z);return m;}
  function cylinder(a,b,r,material,parent=car){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),material,parent);m.position.copy(av.clone().add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
  function sphere(w,h,d,material,x,y,z,parent=car){const m=mesh(new THREE.SphereGeometry(1,softwareMode?20:32,softwareMode?12:18),material,parent);m.scale.set(w,h,d);m.position.set(x,y,z);return m;}
  function mat(parameters){const m=new THREE.MeshStandardMaterial(parameters);disposable.add(m);return m;}

  function makeMaterials(){
    materials.base=new THREE.MeshPhysicalMaterial({color:livery.base,metalness:.38,roughness:.3,clearcoat:.65,clearcoatRoughness:.19});
    materials.secondary=new THREE.MeshPhysicalMaterial({color:livery.secondary,metalness:.45,roughness:.27,clearcoat:.5});
    materials.accent=mat({color:livery.accent,metalness:.5,roughness:.24});
    materials.carbon=mat({color:'#14171c',metalness:.32,roughness:.43});
    materials.rubber=mat({color:'#141416',metalness:.05,roughness:.8});
    materials.rim=mat({color:'#454951',metalness:.95,roughness:.27});
    materials.black=mat({color:'#080a0d',roughness:.63});
    materials.glass=new THREE.MeshPhysicalMaterial({color:'#182a32',metalness:.25,roughness:.08,clearcoat:1});
    materials.champagne=mat({color:'#b6a17e',metalness:.85,roughness:.3});
    Object.values(materials).forEach(m=>disposable.add(m));
  }

  function loft(sections,material,parent=car,segments=softwareMode?16:24){
    const pos=[],indices=[];
    sections.forEach(s=>{for(let i=0;i<segments;i++){const angle=(i/segments)*Math.PI*2;const c=Math.cos(angle),sn=Math.sin(angle);pos.push(s.x,s.y+Math.sign(sn)*Math.pow(Math.abs(sn),s.round??.8)*s.h,(s.z||0)+Math.sign(c)*Math.pow(Math.abs(c),s.round??.8)*s.w);}});
    for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){const a=j*segments+i,b=j*segments+(i+1)%segments,c=(j+1)*segments+i,d=(j+1)*segments+(i+1)%segments;indices.push(a,c,b,b,c,d);}
    for(let i=1;i<segments-1;i++){indices.push(0,i+1,i);const k=(sections.length-1)*segments;indices.push(k,k+i,k+i+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,material,parent);
  }

  function wing(x,y,span,chord,material,sweep=0,parent=car){
    const positions=[],idx=[],steps=20,profile=[[-.5,-.025],[-.42,.018],[-.12,.045],[.18,.018],[.5,-.04],[.2,-.045],[-.35,-.04]];
    for(let j=0;j<=steps;j++){const z=(j/steps-.5)*span,tip=Math.abs(z/(span*.5));profile.forEach(([px,py])=>positions.push(x+px*chord+sweep*tip*tip,y+py+tip*tip*.06,z));}
    for(let j=0;j<steps;j++)for(let i=0;i<profile.length;i++){const a=j*profile.length+i,b=j*profile.length+(i+1)%profile.length,c=a+profile.length,d=b+profile.length;idx.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(idx);g.computeVertexNormals();return mesh(g,material,parent);
  }

  function shapePanel(points,depth,material,parent=car){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.012,bevelSize:.016,bevelSegments:2,steps:1});return mesh(g,material,parent);}

  function makeWheel(x,z,radius,width,parent=car){
    const wheel=new THREE.Group();wheel.position.set(x,radius,z);parent.add(wheel);
    const tyre=mesh(new THREE.CylinderGeometry(radius,radius,width,softwareMode?32:64,1,false),materials.rubber,wheel);tyre.rotation.x=Math.PI/2;
    const outer=Math.sign(z)*width*.505;
    const side=mesh(new THREE.TorusGeometry(radius*.82,radius*.16,softwareMode?8:14,softwareMode?32:64),materials.rubber,wheel);side.position.z=outer;
    const rim=mesh(new THREE.CylinderGeometry(radius*.58,radius*.58,width*1.025,softwareMode?24:48),materials.rim,wheel);rim.rotation.x=Math.PI/2;
    const disk=mesh(new THREE.CylinderGeometry(radius*.4,radius*.4,width*1.04,32),materials.champagne,wheel);disk.rotation.x=Math.PI/2;
    for(let i=0;i<12;i++){const theta=i*Math.PI/6;const spoke=box(radius*.055,radius*.51,.025,materials.rim,Math.sin(theta)*radius*.30,Math.cos(theta)*radius*.30,outer*1.05,wheel);spoke.rotation.z=-theta;}
    const nut=mesh(new THREE.CylinderGeometry(.065,.065,width*1.12,6),materials.accent,wheel);nut.rotation.x=Math.PI/2;
    const edge=mesh(new THREE.TorusGeometry(radius*.88,.012,softwareMode?4:8,softwareMode?32:64),mat({color:'#c2a665',roughness:.6}),wheel);edge.position.z=outer*1.03;
    const innerRim=mesh(new THREE.TorusGeometry(radius*.57,.015,softwareMode?4:8,softwareMode?24:48),materials.rim,wheel);innerRim.position.z=outer*1.06;
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=256;const g=labelCanvas.getContext('2d');g.translate(128,128);g.fillStyle='#c4af80';g.font='600 14px Arial';g.textAlign='center';g.fillText('A P E X',0,-100);g.rotate(Math.PI);g.fillText('S O F T',0,-100);
    const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;canvasTextures.push(texture);
    const labelMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});disposable.add(labelMat);
    const label=mesh(new THREE.PlaneGeometry(radius*2.05,radius*2.05),labelMat,wheel);label.position.z=outer*1.06;if(z<0)label.rotation.y=Math.PI;
    return wheel;
  }

  function makeFormula(parent){
    box(4.1,.075,1.82,materials.carbon,.05,.2,0,parent);
    loft([{x:-3.02,y:.40,h:.07,w:.13},{x:-2.45,y:.47,h:.10,w:.15},{x:-1.7,y:.57,h:.17,w:.20},{x:-1.05,y:.58,h:.22,w:.34},{x:-.35,y:.52,h:.30,w:.42},{x:.7,y:.47,h:.28,w:.43},{x:1.85,y:.44,h:.19,w:.22},{x:2.3,y:.36,h:.11,w:.13}],materials.base,parent);
    loft([{x:-2.87,y:.478,h:.003,w:.045},{x:-1.65,y:.75,h:.008,w:.065},{x:-1.05,y:.81,h:.008,w:.07}],materials.accent,parent,10);
    for(const side of [-1,1]){
      loft([{x:-.65,y:.44,h:.13,w:.09,z:side*.45},{x:-.39,y:.53,h:.22,w:.26,z:side*.57},{x:.15,y:.48,h:.25,w:.29,z:side*.61},{x:.85,y:.40,h:.19,w:.24,z:side*.57},{x:1.58,y:.34,h:.12,w:.12,z:side*.44},{x:1.95,y:.29,h:.06,w:.02,z:side*.32}],materials.base,parent);
      const intake=mesh(new THREE.PlaneGeometry(.36,.22),materials.black,parent);intake.rotation.y=-Math.PI/2;intake.position.set(-.425,.58,side*.58);
      const endplate=shapePanel([[-3.17,.19],[-2.72,.21],[-2.57,.47],[-2.96,.53],[-3.15,.38]],.033,materials.base,parent);endplate.position.z=side*1.32;
      const mirror=box(.21,.10,.13,materials.secondary,-.65,.92,side*.69,parent);mirror.rotation.y=side*.10;
      cylinder([-.65,.76,side*.36],[-.65,.90,side*.63],.018,materials.carbon,parent);
      for(const front of [true,false]){
        const x=front?-1.9:1.7,z=side*1.18,y=front?.55:.60;
        cylinder([x-.43,.45,side*.23],[x,y,z],.027,materials.carbon,parent);
        cylinder([x+.46,.43,side*.24],[x,y,z],.027,materials.carbon,parent);
        cylinder([x-.38,.63,side*.22],[x,y+.08,z],.024,materials.carbon,parent);
        cylinder([x+.34,.67,side*.25],[x,y+.08,z],.024,materials.carbon,parent);
        cylinder([x-.30,.39,side*.2],[x,y+.12,z],.019,materials.rim,parent);
        makeWheel(x,z,front?.56:.60,front?.38:.47,parent);
      }
      const floorEdge=box(2.75,.03,.06,materials.accent,.36,.22,side*.89,parent);floorEdge.rotation.y=side*.015;
      for(let i=0;i<4;i++){const fin=box(.27,.10,.025,materials.carbon,-.55+i*.14,.22,side*.83,parent);fin.rotation.y=side*.32;}
    }
    wing(-2.95,.25,2.65,.51,materials.secondary,.11,parent);
    wing(-2.76,.33,2.36,.26,materials.base,.17,parent);wing(-2.62,.39,2.13,.19,materials.accent,.19,parent);
    // Open cockpit, padded rim, seat and helmet.
    sphere(.53,.055,.29,materials.black,-.23,.805,0,parent);
    const seat=box(.32,.28,.29,materials.black,.04,.72,0,parent);seat.rotation.z=.35;
    sphere(.16,.18,.155,materials.accent,-.13,.94,0,parent);
    sphere(.14,.072,.16,materials.glass,-.205,.975,0,parent);
    const haloCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.26,1.01,-.32),new THREE.Vector3(-.19,1.14,-.31),new THREE.Vector3(-.70,1.05,0),new THREE.Vector3(-.19,1.14,.31),new THREE.Vector3(.26,1.01,.32)]);
    mesh(new THREE.TubeGeometry(haloCurve,48,.032,10,false),materials.carbon,parent);cylinder([-.70,1.05,0],[-.79,.77,0],.028,materials.carbon,parent);
    loft([{x:.30,y:.79,h:.28,w:.22},{x:.52,y:.82,h:.36,w:.20},{x:.90,y:.66,h:.28,w:.16},{x:1.65,y:.49,h:.18,w:.09},{x:2.13,y:.38,h:.06,w:.035}],materials.secondary,parent);
    const shark=shapePanel([[.51,.80],[.58,1.21],[1.37,.80],[1.95,.58],[1.95,.46]],.025,materials.base,parent);shark.position.z=-.012;
    sphere(.10,.07,.08,materials.black,.50,1.09,0,parent);
    cylinder([2.07,.36,-.35],[2.22,1.24,-.35],.035,materials.carbon,parent);cylinder([2.07,.36,.35],[2.22,1.24,.35],.035,materials.carbon,parent);
    wing(2.25,1.23,1.86,.61,materials.secondary,-.03,parent);wing(2.36,1.40,1.85,.32,materials.base,0,parent);
    for(const side of [-1,1]){const p=shapePanel([[1.98,.90],[2.58,.90],[2.58,1.48],[2.06,1.48]],.035,materials.secondary,parent);p.position.z=side*.93;}
    for(let i=-3;i<=3;i++)box(.48,.17,.025,materials.carbon,2.10,.2,i*.16,parent);
    addLogo('sidepod',[.35,.55,.899],[0,0,0],1.28,.28,parent);addLogo('sidepod',[.35,.55,-.899],[0,Math.PI,0],1.28,.28,parent);
    addLogo('rear',[2.18,1.455,0],[-Math.PI/2,0,Math.PI/2],1.42,.22,parent);
    addLogo('nose',[-1.72,.751,0],[-Math.PI/2,0,Math.PI/2],.65,.18,parent);
    addLogo('number',[-2.37,.579,0],[-Math.PI/2,0,Math.PI/2],.29,.26,parent);
    addLogo('engine',[.98,.72,.198],[0,0,-.3],.70,.16,parent);
    addLogo('engine',[.98,.72,-.198],[0,Math.PI,.3],.70,.16,parent);
  }

  function makeClosedCar(parent,endurance){
    const w=endurance?1.08:1.02;
    box(4.7,.10,w*2.08,materials.carbon,0,.24,0,parent);
    loft([{x:-2.45,y:.43,h:.13,w:.76},{x:-2.1,y:.58,h:.29,w:w},{x:-1.4,y:.58,h:.32,w:w},{x:-.6,y:.57,h:.25,w:.94},{x:.45,y:.58,h:.26,w:.95},{x:1.5,y:.64,h:.36,w:w},{x:2.30,y:.59,h:.27,w:.98}],materials.base,parent);
    loft([{x:-.91,y:.78,h:.03,w:.71},{x:-.40,y:1.16,h:.28,w:.65},{x:.30,y:1.29,h:.25,w:.61},{x:.86,y:1.02,h:.23,w:.67},{x:1.15,y:.80,h:.04,w:.73}],materials.glass,parent);
    loft([{x:-.40,y:1.41,h:.025,w:.60},{x:.25,y:1.53,h:.025,w:.59},{x:.63,y:1.36,h:.028,w:.60}],materials.secondary,parent);
    for(const s of [-1,1]){
      makeWheel(-1.50,s*1.02,.50,.32,parent);makeWheel(1.45,s*1.02,.53,.37,parent);
      box(1.80,.045,.075,materials.accent,0,.30,s*1.08,parent);
      const headlight=box(.15,.09,.39,mat({color:'#e4f2ff',emissive:'#b9d8ff',emissiveIntensity:2}),-2.32,.70,s*.71,parent);headlight.rotation.z=.14;
      box(.025,.07,.43,mat({color:'#ae2239',emissive:'#dc2c39',emissiveIntensity:1.2}),2.32,.70,s*.69,parent);
      cylinder([.95,.82,s*.62],[1.57,1.38,s*.64],.035,materials.carbon,parent);
      const vent=box(.55,.11,.02,materials.black,.70,.70,s*1.022,parent);vent.rotation.z=.18;
      for(let i=0;i<4;i++){const slat=box(.37,.014,.03,materials.secondary,1.42,.96+i*.025,s*.68,parent);slat.rotation.y=s*.15;}
      const mirror=box(.21,.09,.16,materials.secondary,-.58,1.05,s*.95,parent);cylinder([-.55,1.02,s*.7],[-.58,1.05,s*.95],.021,materials.carbon,parent);
    }
    wing(1.80,1.39,2.18,.48,materials.secondary,.0,parent);
    for(const s of [-1,1])box(.49,.25,.035,materials.base,1.8,1.40,s*1.10,parent);
    if(endurance){const fin=shapePanel([[.15,1.55],[.38,1.70],[1.95,.94],[1.95,.79]],.025,materials.base,parent);fin.position.z=-.012;}
    loft([{x:-2.38,y:.58,h:.008,w:.10},{x:-1.8,y:.91,h:.008,w:.11},{x:-.98,y:.86,h:.008,w:.11}],materials.accent,parent,10);
    addLogo('sidepod',[0,.62,1.033],[0,0,0],1.30,.30,parent);addLogo('sidepod',[0,.62,-1.033],[0,Math.PI,0],1.30,.30,parent);
    addLogo('rear',[1.80,1.45,0],[-Math.PI/2,0,Math.PI/2],1.55,.25,parent);
    addLogo('nose',[-1.55,.92,0],[-Math.PI/2,0,Math.PI/2],.98,.32,parent);
    addLogo('number',[.28,1.56,0],[-Math.PI/2,0,Math.PI/2],.54,.46,parent);
    addLogo('engine',[1.6,1.01,0],[-Math.PI/2,0,Math.PI/2],.85,.27,parent);
  }

  function addLogo(zone,position,rotation,width,height,parent){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;canvasTextures.push(texture);
    const m=new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.4,metalness:.15,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});disposable.add(m);
    const p=mesh(new THREE.PlaneGeometry(width,height),m,parent);p.position.set(...position);p.rotation.set(...rotation);p.castShadow=false;
    logos.push({zone,canvas,texture,mesh:p});
  }

  function applyLivery(){
    if(!materials.base)return;
    for(const key of ['base','secondary','accent'])materials[key].color.set(livery[key]);
    const finish={matte:[.78,.08,.12],satin:[.36,.45,.22],gloss:[.16,1,.08]}[livery.finish]||[.36,.45,.22];
    for(const key of ['base','secondary']){materials[key].roughness=finish[0];materials[key].clearcoat=finish[1];materials[key].clearcoatRoughness=finish[2];}
    const baseText={sidepod:'NORD',rear:'APEX ENERGY',nose:'IONIX',team:'VANTA',engine:'VANTA',number:livery.number};
    logos.forEach(logo=>{
      const g=logo.canvas.getContext('2d');g.clearRect(0,0,1024,256);g.textAlign='center';g.textBaseline='middle';
      let text=baseText[logo.zone];if(logo.zone===livery.sponsorZone)text=livery.sponsor;
      g.fillStyle=logo.zone==='number'?'#ffffff':livery.accent;g.font=`900 italic ${logo.zone==='number'?220:text.length>8?125:190}px Arial`;
      const mw=930,tm=g.measureText(text).width;if(tm>mw)g.font=`900 italic ${Math.floor((text.length>8?125:190)*mw/tm)}px Arial`;
      g.fillText(text,512,139);logo.texture.needsUpdate=true;
      const scale=logo.zone===livery.sponsorZone?Number(livery.sponsorScale):1;logo.mesh.scale.set(scale,scale,1);
    });
  }

  function makeGarage(){
    const floorMat=mat({color:'#252931',roughness:.3,metalness:.38});const floor=mesh(new THREE.PlaneGeometry(80,80),floorMat,scene);floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.castShadow=false;
    const platform=mesh(new THREE.CylinderGeometry(4.7,4.7,.032,96),mat({color:'#20252d',roughness:.38,metalness:.33}),scene);platform.position.y=-.007;platform.castShadow=false;
    const ring=mesh(new THREE.TorusGeometry(4.70,.009,6,128),mat({color:'#4a505a',roughness:.6}),scene);ring.rotation.x=-Math.PI/2;ring.position.y=.013;ring.castShadow=false;
    const wall=box(24,8,.15,mat({color:'#141820',roughness:.8}),0,3,-6.5,scene);wall.castShadow=false;
    for(let i=-4;i<=4;i++){const seam=box(.018,6,.02,mat({color:'#222731',roughness:.8}),i*2.0,3,-6.4,scene);seam.castShadow=false;}
    box(5.2,1.7,.75,mat({color:'#1a2029',metalness:.45,roughness:.5}),3.8,.85,-5.0,scene);
    for(let x=1.6;x<6.3;x+=.78){box(.015,1.48,.022,mat({color:'#2c3440'}),x,.91,-4.60,scene);box(.24,.025,.03,mat({color:'#555d69',metalness:.7}),x+.23,1.48,-4.57,scene);}
    box(1.08,2.65,.8,mat({color:'#181d25',metalness:.4,roughness:.48}),-5.4,1.34,-5.2,scene);
    for(let i=0;i<4;i++){const tyre=mesh(new THREE.TorusGeometry(.48,.18,12,32),materials.rubber,scene);tyre.rotation.x=Math.PI/2;tyre.position.set(-4.6,.21+i*.37,-3.3);}
    const ambient=new THREE.HemisphereLight('#becbdf','#24232a',.55);scene.add(ambient);lights.push(ambient);
    const fill=new THREE.DirectionalLight('#c7d8f3',1.2);fill.position.set(-5,2,7);scene.add(fill);lights.push(fill);
    const rim=new THREE.DirectionalLight('#c7dbed',2.5);rim.position.set(3,4,-4);scene.add(rim);lights.push(rim);
    for(const [x,z,intensity] of [[-2,1.5,100],[1.2,-1.4,130],[2.9,2.2,75]]){
      const spot=new THREE.SpotLight('#e7eefc',intensity,14,.56,.78,1.3);spot.position.set(x,5.8,z);spot.target.position.set(x*.3,0,0);spot.castShadow=true;spot.shadow.mapSize.set(1024,1024);spot.shadow.bias=-.00012;spot.shadow.normalBias=.028;spot.shadow.blurSamples=8;scene.add(spot,spot.target);lights.push(spot);
      box(1.35,.06,.26,mat({color:'#ecf4ff',emissive:'#bfcfe4',emissiveIntensity:5}),x,5.45,z,scene);
      const beam=mesh(new THREE.ConeGeometry(2.5,5.1,32,1,true),new THREE.MeshBasicMaterial({color:'#d3dff3',transparent:true,opacity:.017,depthWrite:false,side:THREE.DoubleSide}),scene);disposable.add(beam.material);beam.position.set(x,2.9,z);beam.castShadow=false;beam.receiveShadow=false;
    }
    const redFloor=new THREE.PointLight('#b82037',5.5,9,2);redFloor.position.set(2,.65,-4);scene.add(redFloor);
  }

  function resetCamera(){if(!camera||!controls)return;camera.position.set(-7.1,3.5,7.5);controls.target.set(0,.62,0);controls.update();}
  function updateLight(){if(!renderer)return;renderer.toneMappingExposure=technicalLight?1.9:1.25;scene.environmentIntensity=technicalLight?1.2:.62;lights[0].intensity=technicalLight?1.65:.55;stage.classList.toggle('technical-light',technicalLight);}
  function resize(){if(!renderer)return;const w=canvasHost.clientWidth,h=canvasHost.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  let observer;
  try{init3D();observer=new ResizeObserver(resize);observer.observe(canvasHost);}catch(error){console.warn('Garage WebGL unavailable:',error);root.querySelector('.garage-render-error').hidden=false;}

  return () => {
    destroyed=true;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();
    root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);
    disposable.forEach(o=>o.dispose?.());canvasTextures.forEach(t=>t.dispose());envTarget?.dispose();renderer?.dispose();renderer?.forceContextLoss();
  };
}
