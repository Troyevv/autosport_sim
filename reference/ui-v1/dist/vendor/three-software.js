import * as THREE from './three.module.js';

/** Small Canvas2D renderer for the exact garage mesh when WebGL is unavailable.
 * Projects real triangles through the same perspective camera; no raster turntable.
 * OrbitControls, geometry changes, colours and CanvasTexture decals stay live.
 */
export class GarageSoftwareRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.domElement.dataset.renderer = 'canvas3d';
    this.context = this.domElement.getContext('2d', {alpha:false});
    if (!this.context) throw new Error('Canvas2D is unavailable');
    this.shadowMap = {};
    this.toneMappingExposure = 1.25;
    this.pixelRatio = 1;
    this.width = 1;
    this.height = 1;
    this.meshes = [];
    this.vp = new THREE.Matrix4();
    this.mvp = new THREE.Matrix4();
    this.normalMatrix = new THREE.Matrix3();
    this.lastState = '';
  }
  setPixelRatio(ratio) {this.pixelRatio = Math.min(ratio,1.4);}
  setSize(width,height) {
    this.width=width;this.height=height;
    this.domElement.width=Math.max(1,Math.round(width*this.pixelRatio));
    this.domElement.height=Math.max(1,Math.round(height*this.pixelRatio));
    this.lastState='';
  }
  setModel(model) {
    this.model=model;this.meshes=[];
    model.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const geo=mesh.geometry,p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv');
      const index=geo.index?.array;
      const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
      const faceCount=Math.floor((index?index.length:p.count)/3);
      const faces=[];
      for(let f=0;f<faceCount;f++){
        const a=index?index[f*3]:f*3,b=index?index[f*3+1]:f*3+1,c=index?index[f*3+2]:f*3+2;
        let nx=0,ny=0,nz=1;
        if(n){nx=n.getX(a)+n.getX(b)+n.getX(c);ny=n.getY(a)+n.getY(b)+n.getY(c);nz=n.getZ(a)+n.getZ(b)+n.getZ(c);const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;}
        faces.push({a,b,c,nx,ny,nz});
      }
      this.meshes.push({mesh,material,p,uv,faces,projected:new Float32Array(p.count*3)});
    });
    this.lastState='';
  }
  render(scene,camera) {
    if(!this.model)return;
    const fingerprint=camera.position.toArray().join(',')+'|'+camera.quaternion.toArray().join(',')+'|'+this.width+'|'+this.height+'|'+this.toneMappingExposure+'|'+this.meshes.map(m=>`${m.material.color?.getHex()}/${m.material.roughness}/${m.material.map?.version||0}/${m.mesh.scale.x}`).join(';');
    if(fingerprint===this.lastState)return;
    this.lastState=fingerprint;
    camera.updateMatrixWorld();scene.updateMatrixWorld(true);
    this.vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const faces=[],W=this.width,H=this.height;
    const technical=this.toneMappingExposure>1.5;
    for(const item of this.meshes){
      const {mesh,material,p,projected}=item;if(!mesh.visible)continue;
      this.mvp.multiplyMatrices(this.vp,mesh.matrixWorld);
      const e=this.mvp.elements;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),w=e[3]*x+e[7]*y+e[11]*z+e[15];
        const k=i*3;
        projected[k]=((e[0]*x+e[4]*y+e[8]*z+e[12])/w+1)*W*.5;
        projected[k+1]=(1-(e[1]*x+e[5]*y+e[9]*z+e[13])/w)*H*.5;
        projected[k+2]=(e[2]*x+e[6]*y+e[10]*z+e[14])/w;
      }
      this.normalMatrix.getNormalMatrix(mesh.matrixWorld);const ne=this.normalMatrix.elements;
      const rgb=material.color?.getHex(THREE.SRGBColorSpace)??0xffffff;
      const red=(rgb>>16)&255,green=(rgb>>8)&255,blue=rgb&255;
      for(const face of item.faces){
        const a=face.a*3,b=face.b*3,c=face.c*3;
        const ax=projected[a],ay=projected[a+1],az=projected[a+2],bx=projected[b],by=projected[b+1],bz=projected[b+2],cx=projected[c],cy=projected[c+1],cz=projected[c+2];
        if(az<-1||bz<-1||cz<-1||az>1||bz>1||cz>1)continue;
        const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
        if(material.side!==THREE.DoubleSide&&area>=0)continue;
        if(Math.abs(area)<.035)continue;
        if(Math.max(ax,bx,cx)<0||Math.min(ax,bx,cx)>W||Math.max(ay,by,cy)<0||Math.min(ay,by,cy)>H)continue;
        const nx=ne[0]*face.nx+ne[3]*face.ny+ne[6]*face.nz,ny=ne[1]*face.nx+ne[4]*face.ny+ne[7]*face.nz,nz=ne[2]*face.nx+ne[5]*face.ny+ne[8]*face.nz;
        const len=Math.hypot(nx,ny,nz)||1;
        const key=Math.max(0,(-.28*nx+.92*ny+.27*nz)/len);
        const fill=Math.max(0,(.55*nx+.45*ny-.7*nz)/len);
        const sheen=Math.pow(key,10)*(1-(material.roughness??.5))*.5;
        const shade=(technical?.59:.34)+key*.69+fill*.26;
        const glow=material.emissiveIntensity||0;
        const r=Math.min(255,Math.round(red*shade+sheen*125+glow*18)),g=Math.min(255,Math.round(green*shade+sheen*130+glow*18)),bl=Math.min(255,Math.round(blue*shade+sheen*145+glow*18));
        faces.push({ax,ay,bx,by,cx,cy,z:(az+bz+cz)/3-(material.map?.image ? .000001:0),fill:`rgb(${r},${g},${bl})`,item,face,texture:material.map?.image,opacity:material.opacity??1});
      }
    }
    faces.sort((a,b)=>b.z-a.z);
    const g=this.context;g.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    this.drawRoom(g,W,H,technical,camera);
    for(const f of faces){
      const midx=(f.ax+f.bx+f.cx)/3,midy=(f.ay+f.by+f.cy)/3;
      const widen=(v,m)=>v+(v>m?.19:-.19);
      g.beginPath();g.moveTo(widen(f.ax,midx),widen(f.ay,midy));g.lineTo(widen(f.bx,midx),widen(f.by,midy));g.lineTo(widen(f.cx,midx),widen(f.cy,midy));g.closePath();
      if(f.texture&&f.item.uv){this.drawTexture(g,f);}
      else{g.globalAlpha=f.opacity;g.fillStyle=f.fill;g.fill();g.globalAlpha=1;}
    }
    const vignette=g.createRadialGradient(W*.5,H*.5,H*.22,W*.5,H*.5,Math.max(W,H)*.72);vignette.addColorStop(0,'rgba(6,9,13,0)');vignette.addColorStop(1,'rgba(6,9,13,.48)');g.fillStyle=vignette;g.fillRect(0,0,W,H);
  }
  drawTexture(g,face) {
    const {texture,item,face:indices}=face,uv=item.uv,tw=texture.width,th=texture.height;
    const sx0=uv.getX(indices.a)*tw,sy0=(1-uv.getY(indices.a))*th,sx1=uv.getX(indices.b)*tw,sy1=(1-uv.getY(indices.b))*th,sx2=uv.getX(indices.c)*tw,sy2=(1-uv.getY(indices.c))*th;
    const denom=sx0*(sy2-sy1)+sx1*(sy0-sy2)+sx2*(sy1-sy0);if(Math.abs(denom)<.001)return;
    const m11=(face.ax*(sy2-sy1)+face.bx*(sy0-sy2)+face.cx*(sy1-sy0))/denom;
    const m12=(face.ay*(sy2-sy1)+face.by*(sy0-sy2)+face.cy*(sy1-sy0))/denom;
    const m21=(face.ax*(sx1-sx2)+face.bx*(sx2-sx0)+face.cx*(sx0-sx1))/denom;
    const m22=(face.ay*(sx1-sx2)+face.by*(sx2-sx0)+face.cy*(sx0-sx1))/denom;
    const dx=(face.ax*(sx2*sy1-sx1*sy2)+face.bx*(sx0*sy2-sx2*sy0)+face.cx*(sx1*sy0-sx0*sy1))/denom;
    const dy=(face.ay*(sx2*sy1-sx1*sy2)+face.by*(sx0*sy2-sx2*sy0)+face.cy*(sx1*sy0-sx0*sy1))/denom;
    g.save();g.clip();g.transform(m11,m12,m21,m22,dx,dy);g.drawImage(texture,0,0);g.restore();
  }
  drawRoom(g,W,H,technical,camera) {
    const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,technical?'#252e3a':'#141a24');bg.addColorStop(.51,technical?'#1b2532':'#0c111a');bg.addColorStop(1,technical?'#252d38':'#171e29');g.fillStyle=bg;g.fillRect(0,0,W,H);
    const horizon=H*.51;
    g.strokeStyle=technical?'rgba(108,127,147,.14)':'rgba(108,127,147,.075)';g.lineWidth=1;
    for(let i=0;i<7;i++){g.beginPath();g.moveTo(W*i/6,0);g.lineTo(W*i/6,horizon);g.stroke();}
    g.beginPath();g.moveTo(0,horizon);g.lineTo(W,horizon);g.stroke();
    for(const fx of [.26,.54,.80]){
      const glow=g.createRadialGradient(W*fx,H*.05,0,W*fx,H*.05,H*.40);glow.addColorStop(0,'rgba(211,229,255,.18)');glow.addColorStop(.12,'rgba(195,214,243,.055)');glow.addColorStop(1,'rgba(195,214,243,0)');g.fillStyle=glow;g.fillRect(0,0,W,H*.65);
      const beam=g.createLinearGradient(0,H*.10,0,H*.75);beam.addColorStop(0,'rgba(198,215,242,.045)');beam.addColorStop(1,'rgba(198,215,242,0)');g.fillStyle=beam;g.beginPath();g.moveTo(W*fx-25,H*.06);g.lineTo(W*fx+25,H*.06);g.lineTo(W*fx+130,H*.77);g.lineTo(W*fx-130,H*.77);g.closePath();g.fill();
      g.fillStyle='#8a98ac';g.fillRect(W*fx-27,H*.055,54,2);g.fillStyle='rgba(224,235,252,.9)';g.fillRect(W*fx-24,H*.055,48,1);
    }
    const center=new THREE.Vector3(0,.01,0).project(camera);const cy=(1-center.y)*H*.5,cx=(center.x+1)*W*.5;
    const distance=camera.position.distanceTo(new THREE.Vector3(0,.65,0));
    const radius=W*.42*Math.min(1.7,10.9/distance);
    const shadow=g.createRadialGradient(cx,cy,0,cx,cy,radius);shadow.addColorStop(0,'rgba(0,0,0,.64)');shadow.addColorStop(.62,'rgba(0,0,0,.27)');shadow.addColorStop(1,'rgba(0,0,0,0)');
    g.save();g.translate(cx,cy);g.scale(1,.24);g.translate(-cx,-cy);g.fillStyle=shadow;g.beginPath();g.arc(cx,cy,radius,0,Math.PI*2);g.fill();g.restore();
    g.strokeStyle='rgba(131,146,164,.12)';g.beginPath();g.ellipse(cx,cy,radius*1.14,radius*.33,0,0,Math.PI*2);g.stroke();
  }
  dispose() {this.meshes=[];this.model=null;this.context=null;}
  forceContextLoss() {}
}
