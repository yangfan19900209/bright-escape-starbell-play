'use strict';
(function(){
const factories={
"actor-pose": function(require,module,exports){
'use strict';
const frames=require('./art'),eyes=require('./art-eyes'),tips=require('./art-points');
const travel=require('./art-travel');
const riding=require('./riding');
const unit=70/frames.none0[3],neutral=[1,1,0];
// The height column is a fraction of the standing silhouette, independent of energy in the hand.
const shapes={Draw:[1,.96,.025],Gather:[1,.92,.055],Brace:[1,.87,.095],
 Ready:[1,.94,-.035],Surge:[1,.98,-.04],'4':[1,.96,-.09],
 Follow:[1,.91,-.13],Recoil:[1,.97,.05],Recover:[1,.98,.012]};
const registered={};
for(const [form,poses] of Object.entries(eyes))for(const [pose,eye] of Object.entries(poses)){
 const id=form+pose,[,,w,h,pivot]=frames[id],eyeLine=Math.round(eye[1]*h);
 const shape=shapes[pose],cast=shape?[shape[0],frames[form+'0'][3]*shape[1]/h,shape[2]]:neutral;
 registered[id]={w,h,pivot,eyeX:eye[0]*w-pivot,eyeLine,eyeAboveFoot:h-eyeLine,cast};
}
for(const [id,[ex,ey]] of Object.entries(travel.eyes)){
 const [,,w,h,pivot]=frames[id];
 registered[id]={w,h,pivot,eyeX:ex-pivot,eyeLine:ey,eyeAboveFoot:h-ey,cast:neutral};
}
function castShape(p,id){
 if(!p.charging&&!p.bell&&!(p.attack>0)&&!p.slam&&!p.formTime&&!p.dash)return neutral;
 return registered[id]?.cast||neutral;
}
function targets(p,id){
 const a=registered[id],[sx,sy,lean]=castShape(p,id),scale=travel.frames[id]?travel.scale:unit,xScale=scale*sx;
 return {height:a.h*scale*sy,eyeH:a.eyeAboveFoot*scale*sy,
  eyeX:(a.eyeX-lean*a.eyeAboveFoot)*xScale,xScale};
}
function restPose(p,id){
 const values=targets({},id);
 return {...values,velocity:{height:0,eyeH:0,eyeX:0,xScale:0},id,layers:[{id,w:1}],from:[],mix:1,span:.10,tail:0,active:false};
}
// Exact critically damped response, evaluated at the same fixed step as the actor.
function follow(r,key,goal,dt,frequency){
 const delta=r[key]-goal,v=r.velocity[key],b=v+frequency*delta,decay=Math.exp(-frequency*dt);
 r[key]=goal+(delta+b*dt)*decay;r.velocity[key]=(v-frequency*b*dt)*decay;
}
function updateRig(p,id,dt,time=0){
 if(riding.mounted(p)){
  p.ridePose=riding.pose(p,time);p.rig=null;p.lastPose=p.form+'0';return;
 }
 p.ridePose=null;
 const active=p.charging||p.bell||p.attack>0||p.slam||p.dash>0||p.formTime>0;
 let r=p.rig;
 if(!active&&(travel.frames[id]||!r||r.tail<=0)){p.rig=null;p.lastPose=id;return;}
 if(!r)r=p.rig=restPose(p,p.lastPose||p.form+'0');
 r.tail=active?.38:Math.max(0,r.tail-dt);
 if(r.id!==id){
  r.from=r.layers.map(a=>({...a}));r.id=id;r.mix=0;
  r.span=p.attack>0&&p.castHeavy?.098:p.formTime>.55?.15:.105;
 }
 if(r.mix<1){
  r.mix=Math.min(1,r.mix+dt/r.span);const k=r.mix*r.mix*(3-2*r.mix);
  const layers=r.from.map(a=>({id:a.id,w:a.w*(1-k)}));
  const present=layers.find(a=>a.id===id);if(present)present.w+=k;else layers.push({id,w:k});
  r.layers=layers.filter(a=>a.w>.007);
  const total=r.layers.reduce((n,a)=>n+a.w,0);for(const a of r.layers)a.w/=total;
  if(r.mix===1)r.from=[];
 }
 const goal=targets(p,id);
 for(const key of ['height','eyeH','eyeX','xScale'])follow(r,key,goal[key],dt,key==='eyeX'?28:24);
 const handled=p.charging||p.bell||p.attack>0;
 const step=handled&&p.ground?p.stepWeight:0;
 const glide=handled&&p.gliding;
 const phase=glide?p.glideTime/.78:p.stride;
 r.feet=glide||step>.08?(glide?'windGlide':'noneWalk')+(Math.floor(phase*travel.count)%travel.count):null;
 r.glideFeet=glide;
 const beat=phase*Math.PI*2;
 r.lift=step*(.65-1.1*Math.cos(beat*2))+(p.charging?.70*Math.sin(time*5.8):0);
 r.sway=step*.9*Math.sin(beat)+(p.charging?.38*Math.sin(time*5.8+.6):0);
 r.active=true;p.lastPose=id;
}
function localPoint(r,id,x,above){
 const a=registered[id],lower=above/a.eyeAboveFoot,shift=r.eyeX-a.eyeX*r.xScale;
 return {x:x*r.xScale+shift*Math.min(1,lower),
  y:above<=a.eyeAboveFoot?r.eyeH*lower:r.eyeH+(above-a.eyeAboveFoot)*(r.height-r.eyeH)/a.eyeLine};
}
function visibleWand(p,face,fallback){
 const r=p.rig;
 if(!r?.active)return fallback;
 let x=0,y=0;
 for(const layer of r.layers){
  const a=registered[layer.id],tip=tips[layer.id]||[a.eyeX+9,a.eyeAboveFoot*.64];
  const pt=localPoint(r,layer.id,tip[0],tip[1]);x+=pt.x*layer.w;y+=pt.y*layer.w;
 }
 const weight=r.feet?1:y/r.height;
 return {x:p.x+face*(x+(r.sway||0)*weight),y:p.y+1-y-(r.lift||0)*weight};
}
// For every casting painting, trace the lower edge of the cape and tunic, crossing
// the thighs at the hip. A crouch and a forward lunge have very different seams.
const hems={
 Draw:[.55,[0,.76,.32,.76,.44,.79,.61,.80,.76,.74,1,.71]],
 Gather:[.61,[0,.98,.23,.96,.34,.84,.48,.80,.61,.78,.74,.74,.86,.70,1,.70]],
 Brace:[.62,[0,.79,.32,.81,.43,.75,.56,.81,.64,.84,.77,.78,.91,.67,1,.66]],
 Ready:[.57,[0,.82,.31,.81,.45,.78,.59,.77,.72,.72,.86,.68,1,.67]],
 Surge:[.64,[0,.77,.38,.76,.47,.78,.59,.75,.70,.73,.80,.69,1,.66]],
 '4':[.43,[0,.82,.20,.81,.32,.78,.42,.80,.52,.78,.62,.74,.76,.70,1,.70]],
 Follow:[.52,[0,.71,.38,.68,.44,.75,.54,.79,.63,.75,.72,.70,1,.72]],
 Recoil:[.61,[0,.83,.33,.81,.47,.79,.59,.80,.71,.75,.82,.70,1,.66]],
 Recover:[.44,[0,.83,.23,.82,.36,.82,.47,.80,.57,.77,.68,.72,1,.79]]
};
const standingHem=[.51,[0,.85,.23,.86,.35,.81,.48,.80,.64,.79,.78,.77,1,.76]];
function hem(id){return hems[id.replace(/^(none|fire|wind|stone)/,'')]||standingHem;}
function garmentPoint(r,id,u,v){
 const a=registered[id];return localPoint(r,id,u*a.w-a.pivot,(1-v)*a.h);
}
function clipGarment(c,r,id){
 const [,edge]=hem(id);
 c.beginPath();c.moveTo(-160,-200);c.lineTo(-160,0);
 for(let i=0;i<edge.length;i+=2){
  const pt=garmentPoint(r,id,edge[i],edge[i+1]);c.lineTo(pt.x,-pt.y);
 }
 c.lineTo(160,0);c.lineTo(160,-200);c.closePath();c.clip();
}
function drawFeet(c,imgs,texture,r){
 let hipX=0,hipH=0;
 for(const {id,w} of r.layers){
  const [u,edge]=hem(id);
  let i=2;while(i<edge.length-2&&u>edge[i])i+=2;
  const y=edge[i-1]+(edge[i+1]-edge[i-1])*(u-edge[i-2])/(edge[i]-edge[i-2]);
  const hip=garmentPoint(r,id,u,y);hipX+=hip.x*w;hipH+=hip.y*w;
 }
 const [x,y,w,h,pivot]=frames[r.feet];
 // The trailing knees start higher than grounded boots because the flight cells
 // have a common eye anchor and transparent space below the soles.
 const crop=Math.round(h*(r.glideFeet?.42:.256));
 const height=Math.max(9,hipH+3+r.lift),wide=r.glideFeet?travel.scale:Math.min(.84,Math.max(.57,height/crop));
 c.drawImage(texture(imgs.atlas,r.feet),x,y+h-crop,w,crop,hipX+r.sway-pivot*wide,-height,w*wide,height);
}
// Map the eye and the feet to the same places in both paintings. The head keeps its own height.
function drawLayer(c,img,id,r){
 const a=registered[id],f=frames[id],shift=r.eyeX-a.eyeX*r.xScale;
 c.save();c.transform(r.xScale,0,-shift/a.eyeAboveFoot,r.eyeH/a.eyeAboveFoot,0,0);
 c.beginPath();c.rect(-a.pivot-1,-a.eyeAboveFoot,a.w+2,a.eyeAboveFoot+1);c.clip();
 c.drawImage(img,f[0],f[1],a.w,a.h,-a.pivot,-a.h,a.w,a.h);c.restore();
 c.save();c.translate(shift,-r.eyeH);
 c.scale(r.xScale,(r.height-r.eyeH)/a.eyeLine);
 c.beginPath();c.rect(-a.pivot-1,-a.eyeLine-1,a.w+2,a.eyeLine+1);c.clip();
 c.drawImage(img,f[0],f[1],a.w,a.h,-a.pivot,-a.eyeLine,a.w,a.h);c.restore();
}
const tile=288,pivotX=144,pivotY=235;
function drawRegistered(c,imgs,texture,p,face){
 const r=p.rig;if(!r?.active||!imgs.atlas)return false;
 const baseY=p.y+1;
 if(r.feet){
  c.save();c.translate(p.x,baseY);c.scale(face,1);drawFeet(c,imgs,texture,r);c.restore();
 }
 const surface=imgs.poseSurface,mix=r.layers.length>1&&surface;
 const dest=mix?surface.getContext('2d'):c;
 if(mix){dest.setTransform(1,0,0,1,0,0);dest.clearRect(0,0,surface.width,surface.height);}
 dest.save();
 if(mix){const d=surface.width/tile;dest.scale(d,d);dest.translate(pivotX,pivotY);dest.globalCompositeOperation='lighter';}
 else{dest.translate(p.x,baseY);dest.scale(face,1);}
 if(r.feet)dest.translate(r.sway||0,-(r.lift||0));
 else dest.transform(1,0,-(r.sway||0)/r.height,1+(r.lift||0)/r.height,0,0);
 const alpha=dest.globalAlpha;
 for(const layer of r.layers){
  dest.save();dest.globalAlpha=alpha*layer.w;
  if(r.feet)clipGarment(dest,r,layer.id);
  drawLayer(dest,texture(imgs.atlas,layer.id),layer.id,r);dest.restore();
 }
 dest.restore();
 if(mix){c.save();c.translate(p.x,baseY);c.scale(face,1);c.drawImage(surface,-pivotX,-pivotY,tile,tile);c.restore();}
 return true;
}
module.exports={castShape,updateRig,visibleWand,drawRegistered,tile,registered,localPoint};

},
"app": function(require,module,exports){
'use strict';
const {Game}=require('./game');
const {draw}=require('./interface');
const {soundEngine}=require('./audio');
const {makeViewport,standard}=require('./viewport');
const heldActions=new Set(['bell','attack','jump','dash']);
function createApp(opts){
 const g=new Game(opts.read(),opts.save),audio=soundEngine(opts.audio),c=opts.canvas.getContext('2d');
 const pointers=new Map(),sources=new Map(),edges={};let view=standard,hot=[],last=null,acc=0,hidden=false,focus=-1;
 g.touch=!!opts.touch;g.stick=0;
 const touchState={origin:null,held:active};
 function active(k){return Array.from(sources.values()).includes(k);}
 function release(key,cancel=false){
  const v=sources.get(key);sources.delete(key);
  if(!v||active(v))return;
  if(cancel){delete edges[v+'Down'];edges[v+'Cancel']=true;}else edges[v+'Up']=true;
 }
 function hold(key,action){if(sources.get(key)===action)return;release(key);if(!action)return;if(!active(action))edges[action+'Down']=true;sources.set(key,action);}
 function resetInput(){
  g.stick=0;touchState.origin=null;sources.clear();pointers.clear();
  for(const k of Object.keys(edges))delete edges[k];
  if(g.player.charging)edges.attackCancel=true;
  focus=-1;
 }
 function activate(id){
  if(id==='sound'){g.toggleSound();audio.tick(g);return;}
  resetInput();if(id==='start'){g.start();}else if(id==='resume'){g.scene='play';}else if(id==='back')g.back();
  else if(id==='title')g.changeScene('title');else if(id==='abilityBook')g.changeScene('book');else if(id==='book'||id==='map'||id==='pause')g.changeScene(id);
  else if(id==='next')g.start(Math.min(3,g.index+1));else if(id==='retry')g.retry();
  else if(id.startsWith('wear-')){if(g.wearFromBook(id.slice(5)))g.back();}
  else if(id==='forms')g.bookPage=0;else if(id==='species')g.bookPage=1;else if(/^level[0-3]$/.test(id))g.start(+id.slice(-1),true);
  render();
 }
 function resize(w,h,dpr=1,area,menu){
   const next=makeViewport(w,h,dpr,area,menu);
   if(next.w!==view.w||next.h!==view.h||['left','right','top','bottom'].some(k=>Math.abs(next.safe[k]-view.safe[k])>.5))resetInput();
   view=next;g.viewWidth=view.width;g.camera=g.limitCamera(g.camera);
   const pixelsW=Math.round(w*view.dpr),pixelsH=Math.round(h*view.dpr);
   if(opts.canvas.width!==pixelsW)opts.canvas.width=pixelsW;
   if(opts.canvas.height!==pixelsH)opts.canvas.height=pixelsH;
   render();
 }
 function logical(x,y){return {x:x/view.s,y:(y-view.y)/view.s};}
 function hit(p){return hot.find(b=>b.hitR?Math.hypot(p.x-b.cx,p.y-b.cy)<=b.hitR:p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);}
 function pointer(type,id,x,y,touch=true){
  const k='p'+id,pos=logical(x,y);
  if(type==='down'){audio.unlock();if(touch&&!g.touch){g.touch=true;render();}
   const target=hit(pos);if(!target||pointers.has(id))return;
   if(target.id==='stick'){
    if(!touchState.origin){touchState.origin={...pos,id,travel:target.travel};g.stick=0;pointers.set(id,'stick');}
    return;
   }
   if(heldActions.has(target.id)&&g.scene==='play'){hold(k,target.id);pointers.set(id,target.id);}else activate(target.id);
  }else if(type==='move'&&touchState.origin?.id===id){
   const pad=touchState.origin,offset=(pos.x-pad.x)/pad.travel;
   g.stick=Math.sign(offset)*Math.max(0,Math.min(1,(Math.abs(offset)-.14)/.86));
  }else if(type==='move'&&(pointers.get(id)==='attack'||pointers.get(id)==='jump')){
   const target=hit(pos);
   if(target&&(target.id==='attack'||target.id==='jump')){hold(k,target.id);pointers.set(id,target.id);}
  }else if(type==='up'||type==='cancel'){
   release(k,type==='cancel');pointers.delete(id);
   if(touchState.origin?.id===id){touchState.origin=null;g.stick=0;}
  }
 }
 const keys={ShiftLeft:'walk',ShiftRight:'walk',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'jump',ArrowUp:'jump',KeyW:'jump',KeyJ:'bell',KeyK:'attack',KeyL:'dash'};
 function key(code,down,repeat=false){
  if(!down){release('k'+code);return;}
  if(repeat)return;audio.unlock();
  if(code==='Escape'||code==='KeyP'){g.back();resetInput();render();return;}
  if(code==='KeyI'&&(g.scene==='play'||g.scene==='pause'||g.scene==='title')){activate('book');return;}
  if(g.scene!=='play'){
    if(code==='Tab'||code==='ArrowDown'||code==='ArrowRight'){focus=(focus+1)%Math.max(1,hot.length);render();return;}
    if(code==='ArrowUp'||code==='ArrowLeft'){focus=(focus-1+hot.length)%Math.max(1,hot.length);render();return;}
    if(code==='KeyI'&&g.scene==='book'){activate('back');return;}
    if(code==='Enter'||code==='Space'){const def={title:g.data.records[3].cleared?'map':'start',pause:'resume',retry:'retry',clear:'next',ending:'map',map:'back',book:'back'};
      activate(hot[focus]?.id||def[g.scene]);}
    return;
  }
  if(code==='KeyQ'&&g.scene==='play'){g.cycleForm(-1);render();return;}
  if(code==='KeyE'&&g.scene==='play'){g.cycleForm(1);render();return;}
  if(g.scene==='play'&&{Digit1:'none',Digit2:'fire',Digit3:'wind',Digit4:'stone'}[code]){
    g.quickEquip({Digit1:'none',Digit2:'fire',Digit3:'wind',Digit4:'stone'}[code]);render();return;
  }
  if(keys[code])hold('k'+code,keys[code]);
 }
 function render(){
  c.setTransform(view.dpr,0,0,view.dpr,0,0);c.save();c.translate(0,view.y);c.scale(view.s,view.s);hot=draw(c,g,opts.images,view,touchState);
  if(focus>=0&&hot[focus]&&g.scene!=='play'){const b=hot[focus];c.strokeStyle='#b0f8eb';c.lineWidth=2;c.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);}c.restore();
 }
 function frame(now){
   if(hidden){last=null;return;}
   if(last===null)last=now;
   acc+=Math.min(.12,Math.max(0,(now-last)/1000));last=now;const dt=1/60;
   while(acc+1e-9>=dt){let input={...edges,axis:g.stick};for(const s of sources.values())input[s]=true;
    const before=g.scene;g.step(dt,input);for(const k of Object.keys(edges))delete edges[k];if(before!==g.scene)resetInput();acc-=dt;}
   audio.tick(g);render();
 }
 function suspend(){hidden=true;resetInput();last=null;acc=0;if(g.scene==='play')g.changeScene('pause');audio.stop();render();}
 function resume(){hidden=false;last=null;acc=0;render();}
 return {game:g,resize,pointer,key,frame,suspend,resume,render,activate};
}
module.exports={createApp};

},
"art-detail": function(require,module,exports){
// Generated by tools/build-art.js. Optional fifth value is the horizontal foot pivot.
module.exports = {
  "airRibbon0": [351, 1275, 149, 58],
  "airRibbon1": [1104, 1275, 176, 56],
  "airRibbon2": [1286, 1275, 186, 56],
  "airRibbon3": [1478, 1275, 179, 56],
  "burrDazed": [1661, 1068, 106, 89],
  "burrTuck": [1337, 1068, 99, 91],
  "burrWake": [3, 1180, 127, 89],
  "capAim": [916, 1068, 144, 97],
  "capBrake": [800, 1068, 110, 99],
  "capHover": [1442, 1068, 130, 90],
  "chest0": [546, 1180, 103, 82],
  "chest1": [136, 1180, 104, 88],
  "chest2": [1066, 1068, 105, 95],
  "chest3": [1300, 921, 107, 106],
  "cloudBank": [741, 3, 607, 174],
  "cloudShelf": [1413, 921, 184, 106],
  "elderCoil": [240, 3, 203, 217],
  "elderLift": [3, 3, 231, 224],
  "elderSweep": [449, 3, 286, 199],
  "fallFruit": [755, 1180, 57, 68],
  "fallWater0": [1548, 757, 67, 142],
  "fallWater1": [1621, 757, 69, 142],
  "fallWater2": [3, 921, 68, 141],
  "fallWater3": [1696, 757, 70, 142],
  "fireBloom": [77, 921, 146, 126],
  "fireBrake": [790, 757, 158, 149, 99],
  "fireCrest": [135, 757, 160, 153, 93],
  "fireDraw": [121, 589, 139, 161, 67],
  "fireFleck": [389, 921, 140, 122],
  "fireFlyA": [3, 1275, 121, 59],
  "fireFlyB": [1413, 1180, 129, 60],
  "fireLaunch": [1517, 233, 101, 171, 45],
  "firePin": [246, 1180, 91, 86],
  "fireReach": [226, 412, 139, 166, 78],
  "fireReady": [691, 589, 149, 160, 61],
  "fireRecoil": [789, 412, 147, 164, 66],
  "fireSwing": [1300, 589, 126, 158, 63],
  "fireToe": [1390, 412, 111, 162, 51],
  "lootStar0": [1200, 1180, 65, 64],
  "lootStar1": [1271, 1180, 49, 64],
  "lootStar2": [1326, 1180, 26, 64],
  "lootStar3": [1358, 1180, 49, 64],
  "lumi0": [1578, 1068, 77, 90],
  "lumi1": [1109, 1180, 85, 65],
  "lumi2": [946, 1180, 84, 66],
  "lumi3": [130, 1275, 85, 59],
  "meadowBank": [3, 233, 730, 173],
  "meadowShelf": [3, 1068, 212, 106],
  "mothFold": [569, 1068, 93, 101],
  "mothUp": [467, 1068, 96, 104],
  "mothWide": [1177, 1068, 154, 95],
  "noneBloom": [700, 921, 142, 118],
  "noneBrake": [954, 757, 156, 149, 94],
  "noneCrest": [301, 757, 152, 153, 84],
  "noneDraw": [266, 589, 131, 161, 60],
  "noneFleck": [996, 921, 131, 115],
  "noneFlyA": [1663, 1275, 123, 54],
  "noneFlyB": [948, 1275, 150, 57],
  "noneLaunch": [1624, 233, 98, 171, 41],
  "nonePin": [343, 1180, 83, 84],
  "noneReach": [371, 412, 129, 166, 67],
  "noneReady": [846, 589, 144, 160, 59],
  "noneRecoil": [942, 412, 143, 164, 66],
  "noneSwing": [1432, 589, 123, 158, 61],
  "noneToe": [1507, 412, 108, 162, 47],
  "puff0": [121, 1340, 63, 45],
  "puff1": [818, 1180, 122, 68],
  "puff2": [1548, 1180, 126, 60],
  "puff3": [3, 1340, 112, 48],
  "rootWave": [229, 921, 154, 126],
  "slateBank": [739, 233, 772, 173],
  "slateShelf": [221, 1068, 240, 106],
  "sprig": [1036, 1180, 67, 66],
  "stoneBloom": [1133, 921, 161, 112],
  "stoneBrake": [1116, 757, 158, 149, 97],
  "stoneCrest": [459, 757, 157, 153, 90],
  "stoneDraw": [403, 589, 138, 161, 66],
  "stoneFleck": [668, 1068, 126, 101],
  "stoneFlyA": [506, 1275, 134, 58],
  "stoneFlyB": [646, 1275, 147, 58],
  "stoneLaunch": [3, 412, 106, 171, 50],
  "stonePin": [432, 1180, 108, 84],
  "stoneReach": [506, 412, 134, 166, 73],
  "stoneReady": [996, 589, 144, 160, 56],
  "stoneRecoil": [1091, 412, 139, 164, 57],
  "stoneSwing": [1561, 589, 121, 158, 60],
  "stoneToe": [1621, 412, 111, 162, 50],
  "vineThorn": [1446, 757, 96, 144],
  "windBloom": [535, 921, 159, 122],
  "windBrake": [1280, 757, 160, 149, 99],
  "windCrest": [622, 757, 162, 153, 95],
  "windDraw": [547, 589, 138, 161, 66],
  "windFleck": [848, 921, 142, 116],
  "windFlyA": [221, 1275, 124, 59],
  "windFlyB": [799, 1275, 143, 58],
  "windLaunch": [115, 412, 105, 171, 49],
  "windPin": [655, 1180, 94, 82],
  "windReach": [646, 412, 137, 166, 76],
  "windReady": [1146, 589, 148, 160, 60],
  "windRecoil": [1236, 412, 148, 164, 66],
  "windSwing": [3, 757, 126, 158, 64],
  "windToe": [3, 589, 112, 162, 51]
};

},
"art-eyes": function(require,module,exports){
// Normalized eye registration in the trimmed, right-facing actor frames.
module.exports={
  none: {"0":[0.7475,0.3065],"Draw":[0.7061,0.3137],"Gather":[0.708,0.3483],"Brace":[0.8038,0.387],"Ready":[0.6562,0.3094],"Surge":[0.7105,0.2821],"4":[0.571,0.3449],"Follow":[0.6979,0.406],"Recoil":[0.6469,0.2835],"Recover":[0.6291,0.3818],"1":[0.7569,0.3201],"2":[0.8077,0.3117],"3":[0.792,0.3483],"Pass":[0.7828,0.3241],"Stride":[0.7556,0.3282],"Fall":[0.7331,0.3244],"Blink":[0.7424,0.3482],"Land":[0.8158,0.3507],"Rise":[0.7924,0.3217],"Launch":[0.7092,0.2602],"Crest":[0.7533,0.2974],"Reach":[0.7326,0.3102],"Brake":[0.7083,0.3121],"Toe":[0.7731,0.3179],"Swing":[0.7927,0.3513]},
  fire: {"0":[0.755,0.3166],"Draw":[0.7158,0.3199],"Gather":[0.6992,0.3459],"Brace":[0.793,0.4007],"Ready":[0.6544,0.3156],"Surge":[0.7321,0.2765],"4":[0.5859,0.3513],"Follow":[0.725,0.406],"Recoil":[0.6361,0.2835],"Recover":[0.639,0.3725],"1":[0.7773,0.3283],"2":[0.8228,0.3098],"3":[0.8025,0.339],"Pass":[0.7852,0.3282],"Stride":[0.757,0.3262],"Fall":[0.75,0.3402],"Blink":[0.765,0.3521],"Land":[0.8152,0.3483],"Rise":[0.8024,0.3133],"Launch":[0.7178,0.2661],"Crest":[0.7656,0.2974],"Reach":[0.7518,0.3163],"Brake":[0.7184,0.3188],"Toe":[0.7793,0.3241],"Swing":[0.7897,0.3513]},
  wind: {"0":[0.7644,0.3125],"Draw":[0.7138,0.3137],"Gather":[0.6976,0.3483],"Brace":[0.7781,0.387],"Ready":[0.652,0.3219],"Surge":[0.7225,0.2709],"4":[0.5881,0.3449],"Follow":[0.7197,0.406],"Recoil":[0.6385,0.2835],"Recover":[0.6447,0.3682],"1":[0.793,0.3242],"2":[0.8269,0.3117],"3":[0.8089,0.3483],"Pass":[0.796,0.3241],"Stride":[0.7657,0.3221],"Fall":[0.7621,0.3423],"Blink":[0.745,0.3482],"Land":[0.8212,0.3507],"Rise":[0.8008,0.3217],"Launch":[0.7381,0.2661],"Crest":[0.7685,0.2974],"Reach":[0.7555,0.3163],"Brake":[0.7219,0.3188],"Toe":[0.7902,0.3241],"Swing":[0.7976,0.3386]},
  stone: {"0":[0.7475,0.3225],"Draw":[0.7138,0.3199],"Gather":[0.7033,0.3459],"Brace":[0.7885,0.3938],"Ready":[0.6354,0.3156],"Surge":[0.7121,0.2654],"4":[0.5838,0.3428],"Follow":[0.7289,0.3993],"Recoil":[0.6079,0.2835],"Recover":[0.6444,0.3658],"1":[0.7846,0.3223],"2":[0.8228,0.3179],"3":[0.8025,0.3459],"Pass":[0.781,0.3344],"Stride":[0.7536,0.3323],"Fall":[0.7674,0.3284],"Blink":[0.7574,0.3521],"Land":[0.8144,0.3483],"Rise":[0.804,0.3133],"Launch":[0.7406,0.2602],"Crest":[0.7611,0.2974],"Reach":[0.7425,0.3163],"Brake":[0.7184,0.3188],"Toe":[0.7793,0.3302],"Swing":[0.7893,0.3513]}
};

},
"art-points": function(require,module,exports){
// Generated crystal sockets in texture pixels from the foot anchor.
module.exports = {
  "stone4": [
    123,
    95
  ],
  "fire4": [
    115,
    95
  ],
  "none4": [
    116,
    94
  ],
  "wind4": [
    116,
    95
  ],
  "fireGather": [
    70,
    86
  ],
  "stoneGather": [
    72,
    87
  ],
  "noneGather": [
    63,
    86
  ],
  "windGather": [
    72,
    86
  ],
  "fireDraw": [
    63,
    111
  ],
  "noneDraw": [
    62,
    111
  ],
  "stoneDraw": [
    62,
    110
  ],
  "windDraw": [
    62,
    110
  ],
  "fireReady": [
    75,
    139
  ],
  "noneReady": [
    73,
    142
  ],
  "stoneReady": [
    74,
    140
  ],
  "windReady": [
    76,
    138
  ],
  "fireSurge": [
    70,
    165
  ],
  "noneSurge": [
    70,
    166
  ],
  "stoneSurge": [
    68,
    168
  ],
  "windSurge": [
    69,
    167
  ],
  "fireFollow": [
    122,
    55
  ],
  "noneFollow": [
    125,
    57
  ],
  "stoneFollow": [
    121,
    53
  ],
  "windFollow": [
    123,
    53
  ],
  "fireBrace": [
    48,
    69
  ],
  "noneBrace": [
    48,
    69
  ],
  "stoneBrace": [
    47,
    67
  ],
  "windBrace": [
    48,
    71
  ]
};

},
"art-powers": function(require,module,exports){
// Generated by tools/build-art.js. Optional fifth value is the horizontal foot pivot.
module.exports = {
  "burrPush": [1039, 1607, 120, 70, 60],
  "burrSkid": [197, 1607, 116, 77, 64],
  "burrWheel": [992, 1415, 94, 90, 47],
  "burrYawn": [220, 1308, 113, 100, 60],
  "capDown": [414, 1308, 90, 99],
  "capParachute": [104, 1415, 129, 93],
  "capSpear": [912, 1607, 121, 71],
  "capUp": [3, 1308, 116, 101],
  "dewBerry": [3, 1693, 73, 64],
  "elderBrace": [1452, 267, 228, 192, 119],
  "elderCrown": [645, 267, 277, 219, 147],
  "elderHeart": [928, 267, 222, 202, 109],
  "elderReach": [1156, 267, 290, 193, 191],
  "emberLeap": [761, 1607, 145, 73, 90],
  "emberListen": [1662, 1168, 107, 106, 66],
  "emberPlant": [1042, 1515, 100, 83, 58],
  "emberSniff": [1189, 1415, 94, 88, 55],
  "fireBrace": [1223, 861, 186, 146, 115],
  "fireBurst0": [399, 1693, 45, 52],
  "fireBurst1": [239, 1415, 90, 92],
  "fireBurst2": [1184, 1016, 176, 135],
  "fireBurst3": [3, 686, 225, 169],
  "fireBurst4": [940, 501, 214, 173],
  "fireBurst5": [1103, 686, 161, 152],
  "fireBurst6": [742, 1168, 116, 118],
  "fireBurst7": [1687, 1515, 99, 80],
  "fireCloud": [1247, 1515, 100, 81],
  "fireCrestFold": [1240, 1607, 304, 66],
  "fireCrestOpen": [196, 1016, 347, 140],
  "fireFollow": [3, 861, 300, 149, 162],
  "fireGlow": [607, 1308, 96, 96],
  "fireMist": [709, 1308, 96, 96],
  "fireNova": [316, 3, 379, 252],
  "firePalm0": [1289, 1415, 64, 86],
  "firePalm1": [1359, 1415, 64, 86],
  "firePalm10": [1429, 1415, 64, 86],
  "firePalm11": [1499, 1415, 64, 86],
  "firePalm12": [1569, 1415, 64, 86],
  "firePalm13": [1639, 1415, 64, 86],
  "firePalm14": [1709, 1415, 64, 86],
  "firePalm15": [3, 1515, 64, 86],
  "firePalm2": [73, 1515, 64, 86],
  "firePalm3": [143, 1515, 64, 86],
  "firePalm4": [213, 1515, 64, 86],
  "firePalm5": [283, 1515, 64, 86],
  "firePalm6": [353, 1515, 64, 86],
  "firePalm7": [423, 1515, 64, 86],
  "firePalm8": [493, 1515, 64, 86],
  "firePalm9": [563, 1515, 64, 86],
  "fireSeal": [3, 1168, 142, 134],
  "fireShard": [263, 1763, 93, 39],
  "fireStreak": [740, 1693, 126, 46],
  "fireSurge": [3, 501, 237, 179, 150],
  "fireWake": [872, 1693, 108, 46],
  "fireWisp": [319, 1607, 46, 76],
  "hillBelfry": [1062, 3, 190, 250],
  "millWheel": [397, 267, 242, 226],
  "mossCurl": [1092, 1415, 91, 89, 43],
  "mossHear": [1398, 1168, 105, 109, 53],
  "mossPlant": [1627, 1308, 112, 94, 63],
  "mossWeight": [1509, 1168, 87, 107, 44],
  "mothBank": [893, 1515, 143, 84],
  "mothBud": [339, 1308, 69, 100],
  "mothEdge": [1602, 1168, 54, 107],
  "mothPeel": [125, 1308, 89, 101],
  "noneBrace": [1415, 861, 186, 146, 117],
  "noneBurst0": [450, 1693, 52, 52],
  "noneBurst1": [335, 1415, 95, 92],
  "noneBurst2": [1366, 1016, 147, 135],
  "noneBurst3": [234, 686, 172, 169],
  "noneBurst4": [1160, 501, 175, 173],
  "noneBurst5": [1270, 686, 144, 152],
  "noneBurst6": [864, 1168, 143, 118],
  "noneBurst7": [3, 1607, 102, 80],
  "noneCloud": [1353, 1515, 105, 81],
  "noneCrestFold": [740, 1415, 246, 91],
  "noneCrestGlow": [811, 1308, 96, 96],
  "noneCrestOpen": [810, 1016, 368, 138],
  "noneFollow": [309, 861, 283, 149, 142],
  "noneGlow": [913, 1308, 96, 96],
  "noneNova": [701, 3, 355, 252],
  "noneShard": [362, 1763, 40, 39],
  "noneStreak": [986, 1693, 126, 46],
  "noneSurge": [246, 501, 209, 179, 127],
  "orchardTree": [3, 3, 307, 258],
  "plumeBank": [1148, 1515, 93, 83],
  "plumeBrake": [3, 1415, 95, 94],
  "plumeGlide": [1550, 1607, 129, 66],
  "plumeLift": [510, 1308, 91, 99],
  "sporePod": [1685, 1607, 71, 66],
  "stoneBrace": [1607, 861, 182, 146, 112],
  "stoneBurst0": [508, 1693, 159, 52],
  "stoneBurst1": [436, 1415, 190, 92],
  "stoneBurst2": [1136, 1168, 256, 112],
  "stoneBurst3": [412, 686, 196, 169],
  "stoneBurst4": [1341, 501, 195, 173],
  "stoneBurst5": [549, 1016, 255, 139],
  "stoneBurst6": [633, 1515, 254, 86],
  "stoneBurst7": [3, 1763, 254, 44],
  "stoneCloud": [1464, 1515, 102, 81],
  "stoneCrestFold": [82, 1693, 311, 54],
  "stoneCrestGlow": [1015, 1308, 96, 96],
  "stoneCrestOpen": [446, 1168, 290, 119],
  "stoneFollow": [598, 861, 308, 149, 170],
  "stoneGlow": [1117, 1308, 96, 96],
  "stoneMist": [1219, 1308, 96, 96],
  "stoneNova": [1258, 3, 361, 245],
  "stoneSeal": [151, 1168, 137, 134],
  "stoneShard": [408, 1763, 43, 39],
  "stoneStreak": [1118, 1693, 124, 46],
  "stoneSurge": [461, 501, 231, 179, 144],
  "stoneWake": [1248, 1693, 144, 46],
  "stoneWisp": [371, 1607, 49, 76],
  "wardBell": [1165, 1607, 69, 68],
  "windBrace": [3, 1016, 187, 146, 114],
  "windBurst0": [673, 1693, 61, 52],
  "windBurst1": [632, 1415, 102, 92],
  "windBurst2": [1519, 1016, 147, 135],
  "windBurst3": [614, 686, 172, 169],
  "windBurst4": [1542, 501, 180, 173],
  "windBurst5": [1420, 686, 150, 152],
  "windBurst6": [1013, 1168, 117, 118],
  "windBurst7": [111, 1607, 80, 80],
  "windCloud": [1572, 1515, 109, 81],
  "windCrestFold": [426, 1607, 263, 76],
  "windCrestGlow": [1321, 1308, 96, 96],
  "windCrestOpen": [792, 686, 305, 153],
  "windFollow": [912, 861, 305, 149, 164],
  "windGlow": [1423, 1308, 96, 96],
  "windMist": [1525, 1308, 96, 96],
  "windNova": [3, 267, 388, 228],
  "windSeal": [294, 1168, 146, 134],
  "windShard": [457, 1763, 61, 39],
  "windStreak": [1398, 1693, 131, 46],
  "windSurge": [698, 501, 236, 179, 148],
  "windWake": [1535, 1693, 123, 46],
  "windWisp": [695, 1607, 60, 76]
};

},
"art-riding": function(require,module,exports){
// Generated by tools/build-riding.js. Each row holds atlas XY and pupil XY relative to the saddle.
module.exports = {"width":344,"height":280,"ratio":1.6,"pivot":[224,134],"frames":{"flight0":[0,0,13.7,-30],"flight1":[344,0,14.4,-28.6],"flight2":[688,0,10,-28.7],"flight3":[1032,0,12.4,-25.9],"flight4":[1376,0,12.3,-28.7],"flight5":[0,280,7.9,-27.1],"sweep0":[344,280,13.4,-30.3],"sweep1":[688,280,13.4,-29.7],"sweep2":[1032,280,13.4,-28.5],"sweep3":[1376,280,13.4,-26.7],"sweep4":[0,560,13.4,-28.7],"sweep5":[344,560,13.4,-28.7]}};

},
"art-rush": function(require,module,exports){
// Generated by tools/build-art.js. Optional fifth value is the horizontal foot pivot.
module.exports = {
  "fireRushCorona": [4, 4, 504, 336],
  "fireRushWake": [4, 348, 608, 203],
  "fireSurfaceLight": [4, 875, 312, 208],
  "rushEmber0": [4, 1091, 56, 56],
  "rushEmber1": [68, 1091, 56, 56],
  "rushSpark0": [132, 1091, 56, 56],
  "rushSpark1": [196, 1091, 56, 56],
  "starBloom0": [620, 276, 180, 180],
  "starBloom1": [808, 276, 180, 180],
  "starBloom2": [996, 276, 180, 180],
  "starBloom3": [1184, 276, 180, 180],
  "starBow": [620, 464, 544, 219],
  "starComet0": [620, 140, 128, 128],
  "starComet1": [756, 140, 128, 128],
  "starComet2": [892, 140, 128, 128],
  "starComet3": [1028, 140, 128, 128],
  "starPalm0": [620, 4, 128, 128],
  "starPalm1": [756, 4, 128, 128],
  "starPalm2": [892, 4, 128, 128],
  "starPalm3": [1028, 4, 128, 128],
  "starRide0": [620, 843, 180, 196],
  "starRide1": [808, 843, 180, 196],
  "starRide2": [996, 843, 180, 196],
  "starRide3": [620, 1047, 180, 196],
  "starRide4": [808, 1047, 180, 196],
  "starRide5": [996, 1047, 180, 196],
  "starWake": [620, 691, 576, 144],
  "stoneRushWake": [4, 717, 448, 150],
  "windRushWake": [4, 559, 448, 150]
};

},
"art-travel": function(require,module,exports){
// Generated by tools/build-travel.js
module.exports={count:18,scale:.71,frames:{
  noneWalk0:[2,2,62,98,35],
  noneWalk1:[68,2,61,99,34],
  noneWalk2:[133,2,62,99,35],
  noneWalk3:[199,2,61,98,35],
  noneWalk4:[264,2,62,98,36],
  noneWalk5:[330,2,61,99,34],
  noneWalk6:[395,2,61,99,35],
  noneWalk7:[460,2,61,98,34],
  noneWalk8:[525,2,62,99,35],
  noneWalk9:[591,2,66,99,36],
  noneWalk10:[661,2,63,99,36],
  noneWalk11:[728,2,62,99,36],
  noneWalk12:[794,2,61,99,35],
  noneWalk13:[859,2,62,99,35],
  noneWalk14:[925,2,63,99,36],
  noneWalk15:[2,105,62,99,35],
  noneWalk16:[68,105,63,99,36],
  noneWalk17:[135,105,62,99,35],
  fireWalk0:[201,105,67,99,40],
  fireWalk1:[272,105,66,100,39],
  fireWalk2:[342,105,66,100,39],
  fireWalk3:[412,105,66,99,39],
  fireWalk4:[482,105,67,99,40],
  fireWalk5:[553,105,64,99,35],
  fireWalk6:[621,105,63,99,35],
  fireWalk7:[688,105,64,99,35],
  fireWalk8:[756,105,64,99,37],
  fireWalk9:[824,105,68,99,38],
  fireWalk10:[896,105,65,99,38],
  fireWalk11:[2,209,66,99,40],
  fireWalk12:[72,209,66,99,40],
  fireWalk13:[142,209,67,99,40],
  fireWalk14:[213,209,66,99,38],
  fireWalk15:[283,209,65,99,37],
  fireWalk16:[352,209,66,99,38],
  fireWalk17:[422,209,66,100,39],
  windWalk0:[492,209,69,101,41],
  windWalk1:[565,209,68,102,40],
  windWalk2:[637,209,68,102,40],
  windWalk3:[709,209,68,102,40],
  windWalk4:[781,209,68,102,41],
  windWalk5:[853,209,66,103,37],
  windWalk6:[923,209,65,103,37],
  windWalk7:[2,316,66,103,37],
  windWalk8:[72,316,70,102,41],
  windWalk9:[146,316,74,102,42],
  windWalk10:[224,316,70,102,42],
  windWalk11:[298,316,68,102,41],
  windWalk12:[370,316,68,102,41],
  windWalk13:[442,316,69,102,41],
  windWalk14:[515,316,64,102,36],
  windWalk15:[583,316,63,102,35],
  windWalk16:[650,316,64,102,36],
  windWalk17:[718,316,69,102,41],
  stoneWalk0:[791,316,66,100,38],
  stoneWalk1:[861,316,65,101,37],
  stoneWalk2:[930,316,64,99,37],
  stoneWalk3:[2,423,64,100,37],
  stoneWalk4:[70,423,65,99,38],
  stoneWalk5:[139,423,60,99,33],
  stoneWalk6:[203,423,59,99,33],
  stoneWalk7:[266,423,60,99,33],
  stoneWalk8:[330,423,64,100,36],
  stoneWalk9:[398,423,68,100,37],
  stoneWalk10:[470,423,65,100,37],
  stoneWalk11:[539,423,64,101,37],
  stoneWalk12:[607,423,63,100,36],
  stoneWalk13:[674,423,63,100,36],
  stoneWalk14:[741,423,64,100,36],
  stoneWalk15:[809,423,64,100,36],
  stoneWalk16:[877,423,64,101,36],
  stoneWalk17:[945,423,66,100,38],
  windGlide0:[2,528,104,95,58],
  windGlide1:[110,528,103,96,58],
  windGlide2:[217,528,105,95,60],
  windGlide3:[326,528,104,95,60],
  windGlide4:[434,528,105,96,60],
  windGlide5:[543,528,106,95,60],
  windGlide6:[653,528,107,94,61],
  windGlide7:[764,528,108,94,62],
  windGlide8:[876,528,107,96,62],
  windGlide9:[2,628,107,96,62],
  windGlide10:[113,628,107,96,62],
  windGlide11:[224,628,106,96,62],
  windGlide12:[334,628,106,96,62],
  windGlide13:[444,628,106,96,61],
  windGlide14:[554,628,106,96,61],
  windGlide15:[664,628,104,96,59],
  windGlide16:[772,628,105,96,59],
  windGlide17:[881,628,103,95,58]
},eyes:{
  noneWalk0:[49,30],
  noneWalk1:[48,30],
  noneWalk2:[49,30],
  noneWalk3:[49,30],
  noneWalk4:[50,30],
  noneWalk5:[48,30],
  noneWalk6:[49,30],
  noneWalk7:[48,30],
  noneWalk8:[49,30],
  noneWalk9:[50,31],
  noneWalk10:[50,30],
  noneWalk11:[50,30],
  noneWalk12:[49,30],
  noneWalk13:[49,30],
  noneWalk14:[50,30],
  noneWalk15:[49,31],
  noneWalk16:[50,30],
  noneWalk17:[49,30],
  fireWalk0:[54,30],
  fireWalk1:[53,30],
  fireWalk2:[53,30],
  fireWalk3:[53,30],
  fireWalk4:[54,30],
  fireWalk5:[49,30],
  fireWalk6:[49,30],
  fireWalk7:[49,30],
  fireWalk8:[51,30],
  fireWalk9:[52,31],
  fireWalk10:[52,30],
  fireWalk11:[54,30],
  fireWalk12:[54,30],
  fireWalk13:[54,30],
  fireWalk14:[52,30],
  fireWalk15:[51,31],
  fireWalk16:[52,30],
  fireWalk17:[53,30],
  windWalk0:[55,32],
  windWalk1:[54,32],
  windWalk2:[54,32],
  windWalk3:[54,32],
  windWalk4:[55,32],
  windWalk5:[51,32],
  windWalk6:[51,32],
  windWalk7:[51,32],
  windWalk8:[55,31],
  windWalk9:[56,32],
  windWalk10:[56,31],
  windWalk11:[55,31],
  windWalk12:[55,31],
  windWalk13:[55,31],
  windWalk14:[50,31],
  windWalk15:[49,32],
  windWalk16:[50,31],
  windWalk17:[55,32],
  stoneWalk0:[52,31],
  stoneWalk1:[51,31],
  stoneWalk2:[51,30],
  stoneWalk3:[51,31],
  stoneWalk4:[52,30],
  stoneWalk5:[47,30],
  stoneWalk6:[47,30],
  stoneWalk7:[47,30],
  stoneWalk8:[50,31],
  stoneWalk9:[51,32],
  stoneWalk10:[51,31],
  stoneWalk11:[51,31],
  stoneWalk12:[50,31],
  stoneWalk13:[50,31],
  stoneWalk14:[50,31],
  stoneWalk15:[50,32],
  stoneWalk16:[50,31],
  stoneWalk17:[52,31],
  windGlide0:[69,30],
  windGlide1:[69,31],
  windGlide2:[71,30],
  windGlide3:[71,30],
  windGlide4:[71,31],
  windGlide5:[71,30],
  windGlide6:[72,29],
  windGlide7:[73,29],
  windGlide8:[73,31],
  windGlide9:[73,31],
  windGlide10:[73,31],
  windGlide11:[73,31],
  windGlide12:[73,31],
  windGlide13:[72,31],
  windGlide14:[72,31],
  windGlide15:[70,31],
  windGlide16:[70,31],
  windGlide17:[69,30]
}};

},
"art": function(require,module,exports){
// Generated by tools/build-art.js. Optional fifth value is the horizontal foot pivot.
module.exports = {
  "burr": [201, 1681, 108, 90],
  "burr0": [315, 1681, 117, 90],
  "burr1": [985, 1568, 114, 94],
  "burr2": [438, 1681, 98, 90],
  "cap": [1003, 1681, 148, 86],
  "cap0": [1327, 1568, 117, 93],
  "cap1": [1105, 1568, 116, 94],
  "cap2": [624, 1437, 117, 112],
  "crackedRock": [252, 384, 184, 201],
  "dryVines": [981, 3, 136, 224],
  "elder": [348, 3, 351, 257],
  "elder0": [705, 3, 270, 238],
  "elder1": [442, 384, 284, 196],
  "elder2": [3, 384, 243, 219],
  "ember": [382, 1437, 131, 118],
  "ember0": [580, 1568, 110, 100],
  "ember1": [1236, 1681, 143, 83],
  "ember2": [780, 1681, 108, 88],
  "ember3": [3, 1568, 110, 107],
  "exitArch": [1123, 3, 201, 224],
  "fire0": [1279, 384, 100, 169, 45],
  "fire1": [1233, 609, 119, 166, 50],
  "fire2": [546, 784, 127, 163, 74],
  "fire3": [1026, 1123, 119, 146, 69],
  "fire4": [600, 955, 192, 158, 76],
  "fireBlink": [1385, 384, 100, 169, 46],
  "fireBolt": [167, 1780, 174, 62],
  "fireCharge": [1025, 1437, 129, 108],
  "fireFall": [3, 609, 142, 169, 85],
  "fireGather": [1151, 1123, 128, 146, 54],
  "fireImpact": [1225, 1286, 171, 130],
  "fireLand": [3, 1286, 138, 145, 74],
  "firePass": [679, 784, 128, 163, 60],
  "fireRecover": [256, 1123, 187, 149, 79],
  "fireRise": [798, 955, 124, 158, 64],
  "fireStride": [137, 784, 142, 164, 83],
  "flower": [330, 1568, 128, 104],
  "gems": [118, 1681, 77, 91],
  "groveTree": [3, 3, 339, 375],
  "island": [732, 384, 473, 190],
  "moss": [1076, 1286, 143, 136],
  "moss0": [119, 1568, 105, 105],
  "moss1": [464, 1568, 110, 101],
  "moss2": [230, 1568, 94, 105],
  "moss3": [894, 1681, 103, 88],
  "moth": [542, 1681, 139, 90],
  "moth0": [696, 1568, 158, 100],
  "moth1": [519, 1437, 99, 116],
  "moth2": [1227, 1568, 94, 94],
  "none0": [515, 609, 101, 168, 49],
  "none1": [285, 784, 109, 164, 41],
  "none2": [1228, 784, 117, 162, 57],
  "none3": [147, 1286, 113, 145, 64],
  "none4": [928, 955, 183, 158, 66],
  "noneBlink": [622, 609, 99, 168, 49],
  "noneBolt": [518, 1780, 168, 56],
  "noneCharge": [860, 1568, 119, 100],
  "noneFall": [727, 609, 133, 168, 76],
  "noneGather": [266, 1286, 125, 145, 59],
  "noneImpact": [229, 1437, 147, 120],
  "noneLand": [794, 1286, 133, 144, 73],
  "nonePass": [1351, 784, 122, 162, 57],
  "noneRecover": [642, 1123, 182, 148, 73],
  "noneRise": [3, 1123, 118, 157, 62],
  "noneStride": [813, 784, 133, 163, 67],
  "plume": [747, 1437, 135, 111],
  "plume0": [687, 1681, 87, 90],
  "plume1": [1385, 1681, 111, 80],
  "plume2": [3, 1681, 109, 93],
  "plume3": [1157, 1681, 73, 86],
  "stone0": [151, 609, 101, 169, 43],
  "stone1": [1358, 609, 123, 166, 55],
  "stone2": [3, 955, 127, 162, 73],
  "stone3": [1285, 1123, 119, 146, 68],
  "stone4": [403, 955, 191, 159, 67],
  "stoneBlink": [258, 609, 101, 169, 45],
  "stoneBolt": [347, 1780, 165, 62],
  "stoneCharge": [888, 1437, 131, 110],
  "stoneFall": [365, 609, 144, 169, 89],
  "stoneGather": [1410, 1123, 123, 146, 48],
  "stoneImpact": [1160, 1437, 211, 108],
  "stoneLand": [397, 1286, 132, 145, 66],
  "stonePass": [952, 784, 121, 163, 55],
  "stoneRecover": [449, 1123, 187, 149, 73],
  "stoneRise": [1117, 955, 125, 158, 63],
  "stoneStride": [400, 784, 140, 164, 79],
  "wind0": [866, 609, 104, 168, 46],
  "wind1": [3, 784, 128, 165, 60],
  "wind2": [136, 955, 130, 162, 78],
  "wind3": [535, 1286, 123, 145, 72],
  "wind4": [1248, 955, 193, 158, 76],
  "windBlink": [976, 609, 100, 168, 43],
  "windBolt": [3, 1780, 158, 65],
  "windCharge": [1377, 1437, 155, 108],
  "windFall": [1082, 609, 145, 168, 88],
  "windGather": [664, 1286, 124, 145, 47],
  "windImpact": [3, 1437, 220, 125],
  "windLand": [933, 1286, 137, 144, 70],
  "windPass": [272, 955, 125, 162, 61],
  "windPost": [1211, 384, 62, 171],
  "windRecover": [830, 1123, 190, 148, 80],
  "windRise": [127, 1123, 123, 157, 60],
  "windRotor": [1402, 1286, 128, 129],
  "windStride": [1079, 784, 143, 163, 84],
  ...require('./art-detail'),
  ...require('./art-powers'),
  ...require('./art-travel').frames,
  ...require('./art-rush')
};

},
"attunement": function(require,module,exports){
'use strict';
const {species}=require('./levels');
const {point,smooth}=require('./resonance');
const phoenix=require('./phoenix-rush');
const starMagic=require('./star-magic');
const rushPath=require('./rush-path');
const {heavyTime,superTime,fireFlameFrame}=require('./motion');
const {wash,streak,twinkle}=require('./light');
const {glint}=require('./power-fx');
const frames=require('./art');
const tau=2*Math.PI;
const styles={
 none:{body:'#eba447',rim:'#ffe39b',pearl:'#fff9df',speed:2},
 fire:{body:'#ff7139',rim:'#ffb541',pearl:'#fff1b7',speed:2.55},
 wind:{body:'#3bbebc',rim:'#91f3db',pearl:'#eefff1',speed:-1.85},
 stone:{body:'#80b55e',rim:'#e6d992',pearl:'#ffefc5',speed:1.36}
};
const crestWidth={wind:146,stone:130};
function ink(c,stamp,img,id,x,y,h,face,angle,opacity,ax=.5,ay=.5){
 if(opacity<.008)return;
 c.save();c.globalAlpha*=opacity;stamp(c,img,id,x,y,h,face,angle,ax,ay);c.restore();
}
function orbit(c,stamp,img,p,form,t,front,weight){
 if(form==='none'||weight<.018)return;
 const s=styles[form],height=p.rig?.height||70;
 const x=p.x,y=p.y+(p.ridePose?.lift??-height*.40),tilt=form==='wind'?-.28:form==='fire'?-.18:.11;
 if(!front)wash(c,x,y+5,26,26,0,s.body,weight*.20);
 for(let i=0;i<2;i++){
  const a=t*s.speed+i*Math.PI,depth=Math.sin(a);
  if((depth>0)!==front)continue;
  const u=Math.cos(a)*(form==='wind'?37:32),v=depth*9;
  const xx=x+u*Math.cos(tilt)-v*Math.sin(tilt),yy=y+u*Math.sin(tilt)+v*Math.cos(tilt);
  if(front&&Math.abs(xx-x)<16)continue;
  const k=weight*(front?.70:.57),angle=tilt+.48*Math.sin(a);
  wash(c,xx,yy,17,8,angle,s.body,k*.64);
  ink(c,stamp,img,form+'Mist',xx,yy,form==='wind'?20:17,1,angle,k);
  twinkle(c,xx+2,yy-1,4.5,angle,s.pearl,k*.9);
 }
}
function surroundings(c,stamp,img,g,front){
 const p=g.player,f=g.attunement,blend=f?smooth((g.time-f.born)/.36):1;
 if(f&&f.from!==p.form)orbit(c,stamp,img,p,f.from,g.time,front,1-blend);
 orbit(c,stamp,img,p,p.form,g.time,front,blend);
}
function filament(start,end,u,t,phase,k){
 const dx=end.x-start.x,dy=end.y-start.y,l=Math.max(1,Math.hypot(dx,dy));
 const bow=Math.sin(Math.PI*u)*(Math.min(17,l*.14)*Math.sin(u*5-t*6+phase)-7*k);
 return {x:start.x+dx*u-dy/l*bow,y:start.y+dy*u+dx/l*bow};
}
function tether(c,stamp,img,g,tip){
 const p=g.player,m=g.captured,t=g.time,face=p.bellFace||p.face;
 const form=m?species[m.kind].skill:p.form,s=styles[form],k=m?m.pull:0;
 const start=m?point(m):{x:tip.x+face*97,y:tip.y-5};
 if(p.form==='none'){
  for(let i=0;i<5;i++){
   const u=(t*(m?1.48:1.15)+i/5)%1,b=filament(start,tip,u,t,i*2.4,k);
   const alpha=Math.sin(Math.PI*u)*.88;
   if(m){
    const a=filament(start,tip,Math.max(0,u-.06),t,i*2.4,k),dir=b.x<a.x?-1:1;
    const angle=Math.atan2(b.y-a.y,Math.max(.01,Math.abs(b.x-a.x)));
    ink(c,stamp,img,'starComet'+(Math.floor(t*10)+i)%4,b.x,b.y,15+10*u,dir,angle,alpha,.69,.49);
   }else starMagic.spark(c,img,b.x,b.y,9+8*u,t+i,-.24,alpha);
  }
  if(m)ink(c,stamp,img,form+'Wisp',start.x,start.y,17*(1-k),face,-.18,.72*(1-k));
  starMagic.spark(c,img,tip.x,tip.y,23+12*k,t,-.16,.97);return;
 }
 const brightness=m?1:.56;
 if(m){
  let from=start;
  for(let i=1;i<=5;i++){
   const u=i/5,to=filament(start,tip,u,t,.65,k);
   streak(c,from,to,8+5*Math.sin(Math.PI*u),s.body,.46+.13*k);
   from=to;
  }
 }
 for(let i=0;i<5;i++){
  const u=(t*(m?1.25:.83)+i/5)%1,phase=i*2.40;
  const a=filament(start,tip,Math.max(0,u-.16),t,phase,k),b=filament(start,tip,u,t,phase,k);
  const alpha=Math.sin(Math.PI*u)*brightness;
  streak(c,a,b,6+5*(1-u),s.body,.73*alpha);
  streak(c,a,b,3+3*(1-u),s.pearl,.88*alpha);
  if(m)ink(c,stamp,img,form+'Mist',b.x,b.y,(13+10*(1-u))*alpha,face,Math.atan2((b.y-a.y)*face,(b.x-a.x)*face),.69*alpha);
  twinkle(c,b.x,b.y,3+3*alpha,phase*.2,s.pearl,.78*alpha);
 }
 if(m){
  // The bloom hugs the target's perimeter; the creature stays above it during the pull.
  const r=14+12*(1-k);
  wash(c,start.x-face*r*.54,start.y-3,r*.67,r*.91,-face*.38,s.body,.54);
  twinkle(c,start.x+face*r*.64,start.y-5,7,-.3,s.pearl,.73);
 }
 wash(c,tip.x,tip.y,18+7*k,18+7*k,0,s.body,.58);
 twinkle(c,tip.x,tip.y,6+4*k,-.16,s.pearl,.97);
}
function flourish(c,stamp,img,g){
 const f=g.attunement;if(!f)return;
 const age=g.time-f.born;if(age<0||age>=.88)return;
 const s=styles[f.form],p=g.player,x=p.x,y=p.y-32,r=18+59*smooth(age/.58),fade=1-smooth((age-.18)/.70);
 if(f.form==='none'){
  for(let i=0;i<5;i++){
   const angle=age*2+i*tau/5;
   starMagic.spark(c,img,x+Math.cos(angle)*r,y+Math.sin(angle)*r*.73,13+9*fade,g.time+i,angle*.16,fade);
  }
  return;
 }
 wash(c,x,y-4,r*1.19,r*.94,-.21,s.body,.49*fade);
 wash(c,x,y,r*.9,r*.94,0,s.rim,.37*fade);
 for(let i=0;i<4;i++){
  const a=i*tau/4+age*s.speed,xx=x+Math.cos(a)*r*.86,yy=y+Math.sin(a)*r*.75;
  ink(c,stamp,img,f.form==='none'?'noneGlow':f.form+'Mist',xx,yy,(11+7*fade)*fade,1,a,.68*fade);
  twinkle(c,xx,yy,6+4*fade,a,s.pearl,fade);
 }
 if(age<.31){
  const u=smooth(age/.31);
  twinkle(c,f.x+(x-f.x)*u,f.y+(y-f.y)*u,11*(1-u),u,s.pearl,.91);
 }
}
// Keep the base attached to the crystal while the painted tongues rise and bend independently.
function palmFire(c,stamp,img,p,tip,t,front){
 const x=tip.x,y=tip.y,face=p.chargeFace||p.face;
 const gather=smooth(p.charge/heavyTime),heavy=smooth((p.charge-heavyTime)/(superTime-heavyTime));
 const full=p.charge>=superTime,open=smooth((p.charge-superTime)/.14);
 const pulse=.5+.5*Math.sin(t*(full?12:9));
 const height=16+34*gather+33*heavy+33*open+(3+7*heavy)*pulse;
 if(front){
  wash(c,x,y,7+13*gather+8*open,6+10*gather,0,'#ff9f38',.70);
  twinkle(c,x,y-2,4+4*gather+3*open,-.22,'#fff4b0',.93);
  return;
 }
 const hotY=y-height*.33,radius=17+38*gather+27*heavy+39*open;
 wash(c,x+face*3,hotY,radius*1.1,radius*1.03,0,'#fa6c24',.34+.15*heavy);
 c.save();c.globalCompositeOperation='screen';
 wash(c,x,hotY,radius*.94,radius,-face*.15,'#ffb346',.54+.14*open);
 if(p.ground)wash(c,p.x+face*10,p.y,19+62*gather+27*open,4+7*heavy,0,'#ffc66a',(.31+.17*heavy)*gather);
 c.restore();
 const angle=.11+.046*Math.sin(t*6.7);
 ink(c,stamp,img,'fireMist',x,y-height*.41,height*1.28,face,angle,.64);
 ink(c,stamp,img,fireFlameFrame(t),x,y+1,height*1.18,face,angle,.94,.5,.936);
 c.save();c.globalCompositeOperation='lighter';
 wash(c,x,y-height*.21,height*.25,height*.31,face*.12,'#ff9a39',.53);
 wash(c,x,y-4,6+13*gather+6*open,7+9*gather,0,'#fff4a5',.65);
 c.restore();
 const count=full?8:gather>.93?5:3;
 for(let i=0;i<count;i++){
  const u=(t*(.89+i*.064)+i*.381)%1,spread=height*(.12+.32*u);
  const xx=x+face*(Math.sin(i*2.37+u*5)*spread+4*u),yy=y-height*(.20+.97*u);
  const fade=Math.sin(Math.PI*u)*(.32+.52*gather),size=(2.2+2.2*open)*(1-.40*u);
  wash(c,xx,yy,size*1.15,size*1.85,Math.sin(i+u)*.40,'#ffba52',fade);
  wash(c,xx,yy,size*.45,size*.75,0,'#fff5b5',fade);
 }
}
// The open drawing and its baked glow share the same centre.
function chargedCrest(c,stamp,img,p,tip,t){
 const form=p.form,s=styles[form],face=p.chargeFace||p.face,age=p.charge-superTime;
 const open=smooth(age/.15),surge=Math.sin(Math.PI*Math.min(1,age/.25)),beat=Math.sin(t*6.1);
 const span=crestWidth[form]*(.58+.42*open+.18*surge+.027*beat);
 const cx=tip.x+face*(12+26*open),cy=tip.y-7-21*open-7*surge+beat*1.9;
 const tilt=form==='stone'?-.12:form==='wind'?-.25+.07*beat:-.22+.035*beat;
 const shape=form+'CrestOpen';
 wash(c,cx,cy,span*.56,28+6*surge,-face*.16,s.body,.53);
 // All four crests are wider than tall. Their compact light maps carry a 10 px soft border.
 ink(c,stamp,img,form+'CrestGlow',cx,cy,span*96/76,face,tilt,.92*open);
 const fold=1-open+(form==='wind'?open*.21*(.5+.5*Math.cos(t*8.6))**3:0);
 if(fold>.015){
  const id=form+'CrestFold';
  ink(c,stamp,img,id,cx,cy,span*frames[id][3]/frames[id][2],face,tilt,.87*fold);
 }
 ink(c,stamp,img,shape,cx,cy,span*frames[shape][3]/frames[shape][2],face,tilt,.86*(1-fold));
 c.save();c.globalCompositeOperation='lighter';
 ink(c,stamp,img,form+'CrestGlow',cx,cy,span*96/76,face,tilt,(.54+.19*surge)*open);
 wash(c,cx+face*9,cy,span*.32,11+surge*7,-face*.32,s.rim,.35+.15*surge);c.restore();
 for(let i=0;i<4;i++){
  const a=t*.95+i*tau/4,dist=span*(.40+.07*Math.sin(a*2));
  const xx=cx+face*Math.cos(a)*dist,yy=cy+Math.sin(a)*22;
  const pulse=.5+.5*Math.cos(t*5.2+i*2.4);
  twinkle(c,xx,yy,5+8*pulse+4*surge,-.26,s.pearl,.74);
  if(pulse>.62)glint(c,xx,yy,2+3*pulse,-.26,s.pearl);
 }
}
function palm(c,stamp,img,p,tip,t,front){
 if(p.form==='none'){starMagic.palm(c,img,p,tip,t,front);return;}
 if(p.form==='fire'){palmFire(c,stamp,img,p,tip,t,front);return;}
 const form=p.form,s=styles[form],face=p.chargeFace||p.face;
 const charge=p.charge,heavy=charge>=heavyTime,full=charge>=superTime;
 const gather=smooth(charge/heavyTime),focus=smooth((charge-heavyTime)/(superTime-heavyTime));
 const x=tip.x,y=tip.y,beat=.5+.5*Math.sin(t*7),r=6+12*gather+10*focus;
 if(front){
  wash(c,x,y,6+2*gather+4*focus,6+2*gather+4*focus,0,s.rim,.76);
  twinkle(c,x,y,4+3*gather+(full?8:3)*focus,-.24,s.pearl,.98);
  if(heavy)glint(c,x,y,full?5.5:3.2,-.24,'#fffbd5');
  return;
 }
 const angle=form==='stone'?.10*Math.sin(t*3):t*s.speed*.46;
 const height=10+25*gather+21*focus+2*beat;
 wash(c,x,y,r*(1.68+.12*beat),r*1.52,angle,s.body,.49+.23*gather);
 ink(c,stamp,img,form+'Glow',x,y,height*1.48,face,angle,.86);
 ink(c,stamp,img,form+'Charge',x,y,height,face,angle,.70+.15*gather);
 c.save();c.globalCompositeOperation='lighter';
 ink(c,stamp,img,form+'Glow',x,y,height*1.39,face,angle,.37+.31*gather);
 wash(c,x,y,r*1.12,r*1.17,-.21*face,s.rim,.30+.23*gather);c.restore();
 if(full)chargedCrest(c,stamp,img,p,tip,t);
 else{
  // Before the first threshold grains flow inward. The heavy charge lifts two elemental pieces outward.
  const count=heavy?2:3;
  for(let i=0;i<count;i++){
   const phase=(t*(heavy?1.22:1.65)+i/count)%1,a=t*s.speed*1.55+i*tau/count;
   const dist=heavy?r*(.94+.24*beat):r*(.30+1.65*(1-phase));
   const xx=x+Math.cos(a)*dist,yy=y+Math.sin(a)*dist*(heavy?.74:.85);
   if(heavy){
    const id=form==='none'?'noneShard':form+'Wisp';
    wash(c,xx,yy,13,10,a,s.rim,.66);
    ink(c,stamp,img,id,xx,yy,14+7*focus,face,.22*Math.sin(a),.87);
   }else{
    streak(c,{x:xx+Math.cos(a)*9,y:yy+Math.sin(a)*8},{x:xx,y:yy},3.4,s.rim,.82*gather);
    twinkle(c,xx,yy,2+4*gather,a*.2,s.pearl,.7);
   }
  }
 }
}
function rushWake(c,g,img,surface){
 const p=g.player;
 let run=[],face,form,dashBorn;
 function draw(){
  if(run.length>1)phoenix.wake(c,run,g.time,img,form,face,surface);
 }
 function add(point,dir,kind,start,heat){
  if(dir!==face||kind!==form||start!==dashBorn){draw();run=[];}
  face=dir;form=kind;dashBorn=start;
  const q={x:point.x,y:point.y,heat},last=run[run.length-1];
  if(last&&Math.hypot(q.x-last.x,q.y-last.y)<1){run[run.length-1]=q;return;}
  run.push(q);
 }
 for(const e of g.echoes){
  if(e.boost)add(e.wake,e.travelFace,e.form,e.dashBorn,1-(g.time-e.born)/e.life);
 }
 if(p.dash>0)add(rushPath.anchor(g),p.dashFace,p.form,p.dashBorn,1);
 draw();
}
function motionTrails(c,stamp,img,g){
 const p=g.player,t=g.time,s=styles[p.form],rush=p.dash>0,face=rush?p.dashFace:p.face;
 if(rush&&(p.form==='wind'||p.form==='stone')){
  const gain=Math.min(1,p.dash/.15),beat=Math.sin(t*11.5),y=p.y-26;
  c.save();c.globalAlpha*=gain;
  wash(c,p.x-face*17,y,75,24,-face*.055,s.body,.48);
  const wake=p.form+'Wake';
  ink(c,stamp,img,wake,p.x-face*19,y+3,26+3*beat,face,-.045,.68,.90,.54);
  ink(c,stamp,img,wake,p.x-face*31,y+6,18,face,.07,.45,.90,.56);
  const crest=p.form==='stone'?'stoneBolt':p.form+'CrestOpen';
  ink(c,stamp,img,crest,p.x+face*15,y+5,p.form==='wind'?53:32,face,-.05+.045*beat,.66,.65,.52);
  c.restore();
 }else if(p.gliding){
  for(const side of [-1,1])wash(c,p.x-face*(22+4*side),p.y-31+side*7,25,4.5,-face*.28,'#95eddf',.46);
 }
 if(p.slam)for(const side of [-1,1])wash(c,p.x+side*13,p.y-33,8,35,-side*.19,s.rim,.50);
 if(g.combo>=3)for(let i=0;i<3;i++){
  const a=t*3+i*tau/3;twinkle(c,p.x+Math.cos(a)*36,p.y-30+Math.sin(a)*21,6,a,styles.none.pearl,.70);
 }
}
function ward(c,stamp,img,p,t){
 const x=p.x,y=p.y-32,s=styles.wind;
 wash(c,x,y,33,42,-.11,s.body,.54,'shell');
 wash(c,x-13,y-26,18,6,-.63,s.pearl,.56);
 const a=t*2.4,xx=x+30*Math.cos(a),yy=y+10*Math.sin(a);
 wash(c,xx,yy,11,12,0,s.rim,.56);ink(c,stamp,img,'wardBell',xx,yy,13,1,.12*Math.sin(a),.82);
}
module.exports={surroundings,tether,flourish,palm,rushWake,rushPressure:phoenix.pressure,motionTrails,ward};

},
"audio": function(require,module,exports){
'use strict';
const sampleRate=16000, tau=2*Math.PI;
const melodies={
  meadow:[72,76,79,83,81,79,76,0,74,77,81,84,83,79,77,0,71,74,77,81,79,77,74,0,72,76,79,86,83,79,76,0],
  grove:[52,0,59,62,55,0,62,67,57,0,64,67,59,62,66,0,52,59,64,0,55,62,67,0,57,60,64,69,59,66,71,0]
};
const cues={jump:[72,79],spring:[64,72,84],bell:[84,91],attack:[67,60],slam:[43,36],transform:[72,76,79,84],gate:[67,72,76,84],star:[88,95],chest:[72,76,79,86],camp:[76,81,88],hurt:[58,49],heartHit:[79,72],clear:[72,76,79,84,88]};
// The small pickup trill ends before the four-note change of form.
cues.bellLock=[67,79];cues.chargeReady=[76,88];cues.superReady=[76,80,83,88,95];cues.dash=[79,67];
cues.dashReady=[72,79,84];
cues.starCast=[83,90];cues.starVolley=[76,83,88,95];cues.starRide=[72,79,88,91];
cues.dashHit=[64,76,88];cues.clash=[91,98,103];cues.enemyPop=[60,72,84];cues.bowling=[74,81,88,95];cues.combo=[79,86,91];
cues.berry=[76,84];cues.ward=[72,79,88];cues.wardBreak=[88,76,67];cues.chime=[67,79,86,91];
const castingNotes={fireCast:[69,57],windCast:[79,86,91],stoneCast:[45,38]};
const impactPunch=new Set(['slam','dashHit','enemyPop','bowling','clash','gate','heartHit','transform']);
function samples(name){
 const music=!!melodies[name],notes=melodies[name]||castingNotes[name]||cues[name]||cues.bell;
 const beat=music?(name==='grove'?.285:.32):name==='clear'?.12:(name==='superReady'||name==='clash'||name==='bowling')?.052:.075;
 const length=Math.ceil((notes.length*beat+(music?0:.35))*sampleRate),out=new Float32Array(length);
 function note(midi,start,dur,gain,kind){
  if(!midi)return;const f=440*Math.pow(2,(midi-69)/12),begin=Math.floor(start*sampleRate),count=Math.floor(dur*sampleRate);
  for(let i=0;i<count&&begin+i<length;i++){const t=i/sampleRate,env=Math.min(t/.012,1)*Math.exp(-3.8*t/dur)*Math.min(1,(count-i)/(sampleRate*.022));
   const v=Math.sin(tau*f*t)+.24*Math.sin(tau*f*(kind==='bell'?2.007:2)*t)*Math.exp(-8*t)+.10*Math.sin(tau*f*3*t)*Math.exp(-14*t);
   out[begin+i]+=v*gain*env;}
 }
 notes.forEach((n,i)=>{note(n,i*beat,music?beat*1.85:.3,music?.18:.31,'bell');
   if(music&&i%4===0){const root=(name==='grove'?[40,43,45,47]:[48,50,47,48])[Math.floor(i/8)%4];note(root,i*beat,beat*3.8,.12,'soft');note(root+7,i*beat+beat,beat*2.5,.07,'soft');}});
 if(castingNotes[name]||impactPunch.has(name)){
  let seed=701,air=0,phase=0;
  for(let i=0;i<out.length;i++){
   const t=i/sampleRate;
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const noise=seed/2147483648-1;air+=(noise-air)*.16;
   if(castingNotes[name]){
    const env=Math.min(1,t/.012)*Math.exp(-t*(name==='stoneCast'?16:10));
    if(name==='stoneCast'){phase+=tau*(42+70*Math.exp(-20*t))/sampleRate;out[i]+=(.38*Math.sin(phase)+.24*air)*env;}
    else if(name==='windCast')out[i]+=.34*(noise-air)*Math.sin(t*12)*env;
    else out[i]+=(.36*air+.18*Math.sin(tau*105*t+2.2*Math.sin(t*60)))*env;
   }else{
    const decay=name==='slam'||name==='gate'?14:22,env=Math.min(1,t/.006)*Math.exp(-t*decay);
    const baseFreq=name==='clash'?260:name==='slam'||name==='gate'?52:95;
    phase+=tau*(baseFreq+140*Math.exp(-28*t))/sampleRate;
    out[i]+=(.30*Math.sin(phase)+.14*air)*env;
   }
  }
 }
 return out;
}
function wav(data){
 const buffer=new ArrayBuffer(44+data.length),d=new DataView(buffer),bytes=new Uint8Array(buffer);
 function word(at,s){for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);}
 word(0,'RIFF');d.setUint32(4,36+data.length,true);word(8,'WAVE');word(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sampleRate,true);d.setUint32(28,sampleRate,true);d.setUint16(32,1,true);d.setUint16(34,8,true);word(36,'data');d.setUint32(40,data.length,true);
 for(let i=0;i<data.length;i++)bytes[44+i]=Math.max(0,Math.min(255,Math.round(128+data[i]*118)));return buffer;
}
function soundEngine(backend){
 let unlocked=false,current='',loop=null;let voices=[];
 function stop(){if(loop){try{loop.stop();}catch(_){}loop=null;}current='';voices.forEach(v=>{try{v.stop();}catch(_){}});voices=[];}
 function tick(g){
  const cues=g.events.splice(0);
  if(!unlocked||g.data.muted||g.scene==='pause'||g.scene==='retry'){stop();return;}
  const wanted=g.scene==='play'?(g.boss?'grove':'meadow'):'';
  if(wanted!==current){if(loop)loop.stop();loop=null;current=wanted;if(wanted)loop=backend.play(wanted,true,.55);}
  for(const cue of cues){if(cue==='start')continue;const sound=cue==='dash'&&g.player.form==='none'?'starRide':cue;const v=backend.play(sound,false,.64);if(v){voices.push(v);if(voices.length>8)voices.shift().stop();}}
 }
 return {unlock(){try{backend.unlock();unlocked=true;}catch(_){}},tick,stop};
}
module.exports={samples,wav,sampleRate,soundEngine};

},
"chapter-paths": function(require,module,exports){
'use strict';

// Each section has two or three rooms. Floor entries are [left edge, height, right edge]
// in a 2,000-unit room. All three routes join the next room on the same safe shelf.
const rooms={
  banks:[[0,402,550],[620,380,1000],[1070,350,1410],[1480,402,2000]],
  ravine:[[0,402,460],[550,425,870],[964,396,1210],[1294,366,1580],[1650,402,2000]],
  ridge:[[0,402,470],[534,365,870],[934,330,1330],[1404,363,1620],[1688,402,2000]],
  orchard:[[0,402,785],[843,415,1310],[1375,402,2000]],
  loft:[[0,402,425],[515,370,810],[905,343,1230],[1320,380,1600],[1680,402,2000]],
  gallery:[[0,402,480],[480,455,1420],[1490,425,1700],[1760,402,2000]],
  stairs:[[0,402,535],[605,371,865],[930,339,1125],[1200,310,1410],[1480,354,1660],[1730,402,2000]],
  causeway:[[0,402,680],[755,402,1140],[1220,382,1460],[1525,402,2000]]
};
const highRoads={
  orchard:[[365,72,560],[625,137,890],[965,180,1290],[1370,130,1580]],
  banks:[[385,69,610],[720,103,975],[1100,86,1290]],
  ravine:[[300,75,500],[645,140,900],[1040,175,1220],[1350,112,1580]],
  ridge:[[590,110,785],[960,163,1185],[1390,112,1570]],
  loft:[[330,70,530],[660,126,905],[1050,158,1250],[1410,106,1615]],
  gallery:[[375,65,635],[700,82,1010],[1060,86,1300],[1380,69,1580]],
  stairs:[[420,72,610],[730,134,950],[1060,175,1235],[1350,146,1480]],
  causeway:[[495,72,740],[880,105,1090]]
};
// A vista introduces a terrain idea, then combines it with a different encounter on the way out.
const routes={
  meadow:[
    ['萤溪汀步','跟着溪石过河。高处的草台绕过守在浅滩的刺球。','banks ravine',1],
    ['蜜果回廊','沿果树踏上树冠，铃匣藏在最高的一枝。','orchard ridge banks',0],
    ['三叠水车','水车间有三层落差，沿落水的方向连续起跳。','stairs ravine',1],
    ['萤火花圃','绯焰能烧开花圃尽头的枯藤。','orchard gallery',0],
    ['挂铃长堤','长堤适合冲刺。留一点星能给下一个断口。','causeway ridge orchard',1],
    ['晨露山口','越过最后一道山脊，云羽渡的星门就在溪岸。','stairs banks',0]
  ],
  skyway:[
    ['听风栈道','顺着风丝起跳，风道会托住流羽。','causeway loft',0],
    ['折羽云梯','云梯有两层落脚点。高处的风桥可以绕过下方的守卫。','stairs ridge ravine',1],
    ['风琴塔群','沿塔侧的小平台登上塔顶，去找风里的铃匣。','loft banks',0],
    ['白帆回港','第二座风标守着船坞，云羽在风标前歇脚。','gallery causeway loft',1],
    ['逆风双峡','借风越过双峡，出了风道再收起羽翼。','ravine stairs',0],
    ['曙光泊岸','把剩下的星能留给最后的浮桥。','ridge causeway banks',1]
  ],
  mine:[
    ['余音栈桥','脚下的晶层逐级升高。听到回音，再跃向下一段栈桥。','banks stairs',1],
    ['双层矿井','跟着暖光走上矿架，也可以落入低处的旧轨。','gallery ravine ridge',0],
    ['矿灯支线','沿分岔的矿架向上，封存的铃匣就在轨道尽头。','orchard stairs',1],
    ['石脉工坊','苔咚守着第二面裂壁，在同一片岩层上蓄力震地。','gallery causeway ridge',0],
    ['碎晶天井','踏过断开的晶脉，在下一座矿灯下喘口气。','loft gallery',1],
    ['归铃轨道','沿最后一列石阶返回地面，树灵在古庭等你。','stairs ravine causeway',0]
  ]
};

function extendChapter(level){
  const sections=routes[level.id];
  if(!sections)return;
  const meadow=level.id==='meadow',sky=level.id==='skyway';
  level.areas??=[[0,level.name,level.guide]];
  level.checkpointHints??=[level.guide];
  for(const key of ['extraCheckpoints','extraChests','energyStars','landmarks','falls','supplies','trees'])level[key]??=[];
  level.streams=level.stream?[level.stream]:[];
  level.passages=[];
  if(meadow)level.bellCrossing=level.exit;
  let start=level.width;
  sections.forEach(([name,hint,sequence,accent],section)=>{
    level.areas.push([start,name,hint]);
    for(const [index,shape] of sequence.split(' ').entries()){
      const layout=rooms[shape],length=shape==='gallery'?2140:shape==='loft'?1840:2000;
      const at=n=>start+Math.round(n*length/2000);
      const floor=n=>layout.find(([a,,b])=>n>=a&&n<=b)[1];
      for(const [a,y,b] of layout)level.platforms.push([at(a),y,at(b)-at(a),548-y]);
      const firstTop=floor(230),secretRoom=section===2&&index===accent;
      const road=secretRoom?highRoads.orchard:highRoads[shape];
      for(const [i,[a,rise,b]] of road.entries())level.platforms.push([at(a),firstTop-rise,at(b)-at(a),37+i*2]);
      const [crownStart,crownRise,crownEnd]=road.reduce((highest,next)=>next[1]>highest[1]?next:highest);
      const crown=Math.round((crownStart+crownEnd)/2),crownY=firstTop-crownRise;
      if(index===0){
        level.extraCheckpoints.push([at(125),firstTop]);level.checkpointHints.push(hint);
        level.stars.push([at(240),firstTop-32]);
      }
      if(secretRoom){
        const chest=[at(1140),crownY];
        level.extraChests.push(chest);level.stars.push([chest[0]-38,chest[1]-30]);
      }
      if(section===3&&index===1){
        const x=at(310);
        level.passages.push({id:'return-'+level.gate.type,type:level.gate.type,x,y:firstTop,label:{fire:'萤火藤门',wind:'白帆风标',stone:'工坊裂壁'}[level.gate.type]});
        level.creatures.push([{fire:'ember',wind:'plume',stone:'moss'}[level.gate.type],at(155),firstTop-(sky?48:0)]);
      }
      const low=layout[1],mid=Math.round((low[0]+low[2])/2),last=layout[layout.length-1],home=Math.round((last[0]+last[2])/2);
      level.creatures.push(index===accent?['cap',at(mid),low[1]-82,'spores']:['burr',at(mid),low[1]],
        (section+index)%2?['ember',at(home),last[1],'cinder']:['burr',at(home),last[1],'bound']);
      if(index===accent){
        level.creatures.push([sky?'plume':meadow?'ember':'moss',at(crown-55),crownY-(sky?38:0)]);
        level.supplies.push([section%2?'ward':'berry',at(crownEnd-22),crownY-27]);
      }
      level.supplies.push(['berry',at(295),firstTop-27]);
      for(const n of [75,mid,home])level.energyStars.push([at(n),floor(n)-34]);
      if(sky&&(shape==='loft'||shape==='ravine'))level.streams.push([at(low[2]-52),at(layout[2][0]+68)]);
      if(shape==='stairs'||shape==='orchard')level.springs.push([at(420),firstTop]);
      if(meadow||sky)level.falls.push([at(mid),low[1],shape==='ravine'?19:10,148]);
      if(shape==='gallery'){
        level.energyStars.push([at(840),low[1]-34],[at(1150),low[1]-34]);
        level.supplies.push(['ward',at(1080),low[1]-27]);
      }
      const landmark=meadow?(shape==='orchard'||shape==='ridge'?'orchardTree':'millWheel'):sky?'skySail':'mineWinch';
      level.landmarks.push([landmark,at(mid+40),low[1],meadow?145:sky?122:89,(section+index)%2?1:-1]);
      if(meadow||sky)level.trees.push([at(210),firstTop,120+accent*35,index%2?1:-1]);
      start+=length;
    }
  });
  level.width=start;level.exit=start-135;
}
module.exports={extendChapter};

},
"character-light": function(require,module,exports){
'use strict';
const {fireSurfaceLight,starBow}=require('./art-rush');
const {species}=require('./levels');

// Reuse the incident gold light painted for the phoenix. The actor surface supplies
// the exact moving silhouette, including crossfading clothes and separately animated boots.
function source(g,tip,bell){
 const p=g.player;
 if(p.dash>0&&p.form==='none')return {star:true,x:p.x+37*p.dashFace,y:p.y-43,face:p.dashFace,width:119,
  strength:.42+.10*Math.sin((g.time-p.dashBorn)*6.4)};
 if(p.dash>0)return {x:p.x+45*p.dashFace,y:p.y-35,face:p.dashFace,width:110,
  strength:.48+.12*Math.sin((g.time-p.dashBorn)*6.8)};
 if(p.charging&&(p.form==='fire'||p.form==='none')&&tip){
  const k=Math.min(1,p.charge/.84);
  return {star:p.form==='none',x:tip.x,y:tip.y-4-7*k,face:p.chargeFace,width:63+49*k,
   strength:(.19+.34*k)*(.91+.09*Math.sin(g.time*11))};
 }
 if(p.bell&&bell&&p.form==='none')return {star:true,x:bell.x,y:bell.y-2,face:p.bellFace,width:79,strength:.25+.20*p.pull};
 if(p.bell&&bell&&(g.captured?species[g.captured.kind].skill==='fire':p.form==='fire'))
  return {x:bell.x,y:bell.y-2,face:p.bellFace,width:76,strength:.22+.17*p.pull};
 let picked=null,best=.025;
 for(const f of g.spellEffects){
  if((f.kind!=='fire'&&f.kind!=='none')||f.age>=.31||(f.type!=='release'&&f.type!=='impact'))continue;
  const distance=Math.hypot(f.x-p.x,f.y-p.y+36),reach=f.super?160:f.heavy?128:92;
  const strength=(1-distance/reach)*(1-f.age/.31)*(f.super?.94:f.heavy?.75:.48);
  if(strength<=best)continue;
  best=strength;picked={star:f.kind==='none',x:f.x,y:f.y,face:f.x>=p.x?1:-1,width:reach,strength};
 }
 return picked;
}
const side=144;
function draw(c,imgs,p,light,paint){
 const surface=imgs.lightSurface;
 if(!light||!surface){paint(c);return;}
 const dc=surface.getContext('2d'),scale=surface.width/side,l=p.x-side/2,t=p.y-116;
 dc.setTransform(1,0,0,1,0,0);dc.clearRect(0,0,surface.width,surface.height);
 dc.save();dc.setTransform(scale,0,0,scale,-l*scale,-t*scale);paint(dc);dc.restore();
 c.drawImage(surface,l,t,side,side);
 dc.save();dc.setTransform(scale,0,0,scale,-l*scale,-t*scale);
 dc.translate(light.x,light.y);dc.scale(light.face||1,1);
 const w=light.width;
 dc.globalCompositeOperation='source-in';
 if(light.star)dc.drawImage(imgs.atlas.lights,...starBow,-.738*w,-.528*w*.88,w,w*.88);
 else dc.drawImage(imgs.atlas.lights,...fireSurfaceLight,-.86*w,-.51*w,w,w*.90);
 dc.restore();
 c.save();c.globalCompositeOperation='screen';c.globalAlpha*=light.strength;
 c.drawImage(surface,l,t,side,side);c.restore();
}
module.exports={source,draw,side};

},
"creatures": function(require,module,exports){
'use strict';
const {species}=require('./levels');
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const groundKind=k=>k==='ember'||k==='moss'||k==='burr';

function createCreature(kind,x,y,index,platforms,pattern){
  const floor=platforms.find(([left,top,width])=>Math.abs(top-y)<3&&x>=left&&x<=left+width);
  const left=floor?floor[0]+14:x-140,right=floor?floor[0]+floor[2]-14:x+140;
  return {kind,pattern,x,y,homeX:x,homeY:y,left,right,seed:index*1.97+.4,clock:0,patrol:0,stride:0,
    state:'idle',timer:0,elapsed:0,face:1,hidden:0,pull:0,drawIn:0,appear:0,airPath:null};
}
function enter(m,state,seconds=0){m.state=state;m.timer=seconds;m.elapsed=0;}
function reappear(m){
  m.x=m.homeX;m.y=m.homeY;m.hidden=0;m.appear=.32;m.pull=0;m.drawIn=0;m.patrol=0;m.stride=0;m.airPath=null;
  enter(m,'idle');
}
function advance(m,x,y,speed,dt,turn=true){
  const dx=x-m.x,dy=y-m.y,d=Math.hypot(dx,dy);
  if(d===0)return true;
  const step=Math.min(1,speed*dt/d);
  if(turn&&Math.abs(dx*step)>.045)m.face=Math.sign(dx);
  m.x+=dx*step;m.y+=dy*step;
  return step===1;
}
// A flight leg always starts at the last simulated position, including after an interrupted pull.
function flight(m,state,x,y,seconds,lift){
  m.airPath={x:m.x,y:m.y,endX:x,endY:y,lift,seconds};enter(m,state,seconds);
}
function followFlight(m){
  const f=m.airPath,u=clamp(m.elapsed/f.seconds,0,1),ease=u*u*(3-2*u);
  m.x=f.x+(f.endX-f.x)*ease;
  m.y=f.y+(f.endY-f.y)*ease-16*f.lift*u*u*(1-u)*(1-u);
  return u===1;
}
function orbit(m,dt){
  m.patrol+=dt;
  const cap=m.kind==='cap',rare=species[m.kind].rare;
  const a=m.patrol*(cap?1.25:1.13);
  const x=m.homeX+Math.sin(a)*(cap?32:rare?13:28);
  const y=m.homeY+Math.sin(m.patrol*(cap?1.8:2.4))*(cap?14:8);
  advance(m,x,y,cap?62:54,dt);
}
function walkPatrol(m,dt){
  const moss=m.kind==='moss',radius=moss?16:31,speed=moss?20:42;
  if(m.state==='listen'){
    if(m.timer<=0){m.face*=-1;enter(m,'idle');}return;
  }
  const edge=clamp(m.homeX+m.face*radius,m.left,m.right);
  if(advance(m,edge,m.homeY,speed,dt,false))enter(m,'listen',moss?.85:.55);
}
function burr(m,p,dt){
  switch(m.state){
    case 'idle':
      if(Math.abs(p.x-m.x)<115&&Math.abs(p.y-m.y)<65){
        m.face=p.x<m.x?-1:1;enter(m,'warn',.85);
      }break;
    case 'warn':if(m.timer<=0)enter(m,'roll',.72);break;
    case 'roll': {
      const u=clamp(m.elapsed/.72,0,1);
      const speed=155*Math.min(1,.35+u*4,(1-u)*4+.23);
      const next=m.x+m.face*speed*dt;
      m.x=clamp(next,m.left,m.right);
      const hit=Math.abs(p.x-m.x)<32&&Math.abs(p.y-m.y)<35;
      if(m.timer<=0||m.x!==next)enter(m,'rest',.54);
      return hit;
    }
    case 'rest':
      if(m.timer<=0){m.face=m.homeX<m.x?-1:1;enter(m,'return');}break;
    case 'return':
      if(advance(m,m.homeX,m.homeY,55,dt))enter(m,'settle',.35);break;
    case 'settle':if(m.timer<=0)enter(m,'idle');break;
  }
  return false;
}
function flyingCap(m,p,dt,platforms){
  switch(m.state){
    case 'idle':
      orbit(m,dt);
      if(Math.abs(p.x-m.x)<116&&Math.abs(p.y-m.y)<145){
        m.face=p.x<m.x?-1:1;m.aimX=clamp(p.x,m.homeX-145,m.homeX+145);
        const floor=platforms.filter(([x,y,w])=>m.aimX>=x&&m.aimX<=x+w&&y>=m.y+8).reduce((h,f)=>Math.min(h,f[1]),Infinity);
        m.aimY=Math.min(floor-5,m.homeY+85,Math.max(m.y+18,p.y-20));enter(m,'warn',.70);
      }break;
    case 'warn':
      if(m.timer<=0)flight(m,'dive',m.aimX,m.aimY,.74,9);
      break;
    case 'dive': {
      if(followFlight(m))enter(m,'rest',.27);
      return Math.hypot(p.x-m.x,p.y-23-m.y)<36;
    }
    case 'rest':
      if(m.timer<=0){
        m.face=m.homeX<m.x?-1:1;
        flight(m,'return',m.homeX,m.homeY,1.02,-7);
      }break;
    case 'return':
      if(followFlight(m)){m.airPath=null;m.patrol=0;enter(m,'settle',.32);}break;
    case 'settle':if(m.timer<=0)enter(m,'idle');break;
  }
  return false;
}
// These attacks belong to authored encounters. Their target is fixed during the wind-up.
function landingAt(platforms,x,below){
  let floor=Infinity;
  for(const [left,top,width] of platforms)if(x>=left&&x<=left+width&&top>=below&&top<floor)floor=top;
  return floor;
}
function meadowAttack(m,p,dt,platforms,release){
  if(m.state==='rest'){
    if(m.timer<=0){m.face=m.homeX<m.x?-1:1;enter(m,'rejoin');}
    return false;
  }
  if(m.state==='windup'){
    if(m.timer>0)return false;
    if(m.pattern==='bound'){flight(m,'bound',m.aimX,m.homeY,.57,83);return false;}
    if(m.pattern==='cinder'){
      release?.({kind:'cinder',x:m.x+m.face*22,y:m.y-27,dir:m.face});
    }else{
      for(const target of m.drops)release?.({kind:'spore',x:m.x,y:m.y-16,targetX:target.x,ground:target.y});
    }
    enter(m,'rest',m.pattern==='cinder'?1.03:1.48);return false;
  }
  if(m.state==='bound'){
    if(followFlight(m)){
      release?.({kind:'thump',x:m.x,y:m.y,dir:0});enter(m,'rest',1.14);return false;
    }
    return Math.hypot(m.x-p.x,m.y-15-(p.y-22))<26;
  }
  if(m.state!=='idle')return false;
  if(m.pattern==='spores')orbit(m,dt);
  const dx=p.x-m.x,dy=p.y-m.y;
  const reach=m.pattern==='cinder'?215:m.pattern==='spores'?177:158;
  if(Math.abs(dx)>reach||Math.abs(dy)>(m.pattern==='spores'?176:79))return false;
  m.face=dx<0?-1:1;m.aimX=clamp(p.x,m.left,m.right);m.aimY=m.homeY;
  if(m.pattern==='spores'){
    const center=clamp(p.x,m.homeX-106,m.homeX+106);
    m.drops=[-53,53].map(d=>({x:center+d,y:landingAt(platforms,center+d,m.y+12)})).filter(q=>Number.isFinite(q.y));
    if(!m.drops.length)return false;
  }
  enter(m,'windup',m.pattern==='cinder'?.68:m.pattern==='spores'?.86:.74);
  return false;
}
function updateCreature(m,p,dt,pulling,platforms,release){
  if(m.hidden>0){m.hidden-=dt;if(m.hidden<=0)reappear(m);return false;}
  m.clock+=dt;
  if(m.appear>0){m.appear=Math.max(0,m.appear-dt);return false;}
  m.timer-=dt;m.elapsed+=dt;
  const old=m.x;
  let dangerous=false;
  if(pulling){
    if(m.state!=='drawn'){m.airPath=null;enter(m,'drawn');}
  }else{
    m.pull=0;
    if(m.state==='drawn')enter(m,'rejoin');
    if(m.state==='rejoin'){
      // Land first, then resume contact-driven steps back to the patrol.
      if(groundKind(m.kind)){
        const landingX=clamp(m.x,m.left,m.right);
        if(advance(m,landingX,m.homeY,128,dt))enter(m,'homeward');
      }else if(advance(m,m.homeX,m.homeY,94,dt)){
        m.patrol=0;enter(m,'idle');
      }
    }else if(m.state==='homeward'){
      if(advance(m,m.homeX,m.homeY,m.kind==='moss'?32:55,dt))enter(m,'idle');
    }else if(m.pattern)dangerous=meadowAttack(m,p,dt,platforms,release);
    else if(m.kind==='burr')dangerous=burr(m,p,dt);
    else if(m.kind==='cap')dangerous=flyingCap(m,p,dt,platforms);
    else if(groundKind(m.kind))walkPatrol(m,dt);
    else orbit(m,dt);
  }
  m.drawIn+=clamp(m.pull-m.drawIn,-3.5*dt,4.5*dt);
  if(!pulling)m.stride+=Math.abs(m.x-old);
  return dangerous;
}
module.exports={createCreature,reappear,updateCreature};

},
"dash-wave": function(require,module,exports){
'use strict';
function pitch(p){
 return Math.max(-.53,Math.min(.42,.69*Math.atan2(p.vy,Math.max(140,Math.abs(p.vx)))));
}
// One footprint positions the ImageGen wave and its contact envelope in both directions.
function shape(p,t){
 const phoenix=p.form==='fire',beat=.5+.5*Math.sin(t*6.8);
 if(p.form==='none')return {width:238+8*beat,height:132+6*beat,x:57+2*beat,y:-2,
  angle:pitch(p)*.83,originY:-47,face:p.dashFace};
 const width=(phoenix?290:218)+(phoenix?13:8)*beat;
 const height=(phoenix?(p.ground?136:154):103)+7*Math.sin(t*6.8+.8);
 const x=(phoenix?68:46)+2*beat,y=(phoenix?-13:-2)-2*beat;
 const angle=pitch(p)*.83,originY=phoenix?-61:-31;
 return {width,height,x,y,angle,originY,face:p.dashFace};
}
// Sweep between simulation positions so a narrow target cannot slip between updates.
// Use the luminous portion of the art, excluding the transparent padding and long wisps.
function hits(w,fromX,fromY,toX,toY,targetX,targetY,padX=0,padY=0){
 const c=Math.cos(w.angle),s=Math.sin(w.angle),rx=w.width*.39+padX,ry=w.height*.46+padY;
 const cx=w.x-w.width*.34,cy=w.y+w.height*.02;
 const dx=(targetX-fromX)*w.face,dy=targetY-fromY-w.originY;
 const x=(dx*c+dy*s-cx)/rx,y=(dy*c-dx*s-cy)/ry;
 const vx=(toX-fromX)*w.face,vy=toY-fromY;
 const ux=(vx*c+vy*s)/rx,uy=(vy*c-vx*s)/ry,length=ux*ux+uy*uy;
 const u=length?Math.max(0,Math.min(1,(x*ux+y*uy)/length)):0;
 return (x-u*ux)**2+(y-u*uy)**2<=1;
}
module.exports={shape,hits,pitch};

},
"game": function(require,module,exports){
'use strict';
const {levels,species,abilities}=require('./levels');
const {createCreature,reappear,updateCreature}=require('./creatures');
const {heavyTime,superTime,advanceTravel,castShape,heroFrame,wandPoint,bellTip,creatureFrame,creatureAngle}=require('./motion');
const {visibleWand,updateRig}=require('./actor-pose');
const nova=require('./nova');
const dashWave=require('./dash-wave');
const rushPath=require('./rush-path');
const {boltReach,bloomTime,bloomAxes,quakeSpan}=require('./spell-range');
const resonance=require('./resonance');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sign=x=>x<0?-1:1;
const gravity=1450;
const elementalForms=['fire','wind','stone'];
const dashRules={minimumStars:3,secondsPerStar:.8,speed:500};
const ranks=['B','A','S'];
function grade(stars,total,chests,allChests,rare){
  if(stars===total&&chests===allChests&&rare)return 'S';
  return chests||stars>=total*.6?'A':'B';
}
function profile(raw) {
  const v=raw&&raw.version===1?raw:{};
  const flags=(arr,keys)=>Array.isArray(arr)?Array.from(new Set(arr.filter(k=>keys.includes(k)))):[];
  const records=levels.map((stage,i)=>{
    const old=Array.isArray(v.records)&&v.records[i]||{};
    const stars=flags(old.stars,stage.stars.map((_,j)=>j)),chests=flags(old.chests,stage.chests.map((_,j)=>j));
    if(old.chest&&stage.chests.length&&!chests.includes(0))chests.unshift(0);
    const campIndex=Number.isInteger(old.campIndex)&&old.campIndex>=-1&&old.campIndex<stage.checkpoints.length
      ?old.campIndex:old.camp&&stage.checkpoints.length?0:-1;
    let best=ranks.includes(old.best)?old.best:null;
    if(i<3&&!best&&old.cleared&&!Array.isArray(old.chests)){
      const originalTotal=i===0?9:10,rare=['dew','veil','ink'][i];
      best=grade(stars.filter(j=>j<originalTotal).length,originalTotal,chests.includes(0)?1:0,1,Array.isArray(v.book)&&v.book.includes(rare));
    }
    const visitStars=flags(old.visitStars,stage.stars.concat(stage.energyStars||[]).map((_,j)=>j));
    return {stars,visitStars,chests,campIndex,bells:flags(old.bells,(stage.bells||[]).map((_,j)=>j)),passages:flags(old.passages,(stage.passages||[]).map(g=>g.id)),best,gate:!!old.gate,cleared:!!old.cleared,
      get chest(){return this.chests.includes(0);},get camp(){return this.campIndex>=0;}};
  });
  let unlocked=0;
  while(unlocked<levels.length-1&&records[unlocked].cleared)unlocked++;
  const skill=Object.keys(abilities).includes(v.skill)?v.skill:'none',forms=flags(v.forms,elementalForms);
  if(skill!=='none'&&!forms.includes(skill))forms.push(skill);
  return {version:1,records,unlocked,resume:clamp(Number.isInteger(v.resume)?v.resume:0,0,unlocked),skill,
    book:flags(v.book,Object.keys(species)),forms,muted:!!v.muted,
    dashStars:!v.dashInProgress&&Number.isSafeInteger(v.dashStars)?Math.max(0,v.dashStars):0,dashInProgress:false};
}
class Game{
  constructor(raw,save=()=>{}){
    this.data=profile(raw);this.write=save;this.scene='title';this.previousScene='title';this.viewWidth=960;
    this.index=this.data.resume;this.events=[];this.fx=[];this.clock=0;this.time=0;this.touch=false;this.bookPage=0;
    this.prepare(this.index);this.scene='title';this.events=[];
  }
  persist(){try{this.write(JSON.parse(JSON.stringify(this.data)));}catch(_){}}
  prepare(i){
    this.finishDash();
    this.index=i;this.level=levels[i];this.record=this.data.records[i];this.gate=!!this.record.gate;this.openedAt=null;this.chestTimes=[];this.bellTimes=[];this.usedSupplies=new Set();this.time=0;this.camera=0;
    this.starSpots=this.level.stars.concat(this.level.energyStars||[]);
    this.gates=[this.level.gate,...(this.level.passages||[])].filter(Boolean);this.passageTimes={};
    this.projectiles=[];this.hazards=[];this.fx=[];this.spellEffects=[];this.sparks=[];this.spellSeed=0;this.footEffects=[];this.recoils=[];this.trails=[];this.echoes=[];this.kick=null;this.events=[];this.hint={text:'',time:0};this.captured=null;this.grace=.12;this.buffer=0;
    this.rings=[];this.popups=[];this.flashes=[];this.springBounces=new Map();this.pulledStars=new Map();this.dashMotes=[];this.counterStars=[];this.lumiTrail=[];
    this.combo=0;this.comboTimer=0;this.maxCombo=0;this.comboFlash=0;this.formBanner=null;this.bossHit=0;this.starPulse=0;this.hpPulse=0;
    const saved=this.data.skill;
    const form=this.canWear(saved)?saved:(this.availableForms.find(k=>this.data.forms.includes(k))||'none');
    this.player={x:0,y:0,vx:0,vy:0,face:1,jumps:0,ground:false,hp:3,inv:0,dash:0,charge:0,charging:false,attack:0,cool:0,bell:false,pull:0,form,formTime:0,land:0,hit:0,slam:false,slamSuper:false,slamStartY:0,walk:0};
    this.enemyShots=[];this.announcedArea=0;
    this.releaseEnemyShot=shot=>{this.enemyShots.push({...shot,startX:shot.x,startY:shot.y,age:0});};
    this.monsters=this.level.creatures.map(([kind,x,y,pattern],j)=>createCreature(kind,x,y,j,this.level.platforms,pattern));this.startPoint();
    this.boss=i===3?{x:895,y:408,hp:9,max:9,stage:'warn',timer:2,elapsed:0,turn:0,move:'roots',marked:[],friend:false}:null;
  }
  startPoint(){
    this.finishDash();
    const cp=this.level.checkpoints[this.record.campIndex]||this.level.spawn;
    this.announcedArea=0;
    if(this.level.areas)while(this.level.areas[this.announcedArea+1]?.[0]<=cp[0])this.announcedArea++;
    Object.assign(this.player,{x:cp[0],y:cp[1]-1,vx:0,vy:0,jumps:0,ground:false,dash:0,slam:false,slamSuper:false,slamStartY:0,charging:false,charge:0,bell:false,pull:0,attack:0,bellBlocked:false,castHeavy:false,castSuper:false,castFace:this.player.face,land:0,launch:0,brake:0,brakeFace:this.player.face});
    this.spellEffects.length=0;this.projectiles.length=0;this.footEffects.length=0;this.recoils.length=0;this.trails.length=0;this.echoes.length=0;this.lastEcho=-1;this.kick=null;
    this.rings.length=0;this.popups.length=0;this.flashes.length=0;this.springBounces.clear();this.pulledStars.clear();this.dashMotes.length=0;this.counterStars.length=0;this.lumiTrail.length=0;
    this.combo=0;this.comboTimer=0;this.comboFlash=0;this.formBanner=null;this.bossHit=0;this.nextDashMote=0;this.dashMoteCount=0;
    this.sparks.length=0;this.player.rig=null;this.player.lastPose=this.player.form+'0';
    Object.assign(this.player,{stride:0,stepWeight:0,glideTime:0,gliding:false,walk:0});
    this.enemyShots.length=0;this.player.ward=false;this.player.dashFace=this.player.face;
    this.companion={x:this.player.x-this.player.face*39,y:this.player.y-62};
    this.cancelBell();this.nearby=null;this.attunement=null;this.player.formTime=0;
    this.buffer=0;this.grace=.1;this.camera=this.limitCamera(cp[0]-this.viewWidth*.325);
  }
  limitCamera(x){const end=this.level.width-this.viewWidth;return end<0?end/2:clamp(x,0,end);}
  get chestAt(){return this.chestTimes[0]??null;}
  get dashReady(){return !this.player.dash&&this.data.dashStars>=dashRules.minimumStars;}
  get dashFraction(){
    if(this.player.dash>0)return clamp(this.player.dash/(Math.max(1,this.data.dashStars)*dashRules.secondsPerStar),0,1);
    return Math.min(1,this.data.dashStars/dashRules.minimumStars);
  }
  finishDash(){
    if(!this.data.dashInProgress)return;
    this.player.dash=0;this.player.ridePose=null;this.data.dashStars=0;this.data.dashInProgress=false;this.persist();
  }
  get areaName(){
    const areas=this.level.areas;
    if(areas)for(let i=areas.length-1;i>=0;i--)if(this.player.x>=areas[i][0])return areas[i][1];
    return this.level.name;
  }
  get bellsReady(){return !this.level.bells||this.record.bells.length===this.level.bells.length;}
  get exitOpen(){return this.bellsReady&&this.gates.every(g=>this.gateOpen(g));}
  gateOpen(gate){return gate.id?this.record.passages.includes(gate.id):this.gate;}
  barrierBetween(a,b,pad=0){return this.gates.find(g=>!this.gateOpen(g)&&g.x>=Math.min(a,b)-pad&&g.x<=Math.max(a,b)+pad);}
  start(i=this.data.resume,revisit=false){
    if(!Number.isInteger(i)||i<0||i>this.data.unlocked)return false;
    if(revisit){
      this.data.records[i].visitStars=[];
      if(this.data.records[i].cleared)this.data.records[i].campIndex=-1;
    }
    this.prepare(i);this.scene='play';this.data.resume=i;this.persist();
    const returnHint=this.level.checkpointHints?.[this.record.campIndex];
    this.say(returnHint||this.level.story,5.2);this.events.push('start');return true;
  }
  say(text,t=3){this.hint={text,time:t};}
  discover(key,save=true){
    if(!this.data.book.includes(key)){this.data.book.push(key);if(save)this.persist();return true;}return false;
  }
  burst(x,y,color,count=12){
    for(let i=0;i<count;i++){const angle=(i/count)*Math.PI*2+this.time*.7,speed=44+(i%5)*26;
      this.fx.push({x,y,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed-22,t:.38+(i%4)*.11,max:.8,color,rad:2+i%3.5});
    }
    if(this.fx.length>260)this.fx.splice(0,this.fx.length-260);
  }
  addRing(x,y,r0,r1,color,rim='#fff7cf',life=.34,aspect=1,tilt=0,width=3.5,double=false){
    this.rings.push({x,y,r0,r1,color,rim,age:0,life,aspect,tilt,width,double});
    if(this.rings.length>28)this.rings.shift();
  }
  addPopup(x,y,text,color='#fff3b8',rim='#342449',scale=1,whileCharging=false){
    this.popups.push({x,y,vy:-58,text,color,rim,scale,whileCharging,age:0,life:.88});
    if(this.popups.length>12)this.popups.shift();
  }
  addFlash(color='#fff5cc',alpha=.26,life=.18){
    this.flashes.push({color,alpha,age:0,life});
    if(this.flashes.length>4)this.flashes.shift();
  }
  punch(x,y,face=1,amplitude=4.2,life=.34,zoom=.052){
    if(x<this.camera-48||x>this.camera+this.viewWidth+48)return;
    if(this.kick&&this.kick.amplitude>amplitude&&this.kick.age<this.kick.life*.45)return;
    this.kick={age:0,life,x,y,face,amplitude,zoom};
  }
  addCombo(x,y,label=null,color='#ffe68c'){
    this.combo++;this.comboTimer=4.2;this.comboFlash=.28;
    if(this.combo>this.maxCombo)this.maxCombo=this.combo;
    if(label)this.addPopup(x,y,label,color,'#312146',this.combo>=3?1.18:1);
    else if(this.combo===5)this.addPopup(x,y-32,'★ 星光狂热 ★','#ff9ee6','#312146',1.03);
    if(this.combo>=2)this.events.push('combo');
  }
  get availableForms(){return this.level.elements||elementalForms;}
  canWear(form){return form==='none'||(this.availableForms.includes(form)&&this.data.forms.includes(form));}
  quickEquip(form){
    if(this.scene!=='play'||this.player.dash>0||this.player.form===form||!this.canWear(form))return false;
    const p=this.player;this.equip(form,{x:p.x,y:p.y-38});this.persist();return true;
  }
  cycleForm(step=1){
    if(this.scene!=='play')return false;
    const owned=['none',...this.availableForms.filter(k=>this.data.forms.includes(k))];
    if(owned.length<2)return false;
    const next=owned[(owned.indexOf(this.player.form)+step+owned.length)%owned.length];
    return this.quickEquip(next);
  }
  changeScene(name){
    if(name==='title'||name==='retry')this.finishDash();
    if(name==='book'||name==='map'){this.previousScene=this.scene;this.bookPage=0;}
    if(this.player){this.player.charging=false;this.player.charge=0;this.cancelBell();}
    this.scene=name;
  }
  back(){
    if(this.scene==='book'||this.scene==='map'){this.scene=this.previousScene;return;}
    if(this.scene==='pause'){this.scene='play';return;}
    if(this.scene==='play')this.changeScene('pause');
  }
  toggleSound(){this.data.muted=!this.data.muted;this.persist();}
  step(dt,input={}){
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);this.clock+=dt;if(this.scene!=='play')return;
    this.time+=dt;const p=this.player;
    for(const key of ['inv','hit','formTime','attack','cool','land','brake','launch'])p[key]=Math.max(0,p[key]-dt);
    this.hint.time=Math.max(0,this.hint.time-dt);this.fx=this.fx.filter(f=>{f.t-=dt;f.x+=f.dx*dt;f.y+=f.dy*dt;f.dy+=65*dt;return f.t>0;});
    this.spellEffects=this.spellEffects.filter(f=>{f.age+=dt;return f.age<f.life;});
    this.footEffects=this.footEffects.filter(f=>{f.age+=dt;return f.age<f.life;});
    this.rings=this.rings.filter(r=>{r.age+=dt;return r.age<r.life;});
    this.popups=this.popups.filter(q=>{q.age+=dt;q.y+=q.vy*dt;q.vy*=Math.exp(-3.4*dt);return q.age<q.life&&(!q.whileCharging||p.charging);});
    this.flashes=this.flashes.filter(fl=>{fl.age+=dt;return fl.age<fl.life;});
    for(const [idx,b] of this.springBounces){b.age+=dt;if(b.age>=b.life)this.springBounces.delete(idx);}
    if(this.formBanner&&(this.formBanner.age+=dt)>=this.formBanner.life)this.formBanner=null;
    if(this.comboTimer>0){this.comboTimer=Math.max(0,this.comboTimer-dt);if(this.comboTimer===0)this.combo=0;}
    this.comboFlash=Math.max(0,this.comboFlash-dt);this.bossHit=Math.max(0,this.bossHit-dt);
    this.starPulse=Math.max(0,this.starPulse-dt);this.hpPulse=Math.max(0,this.hpPulse-dt);
    this.updateRecoils(dt);
    this.trails=this.trails.filter(f=>this.time-f.ended<f.life);
    nova.advance(this,dt);
    this.echoes=this.echoes.filter(f=>this.time-f.born<f.life);
    if(this.kick&&(this.kick.age+=dt)>=this.kick.life)this.kick=null;
    const fromX=p.x,fromY=p.y;
    this.updatePlayer(dt,input);
    const rushing=p.dash>0||p.slam||(!p.ground&&p.jumps===2&&p.vy< -190)||(!p.ground&&p.vy< -620);
    const boost=p.dash>0;
    rushPath.updateMotes(this,fromX,fromY);
    const previous=this.echoes[this.echoes.length-1];
    const newRun=boost&&(!previous?.boost||previous.dashBorn!==p.dashBorn||previous.travelFace!==p.dashFace);
    if(rushing&&(newRun||this.time-this.lastEcho>=(boost?.048:.032))){
      const id=heroFrame(p,'play',this.time);
      this.lastEcho=this.time;this.echoes.push({born:this.time,life:boost?rushPath.lifetime:.26,
        wake:boost?rushPath.anchor(this):null,dashBorn:p.dashBorn,x:p.x,y:p.y,id,
        face:p.attack>0?p.castFace:p.face,travelFace:p.dashFace,shape:castShape(p,id),form:p.form,boost,dash:boost||p.slam});
    }
    const follow=1-Math.exp(-10*dt);
    this.companion.x+=(p.x-p.face*39-this.companion.x)*follow;
    this.companion.y+=(p.y-62-this.companion.y)*follow;
    this.lumiTrail.push({x:this.companion.x,y:this.companion.y});
    if(this.lumiTrail.length>14)this.lumiTrail.shift();
    if(this.scene!=='play')return;
    this.updateDashCombat(dt,fromX,fromY);
    if(this.scene!=='play')return;
    if(!input.bell)p.bellBlocked=false;
    else if(p.dash>0)p.bellBlocked=true;
    const ringing=!!input.bell&&!p.bellBlocked&&p.dash<=0;
    this.updateBell(dt,ringing);this.updateStarSuction(dt,ringing);
    this.updateMonsters(dt,ringing);
    if(this.enemyShots.length)this.updateEnemyShots(dt);
    for(const f of this.spellEffects){
      if(f.type==='ground')this.propagateStone(f);
      else if(f.field&&f.age<=bloomTime+dt)this.propagateBloom(f);
    }
    this.updateShots(dt);
    if(this.counterStars.length)this.updateCounterStars(dt);
    if(this.scene!=='play')return;
    this.collect(ringing);
    if(p.dash>0){
      p.dash=p.dash>dt+1e-8?p.dash-dt:0;
      if(!p.dash){
        this.finishDash();
        const exitSpeed=input.left||input.right||Math.abs(input.axis||0)>.14?250:90;
        p.vx=clamp(p.vx,-exitSpeed,exitSpeed);
      }
    }
    if(this.boss)this.updateBoss(dt);
    if(this.scene!=='play')return;
    if(p.y>610){this.hurt(true);return;}
    if(!this.boss&&p.x>=this.level.exit&&this.exitOpen)this.complete();
    updateRig(p,heroFrame(p,this.scene,this.time),dt,this.time);
    this.camera+=(this.limitCamera(p.x-this.viewWidth*.325)-this.camera)*(1-Math.exp(-7*dt));
  }
  updatePlayer(dt,input){
    const p=this.player,keys=(input.right?1:0)-(input.left?1:0);
    const dir=keys||clamp(Number(input.axis)||0,-1,1);
    if(dir&&(!p.dash||Math.abs(dir)>.30)){
      p.face=sign(dir);if(p.dash>0)p.dashFace=p.face;
    }
    const grounded=p.ground;
    if(input.jumpDown)this.buffer=.13;else this.buffer=Math.max(0,this.buffer-dt);
    this.grace=p.ground?.11:Math.max(0,this.grace-dt);
    if(this.buffer>0&&!p.slam&&(p.ground||this.grace>0||p.jumps<2)){
      if(!p.ground&&this.grace<=0)p.jumps=Math.max(1,p.jumps);
      if(grounded)this.footprint(p.dash>0&&p.form==='none'?'starLift':p.dash>0&&p.form==='fire'?'fireLift':'launch',p.x,p.y,p.face,.72);
      p.jumps++;p.vy=p.jumps===1?-600:-490;p.launch=.12;p.brake=0;p.ground=false;this.grace=0;this.buffer=0;this.events.push('jump');
      if(p.jumps===2){
        const col=abilities[p.form].color;
        this.burst(p.x,p.y,col,14);this.burst(p.x,p.y,'#fff3c4',7);
        this.addRing(p.x,p.y-2,8,52,col,'#fff7d0',.30,.34,0,3.4,true);
        if(p.form==='wind')for(let i=this.enemyShots.length-1;i>=0;i--){
          const h=this.enemyShots[i];if(h.kind==='spore'&&Math.hypot(h.x-p.x,h.y-(p.y-24))<82){this.enemyShots.splice(i,1);this.clashHazard(h.x,h.y,p.face);}
        }
      }
    }
    if(input.dashDown)this.beginDash(grounded);
    if(input.attackCancel){p.charging=false;p.charge=0;}
    if(input.attackDown&&p.dash<=0&&p.cool<=0&&!p.slam&&p.hit<=.20){p.charging=true;p.charge=0;p.chargeFace=p.face;}
    if(p.charging&&input.attack){
      if(!input.attackUp)p.chargeFace=p.face;
      const before=p.charge;p.charge=Math.min(1.1,p.charge+dt);
      if(before<heavyTime&&p.charge>=heavyTime){
        this.events.push('chargeReady');
      }
      if(before<superTime&&p.charge>=superTime){
        this.events.push('superReady');
        this.addPopup(p.x,p.y-94,p.form==='none'?'群星就绪':'极光蓄满',abilities[p.form].color,'#312146',.70,true);
      }
    }
    if(p.charging&&(input.attackUp||!input.attack)){
      this.attack(p.charge>=heavyTime,p.charge>=superTime,p.chargeFace);p.charging=false;p.charge=0;
    }
    const speed=input.bell||input.walk?120:250;
    const target=p.dash>0?p.dashFace*dashRules.speed:dir*speed;
    if(p.ground&&p.dash<=0&&p.brake<=0&&Math.abs(p.vx)>150&&(!dir||sign(dir)!==sign(p.vx))){
      p.brake=.14;p.brakeFace=sign(p.vx);this.footprint('brake',p.x,p.y,p.brakeFace,.72);
    }
    const accel=(p.ground?1800:1150)*dt;
    p.vx+=clamp(target-p.vx,-accel,accel);
    if(p.dash>0)p.vx=target;
    const heldDescent=p.dash<=0&&p.form==='wind'&&!!input.jump&&p.vy>0&&!p.slam;
    if(heldDescent)p.vy=Math.min(p.vy,82);
    if(this.gate&&p.form==='wind'&&p.y>285&&p.y<510&&this.level.streams?.some(([a,b])=>p.x>=a-20&&p.x<b)){
      p.vy=Math.max(-160,p.vy-1900*dt);p.vx+=65*dt;
    }
    const oldX=p.x,oldY=p.y;
    p.x=clamp(p.x+p.vx*dt,14,this.level.width-14);
    const gate=this.barrierBetween(oldX,p.x,30);
    if(gate){
      p.x=oldX<=gate.x?gate.x-31:gate.x+31;p.vx=0;
    }
    if(!this.bellsReady&&p.x>this.level.bellCrossing-22){p.x=this.level.bellCrossing-22;p.vx=Math.min(0,p.vx);}
    p.vy=Math.min(p.vy+gravity*dt,p.slam?950:720);
    p.y+=p.vy*dt;p.ground=false;
    if(p.vy>=0){
      let top=Infinity;
      for(const [x,y,w] of this.level.platforms)if(p.x+9>x&&p.x-9<x+w&&oldY<=y+1&&p.y>=y&&y<top)top=y;
      if(top!==Infinity){
        if(p.vy>260){p.land=.18;this.footprint('land',p.x,top,p.face,Math.min(1.38,p.vy/530));}
        p.y=top;p.vy=0;p.ground=true;p.jumps=0;
        if(p.slam){const superSlam=p.slamSuper,drop=Math.max(0,p.y-p.slamStartY);p.slam=false;p.slamSuper=false;this.shock(superSlam,drop);}
        for(let si=0;si<this.level.springs.length;si++){const [sx,sy]=this.level.springs[si];if(Math.abs(p.x-sx)<26&&Math.abs(top-sy)<4&&oldY<=sy+1){
          if(p.dash>0&&p.form==='fire')this.footprint('fireLift',p.x,top,p.face,1);
          p.vy=-740;p.ground=false;p.jumps=1;p.launch=.12;
          this.springBounces.set(si,{age:0,life:.48});
          this.events.push('spring');this.burst(sx,sy-12,'#ffc3df',20);this.burst(sx,sy-16,'#fff4b8',8);
          this.addRing(sx,sy-6,10,74,'#ff9ed2','#fff4c4',.36,.42,0,4,true);
          this.punch(sx,sy-18,p.face,2.4,.20,.028);break;
        }}
      }
    }
    const halfStep=Math.floor(p.stride*2);
    advanceTravel(p,p.x-oldX,dt,heldDescent);
    p.walk+=Math.abs(p.x-oldX)*.069;
    if(!(p.dash>0&&p.form==='none')&&p.ground&&p.brake<=0&&Math.abs(p.vx)>100&&Math.floor(p.stride*2)!==halfStep)
      this.footprint('step',p.x-sign(p.vx)*5,p.y,sign(p.vx),Math.abs(p.vx)/550);
  }
  footprint(type,x,y,face,size){
    this.footEffects.push({type,x,y,face,size,age:0,life:type==='fireLift'?.74:type==='step'?.23:.34});
    if(this.footEffects.length>10)this.footEffects.shift();
  }
  beginDash(grounded=this.player.ground){
    const p=this.player;
    if(p.dash>0||p.slam||p.hit>.20)return;
    if(this.data.dashStars<dashRules.minimumStars){
      this.say('再吃 '+(dashRules.minimumStars-this.data.dashStars)+' 颗星，就能点亮冲刺。',1.6);return;
    }
    this.cancelBell();p.attack=0;p.charging=false;p.charge=0;p.castHeavy=false;p.castSuper=false;
    p.dash=this.data.dashStars*dashRules.secondsPerStar;p.dashBorn=this.time;p.dashFace=p.face;p.brake=0;
    this.data.dashInProgress=true;this.persist();
    const col=abilities[p.form].color;
    this.events.push('dash');
    if(p.form==='none'){this.footprint('starLift',p.x,p.y,p.face,1);return;}
    this.burst(p.x,p.y-25,col,14);
    if(p.form==='fire'){
      updateRig(p,heroFrame(p,this.scene,this.time),0,this.time);
      if(grounded)this.footprint('fireLift',p.x,p.y,p.face,1);
    }else{
      this.addRing(p.x-p.face*8,p.y-26,6,48,col,'#fff8d2',.24,.68,p.face*.25,3.2);
      if(p.ground)this.footprint('brake',p.x,p.y,p.face,.92);
    }
  }
  cancelBell(){
    const p=this.player;if(this.captured)this.captured.pull=0;
    this.captured=null;this.pullFrom=null;p.pull=0;p.bell=false;p.bellSpent=false;p.bellFace=p.face;
  }
  equip(form,origin){
    const p=this.player,old=p.form;
    if(old!==form){p.charging=false;p.charge=0;p.attack=0;p.castHeavy=false;p.castSuper=false;p.slam=false;p.slamSuper=false;p.gliding=false;p.glideTime=0;}
    p.form=form;this.data.skill=form;p.formTime=.66;
    if(old!==form)p.ridePose=null;
    this.attunement={form,from:old,x:origin.x,y:origin.y,born:this.time};
    const col=abilities[form].color;
    this.formBanner={form,name:abilities[form].name,color:col,age:0,life:1.55};
    this.burst(p.x,p.y-34,col,7);
    this.events.push('transform');
  }
  wearFromBook(form){
    if(this.scene!=='book'||this.player.dash>0||this.player.form===form||!this.canWear(form))return false;
    const p=this.player;this.equip(form,{x:p.x,y:p.y-40});this.persist();return true;
  }
  updateBell(dt,held){
    const p=this.player,wall=this.barrierBetween(p.x-200,p.x+200)?.x;
    if(this.attunement&&this.time-this.attunement.born>1.10)this.attunement=null;
    if(this.captured&&!resonance.canHold(p,this.captured,wall,this.availableForms))this.cancelBell();
    this.nearby=this.captured||resonance.findTarget(p,this.monsters,wall,this.availableForms);
    if(!held||p.dash>0||p.hit>.20||p.slam){this.cancelBell();return;}
    if(p.bellSpent)return;
    p.bell=true;
    const m=this.nearby;if(!m){p.bellFace=p.face;return;}
    if(!this.captured){
      this.captured=m;this.pullFrom=resonance.point(m);p.pull=0;
      p.bellFace=Math.abs(m.x-p.x)>9?sign(m.x-p.x):p.face;this.events.push('bellLock');
    }
    p.pull=Math.min(resonance.duration,p.pull+dt);m.pull=p.pull/resonance.duration;
    const tip=bellTip(p);resonance.drawIn(m,this.pullFrom,tip,m.pull,p.bellFace);
    if(m.pull<1)return;
    const a=species[m.kind];this.discover(m.kind,false);
    if(!this.data.forms.includes(a.skill))this.data.forms.push(a.skill);
    if(a.rare)p.hp=3;
    m.hidden=a.rare?99999:6;
    this.equip(a.skill,tip);this.burst(tip.x,tip.y,abilities[a.skill].color,14);
    this.say(a.name+' · '+abilities[a.skill].name+'已共鸣。'+(a.rare?'翅粉补满了三颗心。':abilities[a.skill].note),4.2);
    this.cancelBell();p.bellSpent=true;this.nearby=null;this.persist();
  }
  attack(heavy,superCast=false,face=this.player.face){
    const p=this.player;if(p.dash>0||p.cool>0)return;
    p.attack=heavy?.38:.23;p.cool=heavy?.48:.26;p.castHeavy=heavy;p.castSuper=!!superCast;p.castFace=face;
    this.events.push({none:superCast?'starVolley':'starCast',fire:'fireCast',wind:'windCast',stone:'stoneCast'}[p.form]);
    const skill=p.form;
    if(skill==='stone'&&heavy){
      if(!p.ground){p.slam=true;p.slamSuper=!!superCast;p.slamStartY=p.y;p.vy=superCast?830:760;}
      else this.shock(!!superCast,0);
      return;
    }
    const speed=(heavy?(skill==='wind'?735:650):skill==='stone'?355:skill==='wind'?540:440)+(superCast?48:0);
    const span=boltReach(skill,heavy,superCast);
    const tip=visibleWand(p,p.castFace,wandPoint(p,skill+'4',p.castFace));
    const lane=wandPoint(p,skill+'4',p.castFace,1).y;
    const reach=span+(heavy?0:13)-Math.abs(tip.x-p.x);
    const cast={bloom:false,boss:false};
    this.projectiles.push({cast,x:tip.x,y:tip.y,startY:tip.y,lane,vx:speed*p.castFace,age:0,max:reach/speed,kind:skill,heavy,super:!!superCast,power:superCast?4:heavy?3:1,hit:false,contacted:false,origin:p.x,trailDistance:0,trailIndex:0,path:[{x:tip.x,y:tip.y}]});
    this.markSpell('release',skill,tip.x,tip.y,p.castFace,heavy,!!superCast);
    if(superCast){
      const col=abilities[skill].color;
      this.addFlash(col,.30,.24);this.punch(tip.x,tip.y,p.castFace,6.2,.36,.068);
      if(skill!=='none')this.addRing(tip.x,tip.y,12,115,col,'#fff8d6',.38,.78,p.castFace*.2,5,true);
      this.addPopup(p.x,p.y-78,{none:'群星齐发',fire:'★ 烈焰凤凰! ★',wind:'★ 苍穹飓风! ★',stone:'★ 星陨巨震! ★'}[skill],col,'#2f1f44',1.2);
      for(const side of [-1,1]){
        const extra={x:tip.x,y:tip.y,startY:tip.y,lane,vx:(speed-20)*p.castFace,vy:skill==='wind'?side*155:0,wave:skill==='wind'?0:(skill==='fire'?34:26),phase:side>0?0:Math.PI,age:0,max:reach/speed*.92,kind:skill,heavy:true,super:true,auxiliary:true,power:2,hit:false,contacted:false,origin:p.x,trailDistance:0,trailIndex:0,path:[{x:tip.x,y:tip.y}]};
        if(skill==='none'){extra.starSide=side;extra.vx=speed*p.castFace;extra.max=reach/speed;}
        extra.cast=cast;this.projectiles.push(extra);
      }
    }
  }
  markSpell(type,kind,x,y,face,heavy,superCast=false){
    const life=type==='ground'?(superCast?1.20:.96):type==='impact'?(superCast?1.08:heavy?.91:.49):type==='terminal'?(heavy?.70:.40):type==='fade'?.25:heavy?.32:.19;
    const effect={type,kind,x,y,face,heavy,super:!!superCast,age:0,life,seed:++this.spellSeed*8191};
    this.spellEffects.push(effect);
    nova.scatter(this,effect);
    if(this.spellEffects.length>32)this.spellEffects.shift();
    if(heavy&&(type==='ground'||type==='impact')&&x>=this.camera-28&&x<=this.camera+this.viewWidth+28){
      this.punch(x,y,face,type==='ground'?(superCast?8.8:6.4):(superCast?6.8:4.8),superCast?.42:.34,type==='ground'?(superCast?.085:.064):(superCast?.070:.052));
      this.addFlash(abilities[kind].color,superCast?.30:.17,superCast?.22:.14);
    }
    return effect;
  }
  shock(superCast=false,dropHeight=0){
    const p=this.player;this.events.push('slam');this.burst(p.x,p.y-8,abilities.stone.color,superCast?42:28);
    const wave=this.markSpell('ground','stone',p.x,p.y,p.face,true,superCast);
    wave.drop=dropHeight;wave.cast={boss:false};
    wave.surface=this.level.platforms.find(([left,y,w])=>p.x>=left-9&&p.x<=left+w+9&&Math.abs(y-p.y)<2);
    if(superCast){
      this.addPopup(p.x,p.y-78,'★ 星陨巨震! ★',abilities.stone.color,'#2f1f44',1.24);
      for(const vx of [-250,-130,130,250]){
        this.projectiles.push({cast:wave.cast,x:p.x,y:p.y-14,startY:p.y-14,lane:p.y-14,vx,vy:-390-Math.abs(vx)*.45,arc:true,auxiliary:true,age:0,max:1.1,kind:'stone',heavy:true,super:true,power:2,hit:false,contacted:false,origin:p.x,trailDistance:0,trailIndex:0,path:[{x:p.x,y:p.y-14}]});
      }
    }
  }
  propagateStone(wave){
    if(!wave.surface||wave.age>.49)return;
    const [left,y,w]=wave.surface;
    const radius=quakeSpan(wave);
    const reached=(x,pad=0)=>x>=left&&x<=left+w&&Math.abs(x-wave.x)<=radius+pad;
    for(const gate of this.gates)if(!this.gateOpen(gate)&&gate.type==='stone'&&Math.abs(gate.y-y)<24&&reached(gate.x))this.openGate(gate);
    for(const m of this.monsters)if(!m.hidden&&Math.abs(m.y-y)<(wave.super?150:105)&&reached(m.x)&&!this.barrierBetween(wave.x,m.x))this.hitMonster(m,sign(m.x-wave.x),true);
    for(let i=this.enemyShots.length-1;i>=0;i--){
      const h=this.enemyShots[i];
      if((h.kind==='cinder'||h.kind==='spore')&&Math.abs(h.y-(y-24))<85&&reached(h.x,14)){this.enemyShots.splice(i,1);this.clashHazard(h.x,h.y,sign(h.x-wave.x));}
    }
    if(this.boss&&reached(this.boss.x,15))this.castHitsBoss(wave.cast,wave.super?4:3);
  }
  castHitsBoss(cast,power){
    if(cast.boss||this.boss?.stage!=='weak')return;
    cast.boss=true;this.hitBoss(power);
  }
  boltBurst(shot,type,x,y){
    if(shot.arc){this.markSpell(type,shot.kind,x,y,sign(shot.vx),false);return;}
    if(shot.heavy&&(shot.cast.bloom||shot.auxiliary&&type==='terminal'))return;
    const f=this.markSpell(type,shot.kind,x,y,sign(shot.vx),shot.heavy,shot.super);
    if(shot.heavy&&!shot.arc){
      shot.cast.bloom=true;f.field=shot.cast;f.power=shot.super?4:3;this.propagateBloom(f);
    }
  }
  propagateBloom(f){
    const [rx,ry]=bloomAxes(f);
    const inside=(x,y)=>Math.abs(x-f.x)<=rx&&((x-f.x)/rx)**2+((y-f.y)/ry)**2<=1&&!this.barrierBetween(f.x,x);
    if(f.kind==='none'&&f.super){
      this.starSpots.forEach(([sx,sy],i)=>{
        const cur=this.pulledStars.get(i),x=cur?cur.x:sx,y=cur?cur.y:sy;
        if(!cur?.called&&!this.record.visitStars.includes(i)&&inside(x,y)&&!this.barrierBetween(this.player.x,x))
          this.pulledStars.set(i,{x,y,called:true});
      });
    }
    for(const m of this.monsters)if(m.hidden<=0&&m.appear<=0&&inside(m.x,m.y-18))this.hitMonster(m,m.x===f.x?f.face:sign(m.x-f.x),true);
    if(this.boss&&inside(this.boss.x,this.boss.y-70))this.castHitsBoss(f.field,f.power);
  }
  openGate(gate=this.level.gate){
    if(!gate||this.gateOpen(gate))return;
    if(gate.id){this.record.passages.push(gate.id);this.passageTimes[gate.id]=this.time;}
    else{this.gate=true;this.openedAt=this.time;this.record.gate=true;}
    const col=abilities[gate.type].color;
    this.events.push('gate');this.burst(gate.x,gate.y-55,col,38);this.burst(gate.x,gate.y-55,'#fff4c2',16);
    this.addRing(gate.x,gate.y-52,16,175,col,'#fff8d6',.52,1,0,6,true);
    this.addFlash(col,.32,.26);this.punch(gate.x,gate.y-52,this.player.face,6.6,.40,.068);
    nova.scatter(this,{type:'impact',kind:gate.type,x:gate.x,y:gate.y-50,face:this.player.face,heavy:true,super:true,seed:++this.spellSeed*8191});
    this.say({fire:'枯藤化成了金色飞灰，石拱后的路亮了。',wind:'风标转动了！跳入风道，按住跳跃滑翔过桥。',stone:'石壁裂开了，露米照出一条旧矿道。'}[gate.type],4);this.persist();
  }
  hitMonster(m,dir=this.player.face,heavy=false,source='shot'){
    if(m.hidden>0||(m.appear>0&&source!=='dash'))return;
    const id=creatureFrame(m),face=m.pull?(m.x>this.player.x?-1:1):m.face,kind=species[m.kind];
    const isHostile=!!(kind.hostile||m.pattern);
    this.recoils.push({id,kind:m.kind,x:m.x,y:m.y,curX:m.x,curY:m.y,face,angle:creatureAngle(m,id),size:1-.84*resonance.smooth(m.drawIn),dir,heavy,freeze:heavy?.095:.05,isHostile,age:0,life:heavy?.72:.42});
    if(this.recoils.length>12)this.recoils.shift();
    this.discover(m.kind);this.burst(m.x,m.y-20,kind.color,heavy?20:13);this.burst(m.x,m.y-20,'#fff5c0',heavy?10:5);
    this.addRing(m.x,m.y-20,5,heavy?42:32,kind.color,'#fff8d2',.21,.72,dir*.22,2);
    if(isHostile){
      this.events.push('enemyPop');
      if(source==='bowl')this.addCombo(m.x,m.y-36,'★ 撞飞连锁! ★','#ff9ee6');
      else if(source==='dash')this.addCombo(m.x,m.y-36,this.combo>=1?(this.combo+1)+' HIT!':'✦ 冲刺击飞! ✦',abilities[this.player.form].color);
      else this.addCombo(m.x,m.y-34,null,'#ffe68c');
    }
    m.hidden=kind.rare?1.8:isHostile?8:3.2;m.pull=0;
    if(this.captured===m)this.cancelBell();
  }
  updateRecoils(dt){
    const alive=[];
    for(const r of this.recoils){
      r.age+=dt;
      const u=clamp((r.age-r.freeze)/(r.life-r.freeze),0,1);
      const distance=r.heavy?219:86,height=r.heavy?95:31;
      r.curX=r.x+r.dir*distance*u*(1.55-.55*u);r.curY=r.y-4*u*(1-u)*height;
      if(r.heavy&&r.age>r.freeze&&u<.94){
        for(const m of this.monsters){
          if(m.hidden>0||m.appear>0||!(species[m.kind].hostile||m.pattern))continue;
          if(Math.abs(m.x-r.curX)<40&&Math.abs(m.y-r.curY)<52&&!this.barrierBetween(r.x,m.x)){
            this.events.push('bowling');this.punch(m.x,m.y-18,r.dir,4.5,.26,.048);
            this.hitMonster(m,r.dir,true,'bowl');
          }
        }
      }
      if(r.age<r.life)alive.push(r);
      else{
        const col=species[r.kind]?.color||'#ffe69c';
        this.burst(r.curX,r.curY-18,col,r.heavy?18:10);this.burst(r.curX,r.curY-18,'#fff8d2',6);
        this.addRing(r.curX,r.curY-18,6,r.heavy?56:36,col,'#fff8d6',.28,1,0,3);
      }
    }
    this.recoils=alive;
  }
  updateDashCombat(dt,fromX=this.player.x,fromY=this.player.y){
    const p=this.player;
    if(p.dash>0){
      const wave=dashWave.shape(p,this.time-p.dashBorn);
      const contact=(x,y,padX=0,padY=0)=>dashWave.hits(wave,fromX,fromY,p.x,p.y,x,y,padX,padY)&&!this.barrierBetween(p.x,x);
      for(const m of this.monsters){
        if(m.hidden>0||!(species[m.kind].hostile||m.pattern))continue;
        if(contact(m.x,m.y-18,14,19)){
          p.inv=Math.max(p.inv,.26);this.events.push('dashHit');
          this.markSpell('impact',p.form,m.x,m.y-18,p.dashFace,true);
          this.hitMonster(m,p.dashFace,true,'dash');
        }
      }
      const boss=this.boss;
      if(boss&&!boss.friend&&contact(boss.x,boss.y-84,45,65)){
        this.events.push('dashHit');this.hitBoss(boss.hp,true);return;
      }
      for(let i=this.enemyShots.length-1;i>=0;i--){
        const h=this.enemyShots[i];
        if((h.kind==='cinder'||h.kind==='spore')&&contact(h.x,h.y,8,9)){
          p.inv=Math.max(p.inv,.22);this.enemyShots.splice(i,1);this.clashHazard(h.x,h.y,p.dashFace,false);
        }
      }
      if(this.boss)for(let i=this.hazards.length-1;i>=0;i--){
        const h=this.hazards[i];
        if(h.kind==='fruit'&&contact(h.x,h.y,15,15)){
          p.inv=Math.max(p.inv,.22);this.hazards.splice(i,1);this.clashHazard(h.x,h.y,p.dashFace,false);
        }
      }
    }
    if(p.slam){
      for(const m of this.monsters){
        if(m.hidden>0||m.appear>0||!(species[m.kind].hostile||m.pattern))continue;
        if(Math.abs(m.x-p.x)<42&&Math.abs((m.y-18)-(p.y-18))<44){
          p.inv=Math.max(p.inv,.22);
          this.markSpell('impact','stone',m.x,m.y-14,sign(m.x-p.x)||p.face,true);
          this.hitMonster(m,sign(m.x-p.x)||p.face,true,'dash');
        }
      }
    }
  }
  updateStarSuction(dt,pulling){
    const p=this.player,tip={x:p.x+p.face*10,y:p.y-28};
    this.starSpots.forEach(([sx,sy],i)=>{
      if((Math.abs(sx-p.x)>175&&!this.pulledStars.has(i))||this.record.visitStars.includes(i))return;
      const cur=this.pulledStars.get(i);
      if(cur?.called&&this.barrierBetween(cur.x,tip.x))cur.called=false;
      if(pulling||cur?.called){
        const x=cur?cur.x:sx,y=cur?cur.y:sy,dx=tip.x-x,dy=tip.y-y,d=Math.hypot(dx,dy);
        if((cur?.called||d<165)&&d>1){
          const spd=cur?.called?Math.min(960,530+d*.85):clamp(460-d*1.1,210,460),step=Math.min(d,spd*dt);
          this.pulledStars.set(i,{x:x+dx/d*step,y:y+dy/d*step,called:!!cur?.called});
        }
      }else if(cur){
        const dx=sx-cur.x,dy=sy-cur.y,d=Math.hypot(dx,dy);
        if(d<3)this.pulledStars.delete(i);
        else{const step=Math.min(d,240*dt);cur.x+=dx/d*step;cur.y+=dy/d*step;}
      }
    });
  }
  clashHazard(x,y,face=1,reflect=true){
    this.events.push('clash');
    this.burst(x,y,'#fff3a8',18);this.burst(x,y,'#ff9de8',10);
    this.addRing(x,y,10,96,'#fff4b0','#ff9ae0',.38,1,0,5,true);
    this.addFlash('#fff4cc',.24,.17);this.punch(x,y,face,4.8,.26,.054);
    this.addCombo(x,y-22,reflect?'✦ 弹反! ✦':'冲散弹幕','#fff4a8');
    if(!reflect)return;
    let target=null,best=Infinity;
    for(const m of this.monsters){
      if(m.hidden>0||m.appear>0||!(species[m.kind].hostile||m.pattern))continue;
      const d=Math.hypot(m.x-x,(m.y-18)-y);if(d<380&&d<best){best=d;target=m;}
    }
    const dir=target?sign(target.x-x):face;
    const vx=target?(target.x-x)/Math.max(.18,best/520):dir*520,vy=target?((target.y-18)-y)/Math.max(.18,best/520):-60;
    this.counterStars.push({x,y,vx,vy,age:0,max:.82,path:[{x,y}]});
  }
  updateCounterStars(dt){
    this.counterStars=this.counterStars.filter(s=>{
      s.age+=dt;if(s.age>=s.max)return false;
      let target=null,best=Infinity;
      for(const m of this.monsters){
        if(m.hidden>0||m.appear>0||!(species[m.kind].hostile||m.pattern))continue;
        const d=Math.hypot(m.x-s.x,(m.y-18)-s.y);if(d<360&&d<best){best=d;target=m;}
      }
      if(!target&&this.boss&&!this.boss.friend&&this.boss.stage==='weak'){target={x:this.boss.x,y:this.boss.y-75,isBoss:true};}
      if(target){
        const tx=target.x,ty=target.isBoss?target.y:target.y-18,dx=tx-s.x,dy=ty-s.y,d=Math.hypot(dx,dy)||1;
        const desiredX=dx/d*560,desiredY=dy/d*560;
        s.vx+=(desiredX-s.vx)*Math.min(1,11*dt);s.vy+=(desiredY-s.vy)*Math.min(1,11*dt);
      }
      s.x+=s.vx*dt;s.y+=s.vy*dt;s.path.push({x:s.x,y:s.y});if(s.path.length>16)s.path.shift();
      for(const m of this.monsters){
        if(m.hidden>0||m.appear>0||!(species[m.kind].hostile||m.pattern))continue;
        if(Math.hypot(m.x-s.x,(m.y-18)-s.y)<32){
          this.markSpell('impact','none',m.x,m.y-18,sign(s.vx),true);
          this.hitMonster(m,sign(s.vx),true,'dash');return false;
        }
      }
      if(this.boss&&!this.boss.friend&&this.boss.stage==='weak'&&Math.hypot(this.boss.x-s.x,(this.boss.y-75)-s.y)<62){
        this.markSpell('impact','none',s.x,s.y,sign(s.vx),true);
        this.hitBoss(2);return false;
      }
      return true;
    });
  }
  updateShots(dt){
    for(const shot of this.projectiles){
      const prev=shot.age===0?shot.origin:shot.x,travel=Math.min(dt,Math.max(0,shot.max-shot.age));shot.age+=dt;shot.x+=shot.vx*travel;
      if(shot.arc){
        const from=shot.path[shot.path.length-1];
        shot.vy+=980*travel;shot.y+=shot.vy*travel;
        if(shot.y>from.y){
          let landing=null;
          for(const [left,top,width] of this.level.platforms){
            if(from.y>top||shot.y<top||(landing&&top>=landing.y))continue;
            const x=from.x+(shot.x-from.x)*(top-from.y)/(shot.y-from.y);
            if(x>=left&&x<=left+width)landing={x,y:top};
          }
          if(landing){
            shot.x=landing.x;shot.y=landing.y;shot.path.push(landing);
            nova.trace(this,shot,from,landing);this.markSpell('impact','stone',shot.x,shot.y,sign(shot.vx),false);shot.hit=true;continue;
          }
        }
      }else if(shot.starSide){
        const arc=Math.sin(Math.PI*clamp(shot.age/shot.max,0,1));
        shot.y=shot.startY+(shot.lane-shot.startY)*clamp(shot.age/.16,0,1)+shot.starSide*58*arc;
      }else if(shot.wave){
        const curve=Math.min(1,shot.age/.14);
        shot.y=shot.startY+(shot.lane-shot.startY)*curve+Math.sin(shot.age*15+shot.phase)*shot.wave;
      }else if(shot.vy){
        shot.y+=shot.vy*dt;shot.vy*=Math.exp(-2.6*dt);
      }else{
        const curve=Math.min(1,shot.age/.16);shot.y=shot.startY+(shot.lane-shot.startY)*curve*(2-curve);
      }
      const last=shot.path[shot.path.length-1],head={x:shot.x,y:shot.y};shot.path.push(head);
      if(shot.path.length>(shot.heavy?30:18))shot.path.shift();
      const crosses=(x,margin)=>x>=Math.min(prev,shot.x)-margin&&x<=Math.max(prev,shot.x)+margin;
      const gate=this.barrierBetween(prev,shot.x,12);
      if(gate){
        head.x=gate.x-sign(shot.vx)*10;nova.trace(this,shot,last,head);
        if(!shot.cast.bloom)this.boltBurst(shot,'impact',head.x,shot.y);
        if(shot.kind===gate.type&&gate.type!=='stone'&&shot.y>=gate.y-(gate.type==='fire'?112:86)&&shot.y<=gate.y+4)this.openGate(gate);
        shot.hit=true;continue;
      }
      for(let i=this.enemyShots.length-1;i>=0;i--){
        const h=this.enemyShots[i];
        if((h.kind==='cinder'||h.kind==='spore')&&crosses(h.x,shot.heavy?34:24)&&Math.abs(shot.y-h.y)<(shot.heavy?46:32)){
          this.enemyShots.splice(i,1);this.clashHazard(h.x,h.y,sign(shot.vx));shot.contacted=true;
          if(!shot.heavy){shot.hit=true;head.x=h.x;break;}
        }
      }
      if(shot.hit)continue;
      if(this.boss)for(let i=this.hazards.length-1;i>=0;i--){
        const h=this.hazards[i];
        if(h.kind==='fruit'&&crosses(h.x,shot.heavy?38:28)&&Math.abs(shot.y-h.y)<44){
          this.hazards.splice(i,1);this.clashHazard(h.x,h.y,sign(shot.vx));shot.contacted=true;
          if(!shot.heavy){shot.hit=true;head.x=h.x;break;}
        }
      }
      if(shot.hit)continue;
      for(const m of this.monsters){
        if(m.hidden>0||m.appear>0||!crosses(m.x,shot.super?52:shot.heavy?38:22)||Math.abs(shot.y-(m.y-18))>(shot.super?81:shot.heavy?62:38)||this.barrierBetween(prev,m.x))continue;
        this.hitMonster(m,sign(shot.vx),shot.heavy);this.boltBurst(shot,'impact',m.x,m.y-18);shot.contacted=true;
        if(!shot.heavy){shot.hit=true;head.x=m.x;break;}
      }
      if(!shot.hit&&this.boss&&crosses(this.boss.x,49)&&Math.abs(shot.y-(this.boss.y-70))<94){
        head.x=this.boss.x-sign(shot.vx)*43;
        this.boltBurst(shot,'impact',head.x,shot.y);
        this.castHitsBoss(shot.cast,shot.super?4:shot.power);shot.hit=true;
      }
      nova.trace(this,shot,last,head);
    }
    this.projectiles=this.projectiles.filter(s=>{
      if(!s.hit&&s.age<s.max)return true;
      this.trails.push({path:s.path,kind:s.kind,heavy:s.heavy,super:s.super,auxiliary:s.auxiliary,ended:this.time,life:s.super?.42:s.heavy?.31:.24});
      if(!s.hit){
        if(s.contacted||s.cast.bloom||s.auxiliary)this.markSpell('fade',s.kind,s.x,s.y,sign(s.vx),s.heavy);
        else this.boltBurst(s,'terminal',s.x,s.y);
      }
      return false;
    });
  }
  updateMonsters(dt,held=this.player.bell){
    const p=this.player;
    for(const m of this.monsters){
      const pulling=m===this.captured&&held&&m.pull>0;
      if(updateCreature(m,p,dt,pulling,this.level.platforms,this.releaseEnemyShot))this.hurt(false);
      if(m.hidden>0||m.appear>0||pulling)continue;
      const dx=Math.abs(m.x-p.x),dy=Math.abs(m.y-p.y);
      if(species[m.kind].rare){
        if(dx<168&&dy<108&&!this.data.book.includes(m.kind)&&this.hint.time<=0)this.say('露米照亮了细小的翅粉。循光靠近，长按共鸣来记录它。',3);
      }else if(dx<117&&dy<95)this.discover(m.kind);
    }
  }
  updateEnemyShots(dt){
    const p=this.player;
    this.enemyShots=this.enemyShots.filter(h=>{
      const oldX=h.x;h.age+=dt;
      if(h.kind==='cinder'){
        h.x+=h.dir*253*dt;h.y=h.startY-7*Math.sin(h.age*4);
        if(h.age>1.14||this.level.platforms.some(([x,y,w,d])=>h.x>=x&&h.x<=x+w&&h.y>=y&&h.y<=y+d))return false;
        if(p.x>=Math.min(oldX,h.x)-18&&p.x<=Math.max(oldX,h.x)+18&&Math.abs(p.y-25-h.y)<26){this.hurt(false);return false;}
      }else if(h.kind==='spore'){
        const fallTime=.60+(h.ground-h.startY)/300,u=Math.min(1,h.age/fallTime);
        h.x=h.startX+(h.targetX-h.startX)*Math.sin(u*Math.PI/2);
        h.y=h.startY+(h.ground-7-h.startY)*u*u;
        if(Math.hypot(p.x-h.x,p.y-25-h.y)<24){this.hurt(false);return false;}
        if(u===1){this.burst(h.x,h.y,'#db9fef',5);return false;}
      }else{
        const radius=8+180*h.age;
        if(Math.abs(p.x-h.x)<radius+8&&p.y>=h.y-23&&p.y<=h.y+16)this.hurt(false);
        if(h.age>=.26)return false;
      }
      return true;
    });
  }
  collect(ringing=false){
    const p=this.player,record=this.record;
    const nextArea=this.level.areas?.[this.announcedArea+1];
    if(nextArea&&p.x>=nextArea[0]){this.announcedArea++;this.say(nextArea[2],3.1);}
    this.starSpots.forEach(([sx,sy],i)=>{
      if((Math.abs(sx-p.x)>175&&!this.pulledStars.has(i))||record.visitStars.includes(i))return;
      const cur=this.pulledStars.get(i),x=cur?cur.x:sx,y=cur?cur.y:sy;
      if(Math.hypot(x-p.x,y-p.y+28)<38){
        const newStamp=i<this.level.stars.length&&!record.stars.includes(i);
        if(newStamp)record.stars.push(i);
        record.visitStars.push(i);this.pulledStars.delete(i);this.starPulse=.32;
        this.data.dashStars++;
        if(p.dash>0)p.dash+=dashRules.secondsPerStar;
        this.events.push('star');this.burst(x,y,'#ffe598',13);this.burst(x,y,'#fff8d8',5);
        this.addRing(x,y,5,44,'#ffe58a','#ffffff',.28,1,0,3);
        if(!p.dash&&this.data.dashStars===dashRules.minimumStars){
          this.events.push('dashReady');this.addPopup(p.x,p.y-77,'冲刺就绪','#ffe598');
          this.say(this.touch?'3 星就绪！点一下冲刺，攒得越多，跑得越久。':'3 星就绪！按 L 冲刺，攒得越多，跑得越久。',2.8);
        }
        this.fx.push({picture:'pickup',x,y,dx:0,dy:-52,t:.34,max:.34,refill:!newStamp});
        this.persist();
      }
    });
    this.level.chests.forEach(([x,y],i)=>{
      if(record.chests.includes(i)||Math.abs(x-p.x)>=40||Math.abs(y-p.y)>=50)return;
      record.chests.push(i);this.chestTimes[i]=this.time;p.hp=3;this.hpPulse=.34;
      this.burst(x,y-20,'#ffe598',32);this.burst(x,y-26,'#ff9ee6',14);
      this.addRing(x,y-22,12,145,'#ffe080','#fff9dc',.54,1,0,5.5,true);
      this.addFlash('#ffe796',.30,.26);this.punch(x,y-24,p.face,4.4,.32,.05);
      this.addPopup(x,y-58,'★ 寻得铃匣! ★','#ffe68a','#35224b',1.15);
      this.events.push('chest');
      this.say('找到了藏在这里的铃匣。匣里的光补满了生命。');this.persist();
    });
    this.level.checkpoints.forEach(([x,y],i)=>{
      const reached=this.index!==0&&i===0?p.x>=x-36:Math.abs(p.x-x)<=38&&p.y<=y+45&&p.y>=y-180;
      if(i<=record.campIndex||!this.gate||!reached)return;
      record.campIndex=i;p.hp=3;this.hpPulse=.34;this.events.push('camp');
      this.burst(x+17,y-48,'#ffea96',22);this.addRing(x+17,y-48,8,108,'#ffe38a','#fff8d6',.46,1,0,4.2,true);
      this.addFlash('#ffe99e',.18,.20);this.addPopup(x+17,y-86,'✦ 回声灯亮起 ✦','#ffeaa0','#322248',1.02);
      this.say('露米点亮了回声灯，这里可以重新出发。');this.persist();
    });
    (this.level.supplies||[]).forEach(([kind,x,y],i)=>{
      if(this.usedSupplies.has(i)||Math.hypot(p.x-x,p.y-27-y)>31)return;
      if(kind==='berry'){if(p.hp===3)return;p.hp++;this.hpPulse=.34;this.addPopup(x,y-24,'♥ +1','#ff9db0','#3b2142',1.06);this.say('晨露莓补回了一颗心。',1.8);}
      else{if(p.ward)return;p.ward=true;this.addPopup(x,y-26,'✦ 护铃守护 ✦','#8ff5eb','#233349',1.04);this.say('护铃绕在身边，可以替阿洛挡一次攻击。',2.2);}
      this.usedSupplies.add(i);this.events.push(kind);
      const col=kind==='berry'?'#ff9985':'#8ff5eb';
      this.burst(x,y,col,18);this.addRing(x,y,8,66,col,'#fff8d8',.34,1,0,3.6,true);
    });
    if(ringing)(this.level.bells||[]).forEach(([x,y,name],i)=>{
      if(record.bells.includes(i)||Math.abs(p.x-x)>101||Math.abs(p.y-30-(y-43))>121)return;
      record.bells.push(i);this.bellTimes[i]=this.time;
      this.burst(x,y-47,'#ffdb92',34);this.burst(x,y-54,'#fff8d6',14);
      this.addRing(x,y-56,16,240,'#ffdf8a','#fff8d6',.68,1,0,6,true);
      this.addFlash('#ffe8a0',.28,.24);this.punch(x,y-54,p.face,5.4,.36,.06);
      this.addPopup(x,y-108,'♪ '+name+'共鸣 ♪','#ffe794','#332248',1.16);
      this.events.push('chime');
      this.say(this.bellsReady?'两座钟彼此应和，通往萤溪的铃桥亮了。':name+'响了。沿着星章去找另一座钟。',3);this.persist();
    });
  }
  hurt(fall){
    const p=this.player;if(this.scene!=='play'||(!fall&&(p.inv>0||p.dash>0)))return;
    if(!fall&&p.ward){
      p.ward=false;p.inv=.9;this.burst(p.x,p.y-30,'#a0f5ef',26);
      this.addRing(p.x,p.y-30,14,116,'#8ef5ee','#ffffff',.42,1,0,5,true);
      this.addFlash('#8ff5eb',.26,.20);this.punch(p.x,p.y-30,p.face,4.6,.28,.048);
      this.addPopup(p.x,p.y-64,'✦ 护铃格挡! ✦','#9cf8f0','#21334a',1.08);
      this.events.push('wardBreak');return;
    }
    p.hp--;this.hpPulse=.36;p.inv=1.45;p.hit=.36;p.charging=false;p.charge=0;this.combo=0;this.comboTimer=0;this.cancelBell();this.events.push('hurt');
    this.addFlash('#ff768a',.26,.22);this.punch(p.x,p.y-30,-p.face,5.2,.30,.04);
    if(!p.hp){this.changeScene('retry');return;}
    if(fall){this.startPoint();p.inv=1.4;this.say('回声灯把阿洛带回了草地。',2.2);}else{p.vy=-205;p.ground=false;}
  }
  retry(){this.start(this.index);this.player.inv=1.5;}
  hitBoss(n,dashImpact=false){
    const b=this.boss;if(!b||b.friend||(!dashImpact&&b.stage!=='weak'))return;
    b.hp=Math.max(0,b.hp-n);this.bossHit=.34;this.events.push('heartHit');
    this.burst(b.x,b.y-96,'#fff2b7',30);this.burst(b.x,b.y-96,'#ffae6d',14);
    this.addRing(b.x,b.y-92,16,185,'#ffe88e','#ffffff',.50,1,0,6.5,true);
    this.addFlash('#fff2b7',.32,.24);this.punch(b.x,b.y-92,1,7.2,.40,.076);
    this.addCombo(b.x,b.y-142,b.hp?'★ 铃心共鸣! ★':'★ 古树苏醒! ★','#fff09a');
    if(!b.hp){b.friend=true;this.discover('elder');this.hazards=[];this.complete();}
  }
  updateBoss(dt){
    const b=this.boss;if(b.friend)return;const p=this.player;
    b.timer-=dt;b.elapsed+=dt;
    if(b.timer<=0){
      if(b.stage==='warn'){
        b.stage='active';b.elapsed=0;b.timer=b.hp<=4?1.65:1.85;
        if(b.move==='roots'){
          this.hazards.push({kind:'wave',x:b.x-48,y:408,t:0,life:3.3,v:-310});
          if(b.hp<=4)this.hazards.push({kind:'wave',x:b.x+112,y:408,t:0,life:3.7,v:-310});
        }else if(b.move==='fruit'){
          const loc=b.marked.length?b.marked:[p.x-70,p.x+95];
          loc.forEach((x,i)=>this.hazards.push({kind:'fruit',x,y:60-i*28,t:0,life:1.65,v:120}));
        }else if(b.move==='vines'){
          b.marked.forEach(x=>this.hazards.push({kind:'vine',x,y:408,t:0,life:1.15,v:0}));
        }else{
          const k=['ember','plume','moss'][b.turn%3];const existing=this.monsters.find(m=>m.kind===k);
          if(existing){if(existing.hidden>0)reappear(existing);}
          else{
            const guest=createCreature(k,410,k==='plume'?350:408,this.monsters.length,this.level.platforms);
            reappear(guest);this.monsters.push(guest);
          }
          this.say('树叶间落下一个小朋友。可以再次共鸣！',2);
        }
      }else if(b.stage==='active'){
        b.stage='weak';b.elapsed=0;b.timer=b.hp<=4?2.55:3;this.say('露米 · 铃心亮了！现在攻击胸前的碎片。',2.4);
      }else{
        b.turn++;b.move=['roots','fruit','vines','summon'][b.turn%4];b.stage='warn';b.elapsed=0;b.timer=b.hp<=4?.92:1.25;
        if(this.record.visitStars.length){
          this.record.visitStars=[];this.persist();
        }
        b.marked=[clamp(p.x,45,1055),clamp(p.x+135*sign(570-p.x),45,1055)];
        const warnings={roots:'树根要扫过来了，跳！',fruit:'看地上的星圈，小心落果。',vines:'藤蔓在脚下松土，走出紫色光圈。',summon:'听！树冠里传来了别的铃音。'};
        this.say('露米 · '+warnings[b.move],2);
      }
    }
    for(const h of this.hazards){
      h.t+=dt;if(h.kind==='wave'){h.x+=h.v*dt;if(Math.abs(p.x-h.x)<29&&p.y>374)this.hurt(false);}
      if(h.kind==='fruit'){h.v+=430*dt;h.y=Math.min(404,h.y+h.v*dt);if(Math.hypot(h.x-p.x,h.y-(p.y-22))<36)this.hurt(false);}
      if(h.kind==='vine'&&h.t>.16&&Math.abs(h.x-p.x)<31&&p.y>316)this.hurt(false);
    }
    this.hazards=this.hazards.filter(h=>h.t<h.life&&h.x>0);
  }
  complete(){
    this.finishDash();
    const i=this.index;this.record.cleared=true;this.data.unlocked=Math.max(this.data.unlocked,Math.min(3,i+1));
    if(i!==3)this.record.best=this.rating(i);
    this.data.resume=Math.min(3,i+1);this.scene=i===3?'ending':'clear';this.events.push('clear');this.persist();
  }
  rating(i){
    const r=this.data.records[i];if(!r.cleared)return '—';if(i===3)return '★';
    const rare=levels[i].creatures.find(c=>species[c[0]].rare);
    const current=grade(r.stars.length,levels[i].stars.length,r.chests.length,levels[i].chests.length,rare&&this.data.book.includes(rare[0]));
    return ranks.indexOf(r.best)>ranks.indexOf(current)?r.best:current;
  }
}
module.exports={Game,profile,clamp,dashRules};

},
"interface": function(require,module,exports){
'use strict';
const {levels,species,abilities}=require('./levels');
const {dashRules}=require('./game');
const {touchHud}=require('./touch-hud');
const {heavyTime,superTime}=require('./motion');
const kirbyFX=require('./kirby-fx');
const frames=require('./art');
const {standard,menuFrame,topButtons}=require('./viewport');
const {box,line,oval,glow,star,label,wrap,sprite,icon,horizon,terrain,world,drawLumi,serif,sans}=require('./paint');
const gold='#f4d28a',cream='#fff2d1',ink='#32273e',panel='rgba(42,34,59,.94)';
function button(c,items,id,x,y,w,h,title,primary=false,small=false){
  const fill=primary?gold:'rgba(55,46,71,.91)',border=primary?'#ffedbd':'#9c859b';
  box(c,x,y,w,h,h/2,fill,border);label(c,title,x+w/2,y+h/2+1,small?14:17,primary?ink:cream,'center',undefined,primary?700:500);
  items.push({id,x,y,w,h});
}
function iconButton(c,items,id,x,y,which,title,w=40,h=36){
  box(c,x,y,w,h,12,'rgba(43,36,60,.82)','rgba(246,224,185,.55)');icon(c,which,x+w/2,y+h/2,Math.min(24,h*.5),cream);items.push({id,x,y,w,h,label:title});
}
function cover(c,g,img,hot){
 const t=g.clock;
 sprite(c,img.atlas,'groveTree',943,414,235,1,.006*Math.sin(t));
 terrain(c,img.atlas,[478,411,535,172],'meadow',t);
 oval(c,708,413,23,4,'rgba(48,33,53,.25)');
 const hero=t%3.45>3.31?'noneBlink':'none0';
 sprite(c,img.atlas,hero,708,412,139*frames[hero][3]/frames.none0[3],1,.008*Math.sin(t));
 const fox=t%4.2>2.9?'ember3':'ember0';
 sprite(c,img.atlas,fox,838,413,frames[fox][3]*.51,-1);
 sprite(c,img.atlas,'flower',547,415,52,1,.022*Math.sin(t));
 const bird='plume'+[0,1,2,1][Math.floor(t*7)%4];
 sprite(c,img.atlas,bird,843,246+Math.sin(t*1.3)*6,frames[bird][3]*.43,-1);
 drawLumi(c,img.atlas,777,303+2*Math.sin(t),t,1,.49);
 const titleX=75;line(c,[titleX,110,109,110],gold,1.1);star(c,120,110,5,gold);label(c,'BRIGHT  ESCAPE',136,110,19,gold,'left',serif,600);
 label(c,'星铃奇旅',titleX,187,68,cream,'left',serif,700);
 label(c,'第一章  ·  晨曦浮岛',titleX+4,253,22,'#ffe2bb','left',serif,600);
 wrap(c,'星铃停响的清晨，阿洛听见了一只小兽的回音。',titleX+4,298,382,16,'#f6e6df',24);
 button(c,hot,g.data.records[3].cleared?'map':'start',79,355,180,46,g.data.records[3].cleared?'重游晨曦浮岛':g.data.records.some(r=>r.stars.length||r.gate||r.cleared)||g.data.forms.length?'继续冒险':'踏上旅程',true);
 button(c,hot,'book',271,355,126,46,'旅行手记');
 button(c,hot,'map',79,417,105,33,'浮岛地图',false,true);
 iconButton(c,hot,'sound',890,29,g.data.muted?'silent':'sound','声音');
 label(c,'A JOURNEY BEYOND THE STARS',78,501,12,'#e6cda8','left',serif);
}
function hud(c,g,img,hot,v,input){
 const a=v.safe,cx=(a.left+a.right)/2,top=a.top;
 c.save();c.translate(a.left,top);
 box(c,19,19,207,45,18,'rgba(38,33,56,.86)','rgba(249,226,181,.57)');
 const p=g.player,hpPop=g.hpPulse>0?1+.22*Math.sin(g.hpPulse/.36*Math.PI):1;
 for(let i=0;i<3;i++)icon(c,'heart',41+i*24,41,21*(i<p.hp?hpPop:1),i<p.hp?'#ff9c97':'#75657e');
 line(c,[108,32,108,51],'#a08b9d');
 if(p.form==='none')sprite(c,img.atlas,'starPalm0',129,55,30);
 else sprite(c,img.atlas,p.form+'Wisp',129,52,24);
 label(c,abilities[p.form].name,145,42,15,cream);icon(c,'right',211,41,12,cream);
 hot.push({id:'abilityBook',x:a.left+109,y:top+16,w:117,h:51,label:'切换属性'});
 const stPop=g.starPulse>0?1+.34*Math.sin(g.starPulse/.32*Math.PI):1;
 box(c,235,16,104,52,15,'rgba(38,33,56,.86)',g.starPulse>0?'#ffe58a':'rgba(249,226,181,.46)');
 star(c,251,32,7*stPop,gold,g.starPulse*4,5);
 label(c,g.level.stars.length?'收集 '+g.record.stars.length+'/'+g.level.stars.length:'守铃古庭',263,33,13,cream);
 const energyColor=p.dash>0?'#a4eddb':g.dashReady?'#ffe49a':'#ecdbbf';
 label(c,'星能 ×'+g.data.dashStars,245,50,12,energyColor);
 if(p.dash>0)label(c,p.dash.toFixed(1)+'秒',331,50,11,energyColor,'right');
 box(c,245,59,84,4,2,'#6d5c72');
 if(g.dashFraction>0)box(c,245,59,84*g.dashFraction,4,2,energyColor);
 if(p.charging&&p.charge>.04){
  const pct=Math.min(1,p.charge/superTime),sup=p.charge>=superTime,hvy=p.charge>=heavyTime;
  const barCol=sup?(p.form==='none'?'#ffc36b':'#ff9ee6'):hvy?'#fff4a6':abilities[p.form].color;
  box(c,19,70,207,10,5,'rgba(32,26,48,.86)',barCol);
  box(c,21,72,Math.max(4,203*pct),6,3,barCol);
  line(c,[21+203*(heavyTime/superTime),70,21+203*(heavyTime/superTime),80],'#fff8d6',1.6);
 }
 if(g.combo>=2){
  const fever=g.combo>=3,pop=1+(g.comboFlash>0?.22*Math.sin(g.comboFlash/.28*Math.PI):0);
  const cy=p.charging&&p.charge>.04?100:86;
  c.save();c.translate(105,cy);c.scale(pop,pop);
  box(c,-86,-16,172,32,14,fever?'rgba(78,34,76,.92)':'rgba(44,34,64,.88)',fever?'#ff9ee6':'#ffe48c');
  star(c,-68,-1,7,fever?'#ff9ee6':'#ffe68a',g.time*4,5);
  label(c,g.combo+(fever?' HIT · 星光狂热':' HIT 连击'),-54,-1,13,fever?'#ffd4f5':'#fff3b8','left',sans,700);
  box(c,-74,10,148*Math.max(0,Math.min(1,g.comboTimer/4.2)),3,1.5,fever?'#ff9ee6':'#ffe68a');
  c.restore();
 }
 c.restore();
 const buttons=topButtons(v,g.touch);
 iconButton(c,hot,'book',buttons.x,buttons.y,'book','手记',buttons.size,buttons.height);
 iconButton(c,hot,'pause',buttons.x+buttons.size+buttons.gap,buttons.y,'pause','暂停',buttons.size,buttons.height);
 c.save();c.translate(cx-480,top);
 if(g.boss){const b=g.boss;box(c,340,20,282,50,13,panel);label(c,b.stage==='weak'?'铃心显现':'沉睡的树灵',481,35,15,cream,'center',serif,600);box(c,358,51,246,5,2,'#67576b');if(b.hp>0)box(c,358,51,246*b.hp/b.max,5,2,b.stage==='weak'?'#ffe87d':'#d8a77f');}
 else {box(c,410,23,140,29,14,'rgba(55,42,68,.82)');const name=g.areaName;
  label(c,name+(name==='晚钟台'?'  '+g.record.bells.length+' / 2':''),480,38,16,cream,'center',serif,600);}
 c.restore();
 let hint=g.hint.time>0?g.hint.text:'';
 if(!g.bellsReady&&p.x>g.level.bellCrossing-180){
  const next=g.level.bells.find((_,i)=>!g.record.bells.includes(i));
  hint='铃桥在等'+next[2]+'。向左回到铃塔旁，按'+(g.touch?'共鸣':' J')+'敲响它。';
 }
 if(g.index===0&&p.x>123&&p.x<330&&p.y>320&&!g.record.stars.includes(1)&&(!hint||hint===g.level.story))
  hint=g.touch?'点跳跃上草台，空中可再跳一次。3 星起可冲刺，多吃就多跑。':'按空格上草台，空中可再跳一次。3 星起按 L 冲刺，多吃就多跑。';
 if(!hint&&!g.gate&&g.level.gate&&Math.abs(p.x-g.level.gate.x)<270)hint=g.level.guide;
 const passage=g.level.passages?.find(a=>!g.gateOpen(a)&&Math.abs(a.x-p.x)<215);
 if(passage)hint={fire:'借附近炎绒的绯焰，向藤门发射火焰。',wind:'借附近云羽的流羽，向风标发射风刃。',stone:'借附近苔咚的苔岩，站在裂壁所在的地面蓄力震地。'}[passage.type];
 if(!hint&&g.index===0&&p.x<360)hint=g.touch?'靠近前方的炎绒，长按共鸣借来绯焰。':'靠近前方的炎绒，长按 J 共鸣借来绯焰。';
 if(p.dash>0)hint='';
 if(hint){
  c.font='500 15px '+sans;const textWidth=Math.ceil(c.measureText(hint).width);
  const ww=Math.min(a.right-a.left-36,690,Math.max(g.touch?533:592,textWidth+62)),xx=cx-ww/2,yy=g.touch?top+77:a.bottom-90;
  box(c,xx,yy,ww,51,13,'rgba(42,34,56,.85)','rgba(228,210,183,.46)');star(c,xx+23,yy+25,8,'#ffdb86');
  wrap(c,hint,xx+42,yy+(textWidth>ww-60?16:25),ww-60,15,'#fff2db',20);
 }
 if(g.touch)touchHud(c,hot,g,img,v,input);
 else{box(c,cx-316,a.bottom-33,632,27,13,'rgba(40,35,56,.76)');label(c,p.dash>0?'冲刺中　 A D 转向　 空格 跳跃　 冲击波自动击飞沿途敌人':'A D 移动   空格 跳跃   J 共鸣/吸星   K 攻击/蓄力   L 冲刺（'+dashRules.minimumStars+' 星起）   Q/E 换装   I 手记   Esc 暂停',cx,a.bottom-19,12.5,'#fff4dc','center');}
 kirbyFX.formBanner(c,g,v);
}
function backdrop(c,img,g,title,sub){
 box(c,80,41,800,458,19,'rgba(42,33,57,.94)','#a58b92');line(c,[109,111,851,111],'rgba(243,211,155,.45)');
 label(c,sub,117,72,13,gold,'left',serif,600);label(c,title,116,95,27,cream,'left',serif,700);
}
function journal(c,g,img,hot){
 const page=g.bookPage;backdrop(c,img,g,'旅行手记',page?'群岛观察录':'星铃能力谱');
 button(c,hot,'back',760,62,88,32,'返回',false,true);
 button(c,hot,'forms',116,125,115,32,'复制能力',page===0,true);button(c,hot,'species',239,125,115,32,'魔法生物',page===1,true);
 if(!page){const forms=g.availableForms;forms.forEach((k,i)=>{const x=115+(i+(3-forms.length)/2)*247,seen=g.data.forms.includes(k),a=abilities[k];
  const worn=g.player.form===k;
  box(c,x,175,231,275,12,'#3e344c',worn?a.color:'#655a6e');c.save();c.globalAlpha=seen?1:.37;sprite(c,img.atlas,k+'0',x+114,285,85);c.restore();
  label(c,seen?a.name:'未共鸣',x+115,315,24,seen?a.color:'#c7b9c1','center',serif,600);
  wrap(c,seen?a.note:{fire:'在炎绒或露灯蛾旁长按共鸣。',wind:'在蘑菇飞飞、云羽或云纱蛾下方长按共鸣。',stone:'靠近睡眠刺球、苔咚或墨月蛾，长按共鸣。'}[k],x+19,346,192,15,'#e7d9d2',21);
  if(worn)label(c,'已装备',x+115,419,15,a.color,'center');
  else if(seen&&g.player.dash>0)label(c,'冲刺中',x+115,419,15,'#b4a8b3','center');
  else if(seen){button(c,hot,'wear-'+k,x+47,397,137,40,'装备'+a.name,true,true);Object.assign(hot[hot.length-1],{x,y:175,w:231,h:275});}
 });
 if(g.player.form==='none')label(c,'旅行装 · '+abilities.none.note,480,471,14,cream,'center');
 else if(g.player.dash<=0)button(c,hot,'wear-none',550,122,169,36,'换回旅行装',false,true);}
 else{Object.keys(species).forEach((k,i)=>{const a=species[k],seen=g.data.book.includes(k),x=115+(i%3)*247,y=171+Math.floor(i/3)*89;
  box(c,x,y,232,78,10,'#40354e','#62566b');c.save();c.globalAlpha=seen?1:.22;sprite(c,img.atlas,a.rare?'moth':k,x+38,y+60,k==='elder'?48:37);c.restore();label(c,seen?a.name:'未发现',x+73,y+24,16,seen?a.color:'#c0b3c2');wrap(c,seen?a.note:'还有一页等着被填满。',x+73,y+44,151,12,'#e4d6d6',15);});}
}
function mapScreen(c,g,img,hot){
 backdrop(c,img,g,'晨曦浮岛','第一章  /  群岛航记');button(c,hot,'back',759,62,90,32,'返回',false,true);
 levels.forEach((l,i)=>{const x=111+i*188,y=204+(i%2)*20,open=i<=g.data.unlocked,r=g.data.records[i];
 if(i<3)line(c,[x+78,y+29,x+187,y+29+(i%2?-20:20)],'#88768b',2);c.save();c.globalAlpha=open?1:.35;
 sprite(c,img.atlas,i===3?'elder':'island',x+82,y+52,i===3?74:65);c.restore();star(c,x+82,y-36,7,open?gold:'#77687e');label(c,l.name,x+82,324,21,open?cream:'#b0a3b3','center',serif,600);
 label(c,r.cleared?'已探索  ·  '+g.rating(i):open?'已抵达':'待发现',x+82,356,14,open?gold:'#a797a9','center');
 if(open)button(c,hot,'level'+i,x+26,394,112,34,r.cleared?'重游':'启程',false,true);});
}
function modal(c,g,img,hot){
 const sc=g.scene;if(sc==='book'){journal(c,g,img,hot);return;}if(sc==='map'){mapScreen(c,g,img,hot);return;}
 box(c,268,65,424,410,19,panel,'#c8ad86');star(c,480,101,11,gold,0,5);
 let title='',desc='',actions=[];
 if(sc==='pause'){title='歇一歇';desc=g.level.name+'  ·  '+abilities[g.player.form].name;actions=[['resume','继续冒险'],['book','旅行手记'],['sound',g.data.muted?'打开声音':'关闭声音'],['title','回到标题']];}
 else if(sc==='retry'){title='再听一次铃声';desc='露米守着回声灯，等阿洛重新出发。';actions=[['retry','从回声灯出发'],['title','回到标题']];}
 else if(sc==='clear'){title=g.level.name+' · 探索完成';desc='星星 '+g.record.stars.length+' / '+g.level.stars.length+'     铃匣 '+g.record.chests.length+' / '+g.level.chests.length+'     评级 '+g.rating(g.index);actions=[['next','前往'+levels[g.index+1].name],['map','浮岛地图'],['title','回到标题']];}
 else{title='树灵醒来了';desc='古树把第一枚星铃碎片放进阿洛掌心。枝头开出花，云海那边响起了第二声铃。';actions=[['map','重游晨曦浮岛'],['book','翻开旅行手记'],['title','回到标题']];}
 label(c,title,480,146,30,cream,'center',serif,700);if(sc==='ending'){wrap(c,desc,480,185,336,16,'#e9d8d4',22,'center');label(c,'星铃碎片   1 / 5',480,241,16,gold,'center');}
 else wrap(c,desc,480,194,320,16,'#f1dfd1',24,'center');
 const start=actions.length===4?241:sc==='ending'?271:254;actions.forEach(([id,title],i)=>button(c,hot,id,371,start+i*47,218,37,title,i===0,true));
}
function draw(c,g,imgs,v=standard,input){
 const hot=[];c.save();c.lineJoin='round';c.lineCap='round';
 if(g.scene==='play'){world(c,g,imgs,v);hud(c,g,imgs,hot,v,input);}
 else{
  const title=g.scene==='title',book=g.scene==='book'||g.scene==='map';
  if(title||book)horizon(c,title?{sky:imgs.sky}:imgs,g.clock,book?60:0,g.level.tint,v);
  else world(c,g,imgs,v);
  if(title){
   const grad=c.createLinearGradient(0,200,v.width*.92,260);grad.addColorStop(0,'rgba(26,27,61,.85)');grad.addColorStop(.59,'rgba(48,36,74,.53)');grad.addColorStop(1,'rgba(59,41,72,0)');c.fillStyle=grad;
  }else c.fillStyle=book?'rgba(27,23,48,.66)':'rgba(28,22,45,.6)';
  c.fillRect(0,v.top,v.width,v.height);
  const frame=menuFrame(v);c.save();c.translate(frame.x,frame.y);c.scale(frame.k,frame.k);
  if(title)cover(c,g,imgs,hot);else modal(c,g,imgs,hot);c.restore();
  for(const b of hot){b.x=frame.x+b.x*frame.k;b.y=frame.y+b.y*frame.k;b.w*=frame.k;b.h*=frame.k;}
 }
 c.restore();return hot;
}
module.exports={draw};

},
"kirby-fx": function(require,module,exports){
'use strict';
const {glint}=require('./power-fx');
const {abilities}=require('./levels');
const {wash,streak,twinkle}=require('./light');
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const sans='system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
const serif='Georgia,"Songti SC","STSong","Noto Serif CJK SC","SimSun","Microsoft YaHei",serif';

const themes={
  none:{rgb:'255,216,118',mid:'206,138,255',core:'#fff9d6',ink:'#57367d',hex:'#ffe09a'},
  fire:{rgb:'255,124,48',mid:'255,204,76',core:'#fff7be',ink:'#8a2538',hex:'#ff9969'},
  wind:{rgb:'76,238,204',mid:'174,255,220',core:'#f0fff6',ink:'#146072',hex:'#91eee1'},
  stone:{rgb:'152,242,158',mid:'240,196,94',core:'#faffd0',ink:'#4a543c',hex:'#e8c68b'}
};
const rgba=(rgb,a)=>'rgba('+rgb+','+clamp(a)+')';

function glow(c,x,y,r,rgb,alpha,aspect=1){
  if(r<=1||alpha<=.003)return;
  c.save();c.translate(x,y);c.scale(1,aspect);
  const g=c.createRadialGradient(0,0,0,0,0,r);
  g.addColorStop(0,rgba(rgb,alpha));g.addColorStop(.38,rgba(rgb,alpha*.55));g.addColorStop(1,rgba(rgb,0));
  c.fillStyle=g;c.fillRect(-r,-r,r*2,r*2);c.restore();
}

function starburst(c,x,y,outer,inner,points,rot,fill,stroke,lineWidth=2){
  c.save();c.translate(x,y);c.rotate(rot);c.beginPath();
  for(let i=0;i<points*2;i++){
    const a=i*Math.PI/points,r=i%2?inner:outer*(.88+.12*Math.sin(i*3.1));
    const xx=Math.cos(a)*r,yy=Math.sin(a)*r;
    if(!i)c.moveTo(xx,yy);else c.lineTo(xx,yy);
  }
  c.closePath();
  if(fill){c.fillStyle=fill;c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=lineWidth;c.stroke();}
  c.restore();
}

function anamorphicFlare(c,x,y,width,height,rgb,alpha){
  if(alpha<=.005||width<=2)return;
  c.save();c.globalCompositeOperation='lighter';c.translate(x,y);
  const g=c.createLinearGradient(-width,0,width,0);
  g.addColorStop(0,rgba(rgb,0));g.addColorStop(.35,rgba(rgb,alpha*.65));
  g.addColorStop(.5,'rgba(255,253,234,'+alpha+')');
  g.addColorStop(.65,rgba(rgb,alpha*.65));g.addColorStop(1,rgba(rgb,0));
  c.fillStyle=g;c.beginPath();c.ellipse(0,0,width,height,0,0,TAU);c.fill();
  c.restore();
}

function atmosphere(c,g,v){
  const theme=g.level.tint,t=g.time,cam=g.camera;
  c.save();
  if(theme==='meadow'||theme==='grove'){
    // Soft diagonal sunbeams & drifting blossom petals
    c.save();c.globalCompositeOperation='screen';
    for(let i=0;i<4;i++){
      const span=v.width+360;
      const sx=((i*310-cam*.22+Math.sin(t*.25+i)*26)%span+span)%span-160;
      const w=62+i*18,alpha=(theme==='grove'?.075:.095)*(.72+.28*Math.sin(t*.7+i*1.7));
      const grad=c.createLinearGradient(sx,v.top,sx+120,v.bottom);
      grad.addColorStop(0,'rgba(255,242,190,'+alpha+')');
      grad.addColorStop(.65,'rgba(255,222,165,'+(alpha*.45)+')');
      grad.addColorStop(1,'rgba(255,214,155,0)');
      c.fillStyle=grad;c.beginPath();
      c.moveTo(sx,v.top);c.lineTo(sx+w,v.top);c.lineTo(sx+w+150,v.bottom);c.lineTo(sx+110,v.bottom);
      c.closePath();c.fill();
    }
    c.restore();
    for(let i=0;i<14;i++){
      const span=v.width+100;
      const px=((i*113-t*(18+i%4*5)-cam*.52)%span+span)%span-50;
      const py=((i*89+t*(10+i%3*4)+Math.sin(t*1.6+i)*18)%v.height)+v.top;
      c.save();c.translate(px,py);c.rotate(t*1.4+i*2.1);
      c.globalAlpha=.36+.30*Math.sin(t*2.2+i);
      c.fillStyle=i%3===0?'#ffe59e':i%3===1?'#ffd0e4':'#fff6cf';
      c.beginPath();c.ellipse(0,0,4.2,2.1,0,0,TAU);c.fill();c.restore();
    }
  }else if(theme==='sky'){
    for(let i=0;i<10;i++){
      const span=v.width+260;
      const sx=((i*197+t*(85+i%3*35)-cam*.45)%span+span)%span-180;
      const sy=v.top+55+(i*67)%(v.height-120)+Math.sin(t*2+i)*8;
      const len=70+i%4*32;
      c.globalAlpha=.18+.18*Math.sin(t*2.6+i);
      c.strokeStyle=i%2?'#d6fff4':'#fff5d6';c.lineWidth=1.8;
      c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(sx+len*.5,sy-8,sx+len,sy-2);c.stroke();
    }
  }else if(theme==='mine'){
    c.save();c.globalCompositeOperation='lighter';
    for(let i=0;i<18;i++){
      const span=v.width+80;
      const px=((i*97-cam*.48+Math.sin(t*.7+i)*14)%span+span)%span-40;
      const py=v.bottom-((i*73+t*(14+i%4*5))%v.height);
      const pulse=.32+.45*(.5+.5*Math.sin(t*2.6+i*1.9));
      glow(c,px,py,7+i%3*4,i%2?'134,249,198':'208,162,255',pulse*.55);
      glint(c,px,py,2.2+i%3,t+i,i%2?'#d8ffef':'#f2dbff');
    }
    c.restore();
  }
  c.restore();
}

function waterfallMist(c,x,y,w,h,t){
  c.save();
  const base=y+h-6;
  for(let i=0;i<4;i++){
    const phase=(t*2.2+i*.25)%1,spread=(i-1.5)*w*.55+Math.sin(t*5+i)*5;
    const rad=(w*.65+10)*(.45+.75*Math.sin(phase*Math.PI));
    c.globalAlpha=.42*(1-phase);
    c.fillStyle='#e8fffd';
    c.beginPath();c.arc(x+spread,base-phase*16,rad,0,TAU);c.fill();
  }
  c.restore();
}

function chestBeam(c,x,y,age){
  if(age<0||age>1.35)return;
  const u=age/1.35,open=ease(age/.18),fade=1-smooth((u-.32)/.68);
  c.save();c.globalCompositeOperation='lighter';c.globalAlpha=fade;
  const w=(24+48*open)*(1-.35*u);
  const grad=c.createLinearGradient(x,y-14,x,y-290);
  grad.addColorStop(0,'rgba(255,244,178,.85)');grad.addColorStop(.5,'rgba(255,208,118,.42)');grad.addColorStop(1,'rgba(255,190,130,0)');
  c.fillStyle=grad;c.beginPath();
  c.moveTo(x-w*.55,y-12);c.lineTo(x+w*.55,y-12);c.lineTo(x+w*1.35,y-290);c.lineTo(x-w*1.35,y-290);
  c.closePath();c.fill();
  for(let i=0;i<6;i++){
    const sy=y-26-((age*150+i*42)%210),sx=x+Math.sin(age*7+i*2.1)*(12+i*4);
    glint(c,sx,sy,4+i%3*2.2,age*4+i,'#fff9d0');
  }
  c.restore();
}

function lumiTrail(c,g){
  const pts=g.lumiTrail;if(!pts||pts.length<3)return;
  const fever=g.combo>=3;
  for(let i=2;i<pts.length;i+=2){
    const u=i/(pts.length-1);
    streak(c,pts[i-2],pts[i],2+u*(fever?5:3.5),fever?'#ffc2af':'#ffeaa0',u*(fever?.79:.56));
  }
  if(fever){
    const tip=pts[pts.length-1];twinkle(c,tip.x,tip.y,10+3*Math.sin(g.time*9),g.time,'#fff8c4',.85);
  }
}
function rings(c,g){
  for(const r of g.rings){
    const u=clamp(r.age/r.life),rad=r.r0+(r.r1-r.r0)*ease(u),fade=1-u;
    if(r.color===abilities.fire.color){
      wash(c,r.x,r.y,rad*1.22,rad*r.aspect*1.22,r.tilt,'#ff9138',.62*fade,'heat');
      wash(c,r.x,r.y,rad*.78,rad*r.aspect*.78,r.tilt,r.rim,.50*fade);continue;
    }
    wash(c,r.x,r.y,rad,rad*r.aspect,r.tilt,r.color,.64*fade,'shell');
    if(r.double){
      wash(c,r.x,r.y,rad*.78,rad*r.aspect*.78,r.tilt,r.rim,.34*fade,'shell');
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2+u*2.4,dx=Math.cos(a)*rad*.9,dy=Math.sin(a)*rad*r.aspect*.9;
        twinkle(c,r.x+dx*Math.cos(r.tilt)-dy*Math.sin(r.tilt),r.y+dx*Math.sin(r.tilt)+dy*Math.cos(r.tilt),
          (4+r.width)*fade,a,r.rim,.8*fade);
      }
    }
  }
}
function counterStars(c,g,stamp,img){
  if(!g.counterStars.length)return;
  c.save();
  for(const s of g.counterStars){
    const path=s.path;
    if(path.length>1){
      for(let i=2;i<path.length;i+=2){
        const u=i/(path.length-1);
        streak(c,path[i-2],path[i],4+u*6,'#ffcd90',.66*u);
      }
    }

    c.save();c.globalCompositeOperation='lighter';
    glow(c,s.x,s.y,36,'255,222,120',.82);
    starburst(c,s.x,s.y,22,10,5,s.age*14,'#fff8c6','#ff9ee6',2.2);
    c.restore();
    stamp(c,img,'lootStar'+Math.floor(g.time*16)%4,s.x,s.y,28,1,s.age*12);
  }
  c.restore();
}

function recoilJuice(c,r,u,col){
  if(r.age<r.freeze){
    const k=1-r.age/r.freeze,radius=r.heavy?31:21;
    for(let i=0;i<3;i++){
      const a=2.22+i*.74,dx=Math.cos(a)*r.dir,dy=Math.sin(a),dist=radius+6+3*k;
      wash(c,r.x+dx*dist,r.y-18+dy*dist,9+5*k,3.8,Math.atan2(dy,dx),col,.55+.3*k);
    }
    twinkle(c,r.x-r.dir*radius,r.y-27,13+4*k,-.23,'#fff0a9',.89);
  }else if(u<.85){
    const x=r.curX-r.dir*25,y=r.curY-17;
    wash(c,x,y,24,6,-r.dir*.13,col,.54*(1-u));
    twinkle(c,x-r.dir*9,y-5,6*(1-u),r.age,'#ffe988',.74);
  }
}

function popups(c,g,v){
  if(!g.popups.length)return;
  const minX=v?g.camera+98:-Infinity,maxX=v?g.camera+v.width-98:Infinity;
  c.save();c.textAlign='center';c.textBaseline='middle';
  for(const q of g.popups){
    if(q.whileCharging&&!g.player.charging)continue;
    const u=clamp(q.age/q.life);
    const pop=u<.16?.45+1.05*ease(u/.16):u<.32?1.50-.50*((u-.16)/.16):1;
    const fade=1-smooth((u-.62)/.38);
    const px=clamp(q.x,minX,maxX);
    c.save();c.translate(px,q.y);c.scale(pop*q.scale,pop*q.scale);c.globalAlpha=fade;
    c.font='800 17px '+sans;c.lineJoin='round';
    c.strokeStyle=q.rim;c.lineWidth=5;c.strokeText(q.text,0,0);
    c.fillStyle=q.color;c.fillText(q.text,0,0);
    c.restore();
  }
  c.restore();
}

function actionLines(c,g,v){
  const p=g.player,t=g.time;
  let strength=0,color='#fff4c6',fx=p.x-g.camera,fy=p.y-34;
  if(p.castSuper&&p.attack>0){strength=Math.max(strength,.78*(p.attack/.38));color=themes[p.form].hex;}
  if(p.dash>0&&p.form!=='fire'){strength=Math.max(strength,.46*clamp(p.dash/.08));color=themes[p.form].hex;}
  if(p.slam){strength=Math.max(strength,p.slamSuper?.72:.44);color=themes.stone.hex;}
  if(g.bossHit>0){strength=Math.max(strength,.68*(g.bossHit/.34));color='#ffe88e';fx=g.boss.x-g.camera;fy=g.boss.y-92;}
  if(g.kick&&g.kick.amplitude>=5.5){const u=1-g.kick.age/g.kick.life;strength=Math.max(strength,.52*u);fx=g.kick.x-g.camera;fy=g.kick.y;}
  if(strength<=.02)return;
  const cx=clamp(fx,v.width*.28,v.width*.72),cy=clamp(fy,v.top+110,v.bottom-110);
  const outer=Math.hypot(v.width,v.height)*.85;
  c.save();c.globalCompositeOperation='lighter';
  const count=15;
  for(let i=0;i<count;i++){
    const a=i*TAU/count+.035*Math.sin(i*7+t*2.8);
    const dist=outer*(.67+.08*Math.sin(i*7.3+t*4.2));
    wash(c,cx+Math.cos(a)*dist,cy+Math.sin(a)*dist,outer*.20,4+(i%3)*2,a,color,strength*(i%3?.25:.38));
  }
  c.restore();
}

function screenFlashes(c,g,v){
  if(!g.flashes.length)return;
  let peak=0,color='';
  for(const fl of g.flashes){
    const u=clamp(fl.age/fl.life),alpha=fl.alpha*(1-u)*(1-u);
    if(alpha>peak){peak=alpha;color=fl.color;}
  }
  if(peak>.003){c.save();c.globalAlpha=Math.min(.12,peak*.42);c.fillStyle=color;c.fillRect(0,v.top,v.width,v.height);c.restore();}
}

function formBanner(c,g,v){
  const b=g.formBanner;if(!b)return;
  const u=clamp(b.age/b.life),enter=ease(b.age/.18),exit=1-smooth((u-.72)/.28);
  const cx=(v.safe.left+v.safe.right)/2,y=v.safe.top+86-16*(1-enter);
  const sc=(.72+.28*enter)*(.92+.08*exit),text='✦  '+b.name+'  ✦';
  c.save();c.translate(cx,y);c.scale(sc,sc);c.globalAlpha=exit;
  // Ribbon banner with glowing accent
  const w=178,h=34;
  c.fillStyle='rgba(36,27,56,.92)';c.strokeStyle=b.color;c.lineWidth=2.4;
  c.beginPath();c.moveTo(-w/2+12,-h/2);c.lineTo(w/2-12,-h/2);c.lineTo(w/2,0);c.lineTo(w/2-12,h/2);
  c.lineTo(-w/2+12,h/2);c.lineTo(-w/2,0);c.closePath();c.fill();c.stroke();
  c.font='700 18px '+serif;c.textAlign='center';c.textBaseline='middle';
  c.fillStyle=b.color;c.fillText(text,0,1);
  glint(c,-w/2+4,0,7*exit,g.time*4,'#fff8cc');glint(c,w/2-4,0,7*exit,-g.time*4,'#fff8cc');
  c.restore();
}

module.exports={
  themes,glow,starburst,anamorphicFlare,atmosphere,waterfallMist,chestBeam,
  lumiTrail,rings,
  counterStars,recoilJuice,popups,actionLines,screenFlashes,formBanner
};

},
"levels": function(require,module,exports){
'use strict';

// All coordinates are world pixels. Platforms are [left, top, width, thickness].
// Spawn, monster and pickup positions use feet or object centers as documented.
const abilities = {
  none: {name:'旅行装', color:'#ffd479', note:'点按发射星弹，蓄满放出三颗流星。星爆能引回星章，攒三颗就能踏星冲刺。'},
  fire: {name:'绯焰', color:'#ff9969', note:'按住攻击举起火焰，蓄满松手放出凤凰。冲刺时骑乘凤凰，冲击波自动击败沿途敌人。'},
  wind: {name:'流羽', color:'#91eee1', note:'长蓄卷出三连苍穹飓风，平时按住跳跃可滑翔，冲刺中由冲击波迎敌。'},
  stone: {name:'苔岩', color:'#e8c68b', note:'长蓄裂出五道星陨晶柱，空中震地碎敌，岩盾弹反。'}
};
const species = {
  ember: {name:'炎绒', skill:'fire', color:'#ff9969', note:'打喷嚏会冒火星。摇动星铃时，它会主动靠近。'},
  plume: {name:'云羽', skill:'wind', color:'#96efe2', note:'迎着上升气流打盹。羽冠会告诉你风的方向。'},
  moss: {name:'苔咚', skill:'stone', color:'#e1cc9b', note:'走三步便要缩起肩膀，听听地底的回声。'},
  burr: {name:'睡眠刺球', skill:'stone', hostile:true, color:'#dcabf4', note:'蜷身滚动时石壳很硬，冲过头后会停下来喘气。'},
  cap: {name:'蘑菇飞飞', skill:'wind', hostile:true, color:'#ffafbd', note:'菌伞兜着上升的风。它收伞俯冲，再张翼刹住。'},
  dew: {name:'露灯蛾', skill:'fire', rare:true, color:'#fff3a2', note:'铃草坡高处的金色翅粉带着绯焰，能暖满三颗心。'},
  veil: {name:'云纱蛾', skill:'wind', rare:true, color:'#a3fbf3', note:'云渡高枝间的翅粉带着流羽，能暖满三颗心。'},
  ink: {name:'墨月蛾', skill:'stone', rare:true, color:'#d7baff', note:'矿廊深处的翅粉带着苔岩，能暖满三颗心。'},
  elder: {name:'沉睡的树灵', color:'#fbcf80', note:'替它唤醒胸前的铃心，它便会重新守护浮岛。'}
};
const levels = [
  require('./meadow'),
  {id:'skyway', name:'云羽渡', region:'晨曦浮岛', tint:'sky', width:2080, spawn:[90,394], exit:1975, checkpoint:[1275,380],
   title:'在风停下之前', story:'断桥那边，一只青色小鸟贴着风沿飞行。它经过的地方，云海浮起了银色的纹路。',
   guide:'寻找云羽。用风刃让停转的风标再次转动。', platforms:[[0,403,650,145],[1040,388,460,165],[1560,398,520,160],[204,315,158,38],[398,244,126,34],[1230,275,175,45],[1485,212,150,42]],
   trees:[[1421,388,141,-1]],falls:[[591,403,13,150],[1466,388,9,129]],
   gate:{type:'wind',x:559,y:403,label:'眠风标'}, stream:[630,1060], springs:[[1210,388]], creatures:[['plume',392,349],['cap',1150,301],['burr',1723,398],['veil',1560,195]],
   stars:[[143,361],[280,278],[485,346],[685,295],[800,258],[922,258],[1047,299],[1335,245],[1507,177],[1770,354]], chest:[1550,212]},
  {id:'mine', name:'苔钟矿廊', region:'晨曦浮岛', tint:'mine', width:2080, spawn:[86,394], exit:1988, checkpoint:[1115,345],
   title:'石壁另一面的铃声', story:'露米照出了岩壁上的旧裂纹。墙后的微光一明一灭，像有谁在回话。',
   guide:'与苔咚共鸣，靠近裂壁蓄力攻击，松开震地。', platforms:[[0,405,738,152],[792,393,340,152],[1190,332,225,55],[1510,345,230,58],[1760,386,320,158],[1132,468,660,80],[1320,410,135,30],[214,313,159,40],[410,241,126,36]],
   gate:{type:'stone',x:641,y:405,label:'回声裂壁'}, springs:[[1740,468]], creatures:[['moss',423,405],['burr',906,393],['cap',1535,280],['ink',1490,453]],
   stars:[[142,359],[274,278],[532,356],[760,300],[999,349],[1178,302],[1290,428],[1390,393],[1570,434],[1855,339]], chest:[1575,468]},
  {id:'grove', name:'守铃古庭', region:'晨曦浮岛', tint:'grove', width:1100, spawn:[95,405], exit:1000, checkpoint:null,
   title:'第一枚星铃碎片', story:'胸口的碎片把古树困在噩梦里。等它招式结束，击中亮起的铃心，叫醒这位老朋友。',
   guide:'树灵收招时，靠近攻击发亮的铃心。', platforms:[[0,408,1100,157]], gate:null,springs:[],creatures:[['ember',260,408]],stars:[],energyStars:[[180,376],[366,376],[530,376]],chest:null}
];
for(const level of levels){
  require('./chapter-paths').extendChapter(level);
  level.chests=level.chest?[level.chest,...(level.extraChests||[])]:[];
  level.checkpoints=level.checkpoint?[level.checkpoint,...(level.extraCheckpoints||[])]:[];
}
module.exports={abilities,species,levels};

},
"light": function(require,module,exports){
'use strict';
// Unit-space gradients can be reused at any size, also on the WeChat 2D canvas.
const ramps=new WeakMap();
const falloffs={
  cloud:[[0,1],[.22,.83],[.51,.38],[.78,.08],[1,0]],
  heat:[[0,.34],[.29,.31],[.53,.39],[.70,.61],[.80,.66],[.89,.43],[.96,.10],[1,0]],
  shell:[[0,0],[.54,0],[.73,.19],[.84,.70],[.89,1],[.94,.54],[1,0]]
};
function ramp(c,color,shape){
  let cache=ramps.get(c);if(!cache){cache=new Map();ramps.set(c,cache);}
  const key=shape+color;if(cache.has(key))return cache.get(key);
  const gradient=c.createRadialGradient(0,0,0,0,0,1);
  const rgb=parseInt(color.slice(1),16),channels=[rgb>>16,(rgb>>8)&255,rgb&255].join(',');
  for(const [stop,alpha] of falloffs[shape])gradient.addColorStop(stop,'rgba('+channels+','+alpha+')');
  cache.set(key,gradient);return gradient;
}
function wash(c,x,y,rx,ry,tilt,color,alpha,shape='cloud'){
  if(alpha<.005||rx<.1||ry<.1)return;
  c.save();c.translate(x,y);c.rotate(tilt);c.scale(rx,ry);c.globalAlpha*=alpha;
  c.fillStyle=ramp(c,color,shape);c.fillRect(-1,-1,2,2);c.restore();
}
function streak(c,from,to,width,color,alpha){
  const dx=to.x-from.x,dy=to.y-from.y;
  wash(c,(to.x+from.x)/2,(to.y+from.y)/2,Math.hypot(dx,dy)*.59,width,Math.atan2(dy,dx),color,alpha);
}
function ribbonRamp(c,colors){
  let cache=ramps.get(c);if(!cache){cache=new Map();ramps.set(c,cache);}
  const key='ribbon'+colors.join('');if(cache.has(key))return cache.get(key);
  const g=c.createLinearGradient(0,-1,0,1);
  for(const [u,index,alpha] of [[0,1,0],[.15,1,.18],[.32,1,.72],[.43,2,.93],[.50,3,1],[.59,2,.93],[.73,1,.70],[.88,1,.15],[1,1,0]]){
    const rgb=parseInt(colors[index].slice(1),16);
    g.addColorStop(u,'rgba('+[rgb>>16,(rgb>>8)&255,rgb&255,alpha].join(',')+')');
  }
  cache.set(key,g);return g;
}
// Consecutive sections share their end vertices so banked trails stay joined through a jump.
function ribbon(c,points,colors){
  if(points.length<2)return;
  const normals=points.map((p,i)=>{
    const a=points[i-1]||p,b=points[i+1]||p,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    return {x:-dy/len*p.width,y:dx/len*p.width};
  });
  const gradient=ribbonRamp(c,colors);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<.45)continue;
    const tx=dx/len,ty=dy/len,r=Math.max(.5,(a.width+b.width)*.5);
    const n=normals[i-1],m=normals[i];
    const ax=(tx*n.x+ty*n.y)/len,ay=(-ty*n.x+tx*n.y)/r;
    const bx=(tx*m.x+ty*m.y)/len,by=(-ty*m.x+tx*m.y)/r;
    c.save();c.transform(dx,dy,-ty*r,tx*r,a.x,a.y);
    c.globalAlpha*=(a.alpha+b.alpha)*.5;c.fillStyle=gradient;
    const overlap=Math.min(.08,.65/len);
    c.beginPath();c.moveTo(-ax-overlap,-ay);c.lineTo(1-bx+overlap,-by);c.lineTo(1+bx+overlap,by);c.lineTo(ax-overlap,ay);c.closePath();c.fill();c.restore();
  }
}
function twinkle(c,x,y,r,tilt,color,alpha){
  if(r<1||alpha<.015)return;
  wash(c,x,y,r,r,0,color,.48*alpha);
  wash(c,x,y,r,r*.13,tilt,color,alpha);
  wash(c,x,y,r*.18,r*1.18,tilt,'#fffada',alpha);
  wash(c,x,y,r*.26,r*.26,0,'#fffff1',alpha);
}
module.exports={wash,streak,twinkle,ribbon};

},
"meadow": function(require,module,exports){
'use strict';

// The first nine star slots, the first chest and the first lamp belong to existing saves.
module.exports={
  id:'meadow',elements:['fire'],name:'铃草坡',region:'晨曦浮岛',tint:'meadow',width:7500,spawn:[88,399],exit:7380,
  title:'一阵带着焦糖味的风',story:'露米在草叶间亮了一下。前方那团会打喷嚏的小火苗，好像听得懂铃声。',
  guide:'靠近炎绒，面向它长按共鸣。',
  areas:[[0,'铃草坡'],[1750,'摇铃果园','树冠上的星章通向铃匣。果树下的炎绒鼓起腮时，小心火种。'],
    [3740,'水车瀑桥','沿水车上方的草台往上跳。紫色孢子会落在地面的光斑里。'],
    [5900,'晚钟台','山脊有东西两座钟。在钟塔旁举起星铃共鸣，通往萤溪的铃桥就会亮起。']],
  platforms:[
    [0,402,690,145],[740,402,450,145],[1250,388,365,160],[1665,405,360,150],
    [230,316,166,38],[430,242,134,36],[606,182,108,32],[1195,276,165,45],[1415,220,150,46],
    [2084,404,590,149],[2735,421,567,143],[3358,404,358,152],
    [1965,323,145,38],[2160,261,155,38],[2370,203,200,47],[2605,263,152,40],[2820,326,160,38],
    [3780,412,462,148],[4302,389,240,123],[4610,355,243,132],[4926,392,490,141],[5480,407,446,145],
    [3910,323,150,40],[4090,256,150,39],[4290,194,166,42],[4490,235,152,38],[4675,185,180,45],[4890,252,154,39],
    [5990,405,490,149],[6535,402,540,149],[7135,399,365,150],
    [5760,327,145,39],[6010,305,170,42],[6260,337,145,36],[6740,320,147,39],[6940,315,175,42]
  ],
  trees:[[582,402,192,1],[1777,405,148,-1],[3170,421,157,-1],[3830,412,133,1],[5360,392,163,-1],[6150,405,140,1]],
  landmarks:[['orchardTree',2128,404,207,1],['orchardTree',2960,421,179,-1],['millWheel',4144,412,182,1],
    ['millWheel',5050,392,128,-1],['orchardTree',5705,407,135,1]],
  falls:[[135,402,15,145],[1350,388,10,115],[2420,203,9,118],[3998,412,24,174],[4232,256,14,152],[4531,389,18,170],[4795,355,14,199],[5530,407,10,146]],
  gate:{type:'fire',x:841,y:402,label:'枯藤拱门'},springs:[[1158,402],[1985,405],[3860,412],[5826,407]],
  checkpoint:[1120,389],extraCheckpoints:[[3490,404],[5780,407]],
  checkpointHints:['露米守在弹跳花旁。花上的高台通向露灯蛾的铃匣。','果园的灯还亮着。瀑布后面还有一条通往水车上方的路。',
    '跟着山脊的星章往右，在晚钟台敲响东西两座钟。'],
  chest:[1490,220],extraChests:[[2482,203],[4782,185]],
  bells:[[6600,402,'西钟'],[7000,315,'东钟']],
  creatures:[
    ['burr',258,402],['ember',497,402],['cap',1378,322],['dew',1490,207],
    ['burr',1825,405],['ember',2255,404,'cinder'],['burr',2560,404,'bound'],['ember',2490,203],
    ['cap',2894,319,'spores'],['burr',3152,421],['ember',3588,404],
    ['cap',4020,294],['ember',4220,412,'cinder'],['cap',4510,170,'spores'],['burr',4725,355,'bound'],
    ['ember',4975,252],['cap',5250,299],['ember',5545,407,'cinder'],
    ['burr',6198,405,'bound'],['cap',6368,292,'spores'],['burr',6772,402],['ember',6875,402,'cinder'],['cap',7188,293]
  ],
  stars:[
    [152,360],[303,284],[616,355],[719,300],[1018,356],[1216,241],[1373,207],[1554,324],[1765,361],
    [496,209],[662,148],[2020,286],[2228,223],[2398,167],[2660,228],[2860,288],[3028,386],[3270,378],
    [3475,366],[3692,362],[3974,287],[4144,221],[4360,158],[4536,200],[4715,150],[4965,218],
    [5150,354],[5363,354],[5622,365],[5818,291],[6080,268],[6318,302],[6660,361],[6787,285],[6949,277],[7250,358]
  ],
  supplies:[
    ['berry',558,373],['ward',1705,373],['berry',2173,228],['ward',2635,374],['berry',2973,389],
    ['berry',3900,380],['ward',4350,359],['ward',4590,205],['berry',4770,324],['berry',5210,362],
    ['ward',5900,374],['berry',6285,371],['ward',6845,288],['berry',7088,282]
  ]
};

},
"motion": function(require,module,exports){
'use strict';
const frames = require('./art');
const wandTips = require('./art-points');
const {castShape,visibleWand}=require('./actor-pose');
const travel=require('./art-travel');
const run = ['Toe', '1', '2', 'Pass', 'Swing', 'Stride'];
const stepLength = 1.03;
const heavyTime = .42, superTime = .84, heroHeight=70;
const wrapPhase=n=>n-Math.floor(n);
const cycleFrame=phase=>Math.min(travel.count-1,Math.floor(wrapPhase(phase)*travel.count));
function advanceTravel(p,dx,dt,heldDescent){
  p.gliding=heldDescent&&!p.ground&&p.vy>0&&p.form==='wind'&&!p.slam;
  p.glideTime=p.gliding?p.glideTime+dt:0;
  const speed=Math.abs(dx)/dt,weight=p.ground?Math.min(1,speed/70):0;
  p.stepWeight+=Math.max(-dt*12,Math.min(dt*12,weight-p.stepWeight));
  if(!p.ground)return;
  const lockedFace=p.attack>0?p.castFace:p.bell?p.bellFace:p.charging?p.face:0;
  const stride=64+Math.min(1,speed/250)*25;
  p.stride=wrapPhase(p.stride+(lockedFace?dx*lockedFace:Math.abs(dx))/stride);
}
function frameHeight(id){return frames[id][3]*(travel.frames[id]?travel.scale:heroHeight/frames.none0[3]);}

function heroFrame(p, scene, time=0) {
  let pose;
  if (p.hit > .20) pose = 'Fall';
  else if (scene === 'clear' || scene === 'ending') pose = '4';
  else if (p.slam) pose = 'Surge';
  else if (p.attack > 0) {
    const remaining=p.attack/(p.castHeavy?.38:.23);
    pose=p.castHeavy&&remaining<.9&&remaining>.66?'Follow':remaining>.69?'4':remaining>.43?'Recoil':'Recover';
  }else if (p.charging) pose = p.charge<.095?'Draw':p.charge<.19?'Gather':p.charge<.31?'Brace':p.charge<heavyTime?'Ready':'Surge';
  else if (p.dash>0&&!p.bell) pose=p.ground?run[Math.floor(p.walk/stepLength)%run.length]:(p.vy<0?'3':'Fall');
  else if (p.bell) pose = !p.pull?'4':p.pull<.10?'Draw':p.pull<.23?'Gather':p.pull<.43?'4':'Ready';
  else if (p.formTime>0) pose=p.formTime>.52?'Ready':p.formTime>.28?'Surge':p.formTime>.13?'Recoil':'Recover';
  else if (!p.ground) {
    if(p.gliding)pose='Glide'+cycleFrame(p.glideTime/.78);
    else if(p.launch>.035)pose='Launch';
    else if(p.vy < -150)pose='3';
    else if(p.vy < 110)pose='Crest';
    else pose=p.vy<350?'Fall':'Reach';
  }
  else if (p.land > .10) pose = 'Land';
  else if (p.land > .025) pose = 'Rise';
  else if (p.brake>0) pose='Brake';
  else if (p.stepWeight>.12) pose='Walk'+cycleFrame(p.stride);
  else pose = time%3.45>3.31?'Blink':'0';
  return p.form + pose;
}

const neutralShape=[1,1,0];
function wandPoint(p, frameId, facing, size) {
  if(!wandTips[frameId])frameId=p.form+'4';
  const tip = wandTips[frameId];
  const [sx,sy,shear]=size===undefined?castShape(p,frameId):neutralShape;
  const scale = (size??1)*heroHeight / frames.none0[3];
  return {x:p.x+facing*sx*(tip[0]-shear*tip[1])*scale,y:p.y+1-sy*tip[1]*scale};
}
function bellTip(p){
  const face=p.bellFace||p.face,id=heroFrame(p,'play');
  return visibleWand(p,face,wandPoint(p,wandTips[id]?id:p.form+'4',face));
}

const walks={
  ember:['0','Leap','1','Plant','2','0'],moss:['Weight','0','1','Plant','2','1'],
  burr:['Skid','1','Push','1'],plume:['Lift','0','Bank','2','Glide','1','Brake','3'],
  moth:['Edge','Up','Peel','1','Bank','Wide','2','Fold','Bud','0']
};
function creatureFrame(m) {
  const clock=m.clock+m.seed,k=m.kind;
  if(k==='ember'||k==='moss'){
    if(m.pull||m.state==='drawn')return k+(k==='ember'?'Listen':'Hear');
    if(m.pattern==='cinder'&&m.state==='windup')return k+(m.elapsed<.22?'Sniff':m.timer<.17?'Plant':'Listen');
    if(m.pattern==='cinder'&&m.state==='rest')return k+(m.elapsed<.16?'Leap':m.elapsed<.38?'Plant':'0');
    if(m.state==='rejoin')return k+(k==='ember'?'Plant':'Weight');
    if(m.state==='listen')return k+(m.timer>.32?(k==='ember'?'Sniff':'Curl'):(k==='ember'?'Listen':'Hear'));
    const loop=walks[k];return k+loop[Math.floor(m.stride/(k==='ember'?5.3:3.8))%loop.length];
  }
  if(k==='burr'){
    if(m.pull||m.state==='drawn')return k+(m.pull>.46?'Wheel':'Tuck');
    if(m.state==='windup')return k+(m.elapsed<.22?'Wake':m.timer<.14?'Push':'Tuck');
    if(m.state==='bound')return k+(m.elapsed<.12?'Push':m.timer<.11?'Skid':'Wheel');
    if(m.state==='warn')return k+(m.timer>.69?'Wake':m.timer>.49?'Yawn':m.timer>.29?'1':'Tuck');
    if(m.state==='roll')return k+(m.elapsed<.11?'Push':m.timer<.10?'Skid':m.elapsed<.22?'2':'Wheel');
    if(m.state==='rest')return k+(m.elapsed<.13?'Skid':'Dazed');
    if(m.state==='rejoin')return k+'Skid';
    if(m.state==='return'||m.state==='homeward')return k+walks.burr[Math.floor(m.stride/5.5)%4];
    return k+(m.state==='settle'&&m.elapsed<.17?'Wake':'0');
  }
  if(k==='cap'){
    if(m.pull||m.state==='drawn')return k+(m.pull>.50?'Parachute':m.pull>.20?'Up':'Brake');
    if(m.state==='windup')return k+(m.elapsed<.19?'Brake':m.timer<.19?'Down':'Parachute');
    if(m.state==='warn')return k+(m.timer>.4?'1':m.timer>.2?'Up':'Aim');
    if(m.state==='dive')return k+(m.elapsed<.16?'2':m.timer<.10?'Brake':'Spear');
    if(m.state==='rest')return k+'Parachute';
    if(m.state==='return')return k+(m.elapsed<.2?'Brake':m.timer<.18?'Hover':Math.floor(m.elapsed*9)%2?'Up':'Down');
    const flap=['Hover','Up','0','Down'];return k+flap[Math.floor(clock*8)%4];
  }
  if(k==='plume'&&(m.state==='drawn'||m.state==='rejoin'))return k+'Brake';
  const air=k==='plume'?k:'moth',loop=walks[air];
  return air+loop[Math.floor(clock*(m.pull?16:10))%loop.length];
}
function creatureAngle(m,id){
  if(id==='burr2'||id==='burrWheel')return m.stride/16;
  return m.kind==='cap'&&m.state==='idle'?Math.sin(m.clock*3)*.065:0;
}
function elderFrame(b) {
  if(b.friend)return 'elderLift';
  if(b.stage==='weak')return b.timer<.46?'elderLift':b.elapsed<.45||b.timer<1.10?'elder2':'elderHeart';
  if(b.stage==='active'){
    if(b.move==='fruit')return b.elapsed<.28?'elderCrown':b.timer<.45?'elderLift':'elder0';
    if(b.move==='summon')return b.elapsed<.32?'elderCrown':'elder0';
    if(b.move==='vines')return b.elapsed<.32?'elderBrace':'elder1';
    return b.elapsed<.12?'elderSweep':b.elapsed<.56?'elderReach':b.timer<.38?'elderSweep':'elder1';
  }
  return b.elapsed<.14?'elder':b.elapsed<.40?'elderCoil':b.timer<.26?'elder0':b.move==='fruit'?'elderCrown':'elderBrace';
}
function flightFrame(kind,age){
  return kind+['Bolt','FlyA','FlyB','FlyA'][Math.floor(age/.055)%4];
}
function impactFrame(kind,progress){
  return kind+(progress<.13?'Pin':progress<.34?'Impact':progress<.67?'Bloom':'Fleck');
}
function fireFlameFrame(t){return 'firePalm'+Math.floor(t*20)%16;}
module.exports = {fireFlameFrame,heavyTime,superTime,heroHeight,frameHeight,advanceTravel,cycleFrame,heroFrame,castShape,wandPoint,bellTip,creatureFrame,creatureAngle,elderFrame,flightFrame,impactFrame};

},
"nova": function(require,module,exports){
'use strict';
const frames=require('./art');
const {glint,colors}=require('./power-fx');
const {wash,streak}=require('./light');
const {bloomAxes,bloomTime}=require('./spell-range');
const starMagic=require('./star-magic');
const tau=2*Math.PI,clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>1-Math.pow(1-clamp(n),3);
const palette={
 none:{ink:'90,55,156',body:'189,116,255',rim:'255,213,101',hot:'#fff8cc',size:1},
 fire:{ink:'139,47,42',body:'255,88,25',rim:'255,191,48',hot:'#fff5b3',size:1.09},
 wind:{ink:'17,99,111',body:'46,223,188',rim:'179,255,203',hot:'#f1fff3',size:1.03},
 stone:{ink:'82,63,68',body:'229,150,70',rim:'134,249,190',hot:'#fff0bc',size:1.06}
};
const rgba=(rgb,a)=>'rgba('+rgb+','+a+')';
const particleLimit=260;
function randomFor(seed){
 let s=seed>>>0;
 return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
function addParticle(g,p){
 if(g.sparks.length>=particleLimit)g.sparks.shift();
 g.sparks.push(p);
}
function scatter(g,f){
 if(f.type==='fade')return;
 const rnd=randomFor(f.seed),muzzle=f.type==='release',earth=f.type==='ground',end=f.type==='terminal',sup=!!f.super;
 const count=f.kind==='none'?(muzzle?6:sup?17:f.heavy?13:9):
  muzzle?(sup?12:f.heavy?10:7):sup?(end?28:38):f.heavy?(end?22:28):16;
 for(let i=0;i<count;i++){
  const shape=i%7===0?'Cloud':i%3===0?'Streak':i%3===1?'Shard':'ember';
  const a=muzzle?(f.face<0?Math.PI:0)+(rnd()-.5)*2.35:earth?-Math.PI*(.045+.91*rnd()):tau*(i+rnd()*.84)/count;
  const strength=(muzzle?.74:end?.82:1)*(sup?1.28:f.heavy?1.08:.64);
  const speed=(shape==='Cloud'?95+125*rnd():195+445*rnd())*strength;
  const start=shape==='Cloud'&&!muzzle?sizeOf(f)*(.22+.27*rnd()):(muzzle?4:10)+rnd()*(sup?26:f.heavy?20:9);
  const gravity=shape==='Cloud'?-58:f.kind==='stone'?425:f.kind==='fire'?110:f.kind==='wind'?36:164;
  const delay=shape==='Cloud'&&!muzzle?.05+.11*rnd():rnd()*.032;
  addParticle(g,{kind:f.kind,shape,x:f.x+Math.cos(a)*start,y:f.y+Math.sin(a)*start-(earth?8:0),
   vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-(earth?32:0)-(shape==='Cloud'&&f.kind==='fire'?58:0),gravity,drag:shape==='Cloud'?1.9:shape==='Streak'?2.25:1.45,
   age:-delay,life:(shape==='Cloud'?.74+.42*rnd():.38+.50*rnd())*(sup?1.18:f.heavy?1.04:.82),
   angle:a,spin:(rnd()-.5)*(shape==='Shard'?14:3.5),size:(shape==='Cloud'?32+26*rnd():shape==='Streak'?13+10*rnd():shape==='Shard'?10+12*rnd():3.8+4.8*rnd())*(sup?1.24:f.heavy?1.08:.76)});
 }
}
// Emit along the distance the head actually travelled, including curved launches and low refresh rates.
function trace(g,s,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(!d)return;
 const step=s.kind==='none'?(s.auxiliary?44:32):s.heavy?17:22,angle=Math.atan2(dy,dx),nx=-dy/d,ny=dx/d;
 let next=step-s.trailDistance;
 while(next<=d){
  const u=next/d,n=++s.trailIndex,wave=Math.sin(n*2.399),spread=(s.heavy?14:8)*wave;
  addParticle(g,{kind:s.kind,shape:n%4===0?'Shard':n%2?'ember':'Streak',
   x:a.x+dx*u+nx*spread,y:a.y+dy*u+ny*spread,vx:-dx/d*34+nx*wave*45,vy:-dy/d*34+ny*wave*45,
   age:0,life:.34+(n%4)*.065,drag:1.6,gravity:s.kind==='fire'?-58:55,angle,spin:wave*2.2,size:(s.heavy?6:4)+n%4});
  next+=step;
 }
 s.trailDistance=d+step-next;
}
function advance(g,dt){
 let used=0;
 for(const p of g.sparks){
  const old=p.age;p.age+=dt;if(p.age>=p.life)continue;
  if(p.age>0){
   const step=Math.min(dt,p.age-Math.max(0,old)),drag=Math.exp(-p.drag*step);
   p.x+=p.vx*step;p.y+=p.vy*step;p.vx*=drag;p.vy=p.vy*drag+p.gravity*step;p.angle+=p.spin*step;
  }
  g.sparks[used++]=p;
 }
 g.sparks.length=used;
}
function halo(c,x,y,r,rgb,opacity,aspect=1){
 if(r<=1||opacity<=.004)return;
 c.save();c.translate(x,y);c.scale(1,aspect);
 const glow=c.createRadialGradient(0,0,0,0,0,r);
 glow.addColorStop(0,rgba(rgb,opacity));glow.addColorStop(.28,rgba(rgb,opacity*.76));
 glow.addColorStop(.66,rgba(rgb,opacity*.26));glow.addColorStop(1,rgba(rgb,0));
 c.fillStyle=glow;c.fillRect(-r,-r,r*2,r*2);c.restore();
}
function sizeOf(f){
 const base=f.type==='ground'?276:f.type==='terminal'?(f.heavy?182:84):f.heavy?264:118;
 const scale=f.super?1.36:1;
 return base*scale*palette[f.kind].size;
}
function exposure(c,g,v){
 let winner,strength=0;
 for(const f of g.spellEffects){
  if(f.kind==='none'||!f.heavy||!['impact','ground','terminal'].includes(f.type)||f.x<g.camera-50||f.x>g.camera+v.width+50)continue;
  const attack=ease((f.age+.012)/.065),fall=1-ease((f.age-.06)/.38);
  const light=attack*fall*(f.type==='terminal'?.56:1);
  if(light>strength){strength=light;winner=f;}
 }
 if(strength<=.01)return;
 const col=palette[winner.kind],x=winner.x,y=winner.y-(winner.type==='ground'?55:0);
 c.save();c.globalCompositeOperation='screen';
 halo(c,x,y,Math.min(v.width*.43,375),col.body,.14*strength,.72);
 halo(c,x,y,130,col.rim,.12*strength,.48);c.restore();
}
function front(c,x,y,rx,ry,tilt,kind,opacity){
 const col=colors[kind];
 if(kind==='fire'){
  wash(c,x,y,rx*1.11,ry*1.11,tilt,col[1],.37*opacity,'heat');
  wash(c,x,y,rx*1.04,ry*1.04,tilt,col[2],.43*opacity,'heat');return;
 }
 wash(c,x,y,rx,ry,tilt,col[2],.60*opacity,'shell');
 wash(c,x,y,rx*.98,ry*.98,tilt,col[3],.28*opacity,'shell');
}

function rays(c,x,y,r,f,u){
 c.save();c.translate(x,y);c.scale(1,f.type==='ground'?.71:.83);
 const count=f.heavy?12:7;
 for(let i=0;i<count;i++){
  const a=i*tau/count+Math.sin(f.seed%13+i*5)*.12,s=Math.sin(a),co=Math.cos(a);
  const outer=r*(.78+.20*Math.sin(i*13+1)),inner=outer*(.20+.42*u);
  const dist=(inner+outer)/2;
  wash(c,co*dist,s*dist,(outer-inner)*.61,(f.heavy?8:5)*(1-u*.65),a,colors[f.kind][2],.62*(1-u));
 }
 c.restore();
}

function blast(c,stamp,img,f){
 const col=palette[f.kind],r=sizeOf(f),t=f.age,earth=f.type==='ground',end=f.type==='terminal';
 const total=f.life,open=ease(t/(f.heavy?.23:.145)),fade=1-clamp((t-total*.46)/(total*.54));
 const y=f.y-(earth?6:0),x=f.x;
 c.save();
 halo(c,x,y-(earth?r*.13:0),r*(.18+.80*open),col.body,(f.heavy?.22:.17)*fade,earth?.53:.74);
 if(f.field){
  const [rx,ry]=bloomAxes(f),opacity=1-clamp((t-bloomTime)/.26);
  // Keep the brightest part of the feathered front on the actual contact ellipse.
  front(c,x,y,rx/.89,ry/.89,0,f.kind,opacity);
 }

 // Each front travels independently. The white-hot leader separates from the colored, slower shell.
 const first=f.heavy?.44:.32,n=f.field||earth?0:1;
 for(let i=0;i<n;i++){
  const u=(t-i*(f.heavy?.081:.052))/first;if(u<0||u>=1)continue;
  const a=1-u,dist=r*((.10+.93*ease(u))*(1-i*.12));
  const aspect=earth?.28:i===1?.55:.79,tilt=earth?0:f.face*(i===1?-.40:.095);
  const yy=earth?y-4-i*3:y;
  front(c,x,yy,dist,dist*aspect,tilt,f.kind,a);
 }

 const sparkTime=t/(f.heavy?.39:.25);
 if(sparkTime<1){c.save();c.globalAlpha*=.55*(1-sparkTime);rays(c,x,earth?y-r*.12:y,r*(.12+.61*ease(sparkTime)),f,sparkTime);c.restore();}
 const rooted=earth&&f.surface;
 const shell=f.kind==='stone'&&!rooted?'stoneGlow':f.kind+'Nova',rect=frames[shell];
 const peakW=earth?(f.super?216:158):r*(end?1.42:1.62);
 const shellOpen=ease(t/(f.heavy?.21:.125)),out=clamp((t-total*.23)/(total*.59));
 let width=peakW*(.13+.87*shellOpen)*(1+(earth?.09:.23)*out);
 let shellX=x;
 if(rooted){
  const [left,,span]=f.surface;width=Math.min(span*.91,width);
  shellX=Math.max(left+width/2,Math.min(left+span-width/2,x));
 }
 const anchor=rooted?.988:f.kind==='fire'?.59:.52;
 c.save();c.globalAlpha*=(earth?.40:f.heavy?.24:.21)*Math.max(0,1-out*out*(3-2*out));
 const wind=f.kind==='wind',fire=f.kind==='fire',star=f.kind==='none';
 const rotation=earth?0:wind?.14+1.60*out:star?-.16+.89*out:-.10*out;
 const lift=fire?r*(.13*open+.31*out):wind?r*.13*out:star?r*.08*out:0;
 c.translate(shellX+(earth?0:f.face*r*(wind?.20:.07)*out),rooted?f.surface[1]+1:y-lift);
 c.scale(1,earth?1+.20*Math.sin(Math.PI*shellOpen)-.63*out:fire?.83+.23*shellOpen+.18*out:wind?1.07-.25*out:1+.14*Math.sin(Math.PI*out));
 stamp(c,img,shell,0,0,width*rect[3]/rect[2],f.face,rotation,.5,anchor);
 c.restore();
 const flash=clamp(1-t/(f.super?.26:f.heavy?.21:.12));
 if(flash>0){
  c.save();c.globalCompositeOperation='lighter';
  const fy=earth?y-14:y;
  halo(c,x,fy,36+15*(1-flash),col.rim,.39*flash,.78);
  const fw=r*(f.super?.64:f.heavy?.50:.38)*(.45+.75*(1-flash)),fh=(f.super?4:f.heavy?3:2)*flash;
  wash(c,x,fy,fw,fh*2.7,0,colors[f.kind][2],.73*flash);
  wash(c,x,fy,fw*.57,fh*1.23,0,'#fffbe2',.80*flash);
  glint(c,x,fy,10+14*(1-flash),f.face*.28,rgba('255,253,228',flash));
  glint(c,x,fy,7+8*(1-flash),f.face*.28+Math.PI/4,rgba(col.rim,flash*.9));
  c.restore();
 }
 c.restore();
}
function wake(c,path,kind,heavy,clock,opacity=1){
 if(path.length<2||opacity<=0)return;
 const col=colors[kind],count=path.length-1,half=heavy?23:11;
 for(const side of [-1,1]){
  let prev=path[0];
  for(let i=1;i<=Math.min(5,count);i++){
   const index=Math.round(i*count/Math.min(5,count)),u=index/count,p=path[index];
   const q=path[index-1],dx=p.x-q.x,dy=p.y-q.y,len=Math.hypot(dx,dy)||1;
   const spread=side*half*Math.sin(u*7-clock*13+side*.8)*Math.sin(Math.PI*u);
   const tip={x:p.x-dy/len*spread,y:p.y+dx/len*spread};
   streak(c,prev,tip,heavy?7:4,col[2],.53*opacity*u);prev=tip;
  }
 }
}

function head(c,s){
 const col=palette[s.kind],r=s.super?104:s.heavy?78:42;
 halo(c,s.x,s.y,r,col.body,s.super?.48:.38,.68);
 c.save();c.globalCompositeOperation='lighter';
 halo(c,s.x,s.y,r*.40,col.rim,.34,.62);
 glint(c,s.x,s.y,s.super?28:s.heavy?18:9,s.age*12,col.hot);
 c.restore();
}
function paintParticles(c,stamp,img,g,clouds){
 for(const p of g.sparks){
  if((p.shape==='Cloud')!==clouds||p.age<0||p.x<g.camera-60||p.x>g.camera+g.viewWidth+60)continue;
  const u=clamp(p.age/p.life),open=ease(p.age/.065),fade=1-clamp((u-.45)/.55);
  if(fade<=.01)continue;
  const col=palette[p.kind],h=p.size*(clouds?.46+1.48*ease(u):.58+.42*open)*(clouds?1:1-.40*u);
  c.save();c.globalAlpha*=open*fade*(clouds?.24:p.shape==='Shard'?.80:.86);
  if(p.kind==='none'){
   if(p.shape==='Shard')starMagic.spark(c,img,p.x,p.y,h*1.24,p.age,p.angle,.92);
   else stamp(c,img,clouds?'rushEmber1':p.shape==='ember'?'rushSpark0':'rushSpark1',p.x,p.y,h*(clouds?1.4:1.12),1,p.angle);
  }else if(p.shape==='ember'){
   const dx=p.vx*.028,dy=p.vy*.028;c.beginPath();c.moveTo(p.x-dx,p.y-dy);c.lineTo(p.x,p.y);
   c.strokeStyle=rgba(col.body,.96);c.lineWidth=h*.66;c.stroke();glint(c,p.x,p.y,h,p.angle,col.hot);
  }else if(p.shape==='Streak'&&p.size>10){
   const a=Math.atan2(p.vy,p.vx);c.translate(p.x,p.y);c.rotate(a);
   c.beginPath();c.moveTo(-h*1.45,0);c.quadraticCurveTo(-h*.4,-1.8,h*.32,0);c.quadraticCurveTo(-h*.35,1.4,-h*1.45,0);
   c.fillStyle=col.hot;c.fill();
  }else stamp(c,img,p.kind+p.shape,p.x,p.y,p.shape==='Shard'?h*.72:h,1,p.shape==='Streak'?Math.atan2(p.vy,p.vx):p.angle);
  c.restore();
 }
}
module.exports={scatter,advance,trace,blast,exposure,wake,head,paintParticles,particleLimit,sizeOf};

},
"paint": function(require,module,exports){
'use strict';
const frames=require('./art');
const detailFrames=require('./art-detail');
const powerFrames=require('./art-powers');
const rushFrames=require('./art-rush');
const travel=require('./art-travel');
const {abilities,species}=require('./levels');
const {standard}=require('./viewport');
const {heroFrame,frameHeight,castShape,creatureFrame,creatureAngle,elderFrame,wandPoint,bellTip,flightFrame,impactFrame}=require('./motion');
const powerFX=require('./power-fx');
const nova=require('./nova');
const light=require('./light');
const kirbyFX=require('./kirby-fx');
const aura=require('./attunement'),resonance=require('./resonance');
const phoenix=require('./phoenix-rush');
const starMagic=require('./star-magic');
const riding=require('./riding');
const characterLight=require('./character-light');
const {drawRegistered,visibleWand}=require('./actor-pose');
const TAU=Math.PI*2, serif='Georgia,"Songti SC","STSong","Noto Serif CJK SC","SimSun","Microsoft YaHei",serif',sans='system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
function box(c,x,y,w,h,r,fill,stroke){
  r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.lineWidth=1;c.strokeStyle=stroke;c.stroke();}
}
function line(c,pts,col,width=1){
  c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.strokeStyle=col;c.lineWidth=width;c.stroke();
}
function oval(c,x,y,rx,ry,col){
  c.save();c.translate(x,y);c.scale(Math.max(.01,rx),Math.max(.01,ry));c.beginPath();c.arc(0,0,1,0,TAU);c.fillStyle=col;c.fill();c.restore();
}
function glow(c,x,y,r,color){
  const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(255,230,174,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}
function star(c,x,y,r,col,rot=0,n=4){
  c.beginPath();for(let i=0;i<2*n;i++){const a=rot-Math.PI/2+i*Math.PI/n,rad=i%2?r*.31:r;const xx=x+Math.cos(a)*rad,yy=y+Math.sin(a)*rad;if(i)c.lineTo(xx,yy);else c.moveTo(xx,yy);}
  c.closePath();c.fillStyle=col;c.fill();
}
function label(c,txt,x,y,size=16,color='#fff1ce',align='left',family=sans,weight=500){
  c.fillStyle=color;c.font=weight+' '+size+'px '+family;c.textAlign=align;c.textBaseline='middle';c.fillText(txt,x,y);
}
function wrap(c,txt,x,y,maxWidth,size=16,color='#f8ecd8',lineH=24,align='left'){
  c.font='500 '+size+'px '+sans;let row='';for(const ch of txt){if(c.measureText(row+ch).width>maxWidth&&row){label(c,row,x,y,size,color,align);row='';y+=lineH;}row+=ch;}if(row)label(c,row,x,y,size,color,align);return y;
}
function texture(img,id){return img?.base?(travel.frames[id]?img.travel:rushFrames[id]?img.lights:powerFrames[id]?img.powers:detailFrames[id]?img.detail:img.base):img;}
function sprite(c,img,id,x,y,height,dir=1,angle=0,squeeze=1,widthScale=1,lean=0){
  const f=frames[id];if(!img||!f)return;c.save();c.translate(x,y);c.rotate(angle);c.scale(dir*widthScale,squeeze);
  if(lean)c.transform(1,0,lean,1,0,0);
  const scale=height/f[3],anchor=f[4]??f[2]/2;
  c.drawImage(texture(img,id),f[0],f[1],f[2],f[3],-anchor*scale,-height,f[2]*scale,height);c.restore();
}
function icon(c,key,x,y,s,col='#ffe9b7'){
  c.save();c.translate(x,y);c.scale(s/24,s/24);c.strokeStyle=col;c.fillStyle=col;c.lineCap='round';c.lineJoin='round';c.lineWidth=1.9;
  if(key==='bell'){c.beginPath();c.moveTo(-8,5);c.quadraticCurveTo(-5,1,-5,-4);c.bezierCurveTo(-5,-12,5,-12,5,-4);c.quadraticCurveTo(5,1,8,5);c.closePath();c.stroke();line(c,[-4,8,0,9,4,8],col,1.8);oval(c,0,-10,1.7,1.7,col);}
  else if(key==='heart'){c.beginPath();c.moveTo(0,9);c.bezierCurveTo(-17,-1,-7,-13,0,-5);c.bezierCurveTo(8,-13,16,-1,0,9);c.fill();}
  else if(key==='book'){c.beginPath();c.moveTo(0,-6);c.quadraticCurveTo(-5,-10,-10,-6);c.lineTo(-10,8);c.quadraticCurveTo(-5,4,0,8);c.quadraticCurveTo(5,4,10,8);c.lineTo(10,-6);c.quadraticCurveTo(5,-10,0,-6);c.lineTo(0,8);c.stroke();}
  else if(key==='pause'){box(c,-6,-8,4,16,1,col);box(c,2,-8,4,16,1,col);}
  else if(key==='jump'){
   const enamel=c.createLinearGradient(-3,9,3,-10);enamel.addColorStop(0,'#58abaf');enamel.addColorStop(.58,col);enamel.addColorStop(1,'#fff9cf');
   c.beginPath();c.moveTo(-10,9);c.bezierCurveTo(-3,7,1,2,1,-3);c.lineTo(-3,-3);
   c.quadraticCurveTo(-4,-3,-3,-4);c.lineTo(4,-11);c.quadraticCurveTo(5,-12,6,-10);
   c.lineTo(10,-2);c.quadraticCurveTo(10,-1,9,-1);c.lineTo(5,-2);c.bezierCurveTo(3,6,-3,10,-10,9);c.closePath();
   c.fillStyle=enamel;c.fill();c.strokeStyle='#344757';c.lineWidth=1;c.stroke();
   c.beginPath();c.moveTo(-4,7);c.quadraticCurveTo(2,4,3,-2);c.strokeStyle='#f1ffda';c.lineWidth=.9;c.stroke();
  }
  else if(key==='dash'){line(c,[-11,-5,-4,-5],col,1.8);line(c,[-13,0,-5,0],col,2.2);line(c,[-10,5,-4,5],col,1.8);star(c,4,0,10,col,.25,5);}
  else if(key==='attack'){star(c,0,0,12,col,.4);}
  else if(key==='left'||key==='right'){const f=key==='left'?-1:1;line(c,[-3*f,-7,4*f,0,-3*f,7],col,3);}
  else if(key==='sound'||key==='silent'){line(c,[-9,-3,-5,-3,1,-9,1,9,-5,3,-9,3,-9,-3],col,1.9);if(key==='sound'){c.beginPath();c.arc(1,0,6,-1,1);c.stroke();}else{line(c,[5,-3,10,3],col);line(c,[5,3,10,-3],col);}}
  else star(c,0,0,10,col,0,5);
  c.restore();
}
function waterfall(c,img,x,y,width,length,t) {
 if(!img)return;
 const id='fallWater'+Math.floor(t*9+x)%4,f=frames[id];
 c.save();c.globalAlpha=.84;
 c.drawImage(texture(img,id),f[0],f[1],f[2],f[3],x-width*.96,y,width*1.92,length);c.restore();
 kirbyFX.waterfallMist(c,x,y,width,length,t);
}
function horizon(c,imgs,t,cam,theme,v=standard){
 const artW=Math.max(v.width+160,(v.height+68)*16/9),artH=artW*9/16;
 const x=-Math.max(0,Math.min(artW-v.width,cam*.135)),y=v.top-(artH-v.height)*.36;
 if(imgs.vistas){
  const col=theme==='sky'||theme==='grove'?1:0,row=theme==='mine'||theme==='grove'?1:0;
  const w=imgs.vistas.width/2,h=imgs.vistas.height/2;
  c.drawImage(imgs.vistas,col*w+2,row*h+2,w-4,h-4,x,y,artW,artH);
 }else if(imgs.sky){c.drawImage(imgs.sky,x,y,artW,artH);}
 else{const g=c.createLinearGradient(0,v.top,0,v.bottom);g.addColorStop(0,'#30235b');g.addColorStop(.6,'#efa4b4');g.addColorStop(1,'#82b6bc');c.fillStyle=g;c.fillRect(0,v.top,v.width,v.height);}
 if(!imgs.vistas&&theme==='mine'){
  const shade=c.createLinearGradient(0,0,0,540);shade.addColorStop(0,'rgba(22,17,52,.97)');shade.addColorStop(.6,'rgba(50,34,78,.86)');shade.addColorStop(1,'rgba(42,43,78,.76)');
  c.fillStyle=shade;c.fillRect(0,v.top,v.width,v.height);
 }else if(!imgs.vistas&&theme==='grove'){c.fillStyle='rgba(68,55,84,.16)';c.fillRect(0,v.top,v.width,v.height);}
 c.save();
 for(let i=0;i<17;i++){
  const span=v.width+50,x=((i*139+Math.sin(t*.26+i)*9-cam*.39)%span+span)%span-25;
  const y=83+(i*71)%306+Math.sin(t*.55+i)*4;
  c.globalAlpha=.16+.38*(.5+.5*Math.sin(t*1.4+i));star(c,x,y,i%5===0?3.5:1.4,theme==='mine'?'#a8fff2':'#fff3ca');
 }
 c.restore();
}
const surfaceStyles={meadow:'meadow',grove:'meadow',sky:'cloud',mine:'slate'};
// Measured walkable lip below flowers, reeds and mineral trim in each source crop.
const surfaceLine={meadowBank:.234,meadowShelf:.206,cloudBank:.339,cloudShelf:.318,slateBank:.119,slateShelf:.101};
function terrain(c,img,p,theme,t){
 const [x,y,w,h]=p,short=w<=220,id=surfaceStyles[theme]+(short?'Shelf':'Bank'),tile=frames[id];
 const height=h+(short?10:12),top=y-height*surfaceLine[id];
 if(img){
  const page=texture(img,id);
  const [sx,sy,sw,sh]=tile;
  if(short){
   const edge=w*.052;
   c.drawImage(page,sx,sy,sw,sh,x-edge,top,w+edge*2,height);
  }else{
   const left=Math.round(sw*.24),right=Math.round(sw*.26),center=sw-left-right;
   const capScale=Math.min(height/sh,w*.7/(left+right)),leftW=left*capScale,rightW=right*capScale;
   const midW=w-leftW-rightW,count=Math.max(1,Math.round(midW/(center*height/sh))),step=midW/count;
   c.drawImage(page,sx,sy,left,sh,x,top,leftW+.45,height);
   for(let i=0;i<count;i++){
    c.save();c.translate(x+leftW+i*step+(i%2?step:0),top);c.scale(i%2?-1:1,1);
    c.drawImage(page,sx+left,sy,center,sh,-.35,0,step+.7,height);c.restore();
   }
   c.drawImage(page,sx+sw-right,sy,right,sh,x+w-rightW-.35,top,rightW+.35,height);
  }
 }else{
  box(c,x,y,w,h,8,theme==='mine'?'#665378':'#734f78');box(c,x,y,w,9,4,'#b7cf65');
 }
 if((theme==='meadow'||theme==='grove')&&w>330){
  for(let n=65;n<w-22;n+=203){const sway=.04*Math.sin(t*1.7+n);sprite(c,img,'sprig',x+n,y+6,17+n%8,n%2?1:-1,sway);}
 }
}
function fieldObjects(c,g,imgs){
 const L=g.level,t=g.time,p=g.player;
 const visible=x=>x>g.camera-110&&x<g.camera+g.viewWidth+110;
 for(const [a,b] of L.streams||[]){if(!g.gate||a>g.camera+g.viewWidth||b<g.camera)continue;c.save();
  for(let i=0;i<7;i++){
   const u=((i*71+t*96)%(b-a))/(b-a),x=a+u*(b-a),y=292+(i%4)*25-15*u;
   c.globalAlpha=.72*Math.min(1,u*8,(1-u)*8);
   spellSprite(c,imgs.atlas,'airRibbon'+(Math.floor(t*8)+i)%4,x,y,15+i%3*3,1,-.13);
  }c.restore();
 }
 for(const a of g.gates){
  if(!visible(a.x))continue;
  const tint=abilities[a.type].color,open=g.gateOpen(a),opened=a.id?g.passageTimes[a.id]:g.openedAt;
  if(!open&&a.type==='fire')sprite(c,imgs.atlas,'dryVines',a.x,a.y+2,112);
  if(!open&&a.type==='stone')sprite(c,imgs.atlas,'crackedRock',a.x,a.y+2,85);
  if(open&&opened!=null&&a.type!=='wind')gateFragments(c,imgs.atlas,a,t-opened);
  if(a.type==='wind'){
   sprite(c,imgs.atlas,'windPost',a.x,a.y+1,83);
   const since=opened==null?t:t-opened;
   c.save();c.translate(a.x,a.y-72);c.rotate(open?-.22+3.6*(since-.22*(1-Math.exp(-since/.22))):-.22);
   sprite(c,imgs.atlas,'windRotor',0,26,52);c.restore();
  }
  if(!open&&Math.abs(a.x-p.x)<220){
   box(c,a.x-50,a.y-156,100,25,12,'rgba(40,32,57,.85)',tint);
   label(c,a.label,a.x,a.y-143,13,'#fff3de','center');
  }
 }
 L.springs.forEach(([x,y],si)=>{if(!visible(x))return;
  const bounce=g.springBounces?.get(si);
  let sy=1,sx=1;
  if(bounce){const u=clamp01(bounce.age/bounce.life);sy=1+.38*Math.sin(u*Math.PI*3.5)*(1-u);sx=1/Math.sqrt(Math.max(.55,sy));}
  sprite(c,imgs.atlas,'flower',x,y+4,44,1,Math.sin(t*2)*.04,sy,sx);
 });
 L.checkpoints.forEach(([x,y],i)=>{if(!visible(x))return;
  const ground=L.platforms.filter(q=>x>=q[0]&&x<=q[0]+q[2]).map(q=>q[1]).sort((a,b)=>Math.abs(y-a)-Math.abs(y-b))[0]??y;
  line(c,[x,ground,x,ground-63],'#725044',5);line(c,[x,ground-61,x+14,ground-65,x+18,ground-60],'#cfa65b',3);const by=ground-48;
  const lit=i<=g.record.campIndex;
  if(lit)glow(c,x+17,by,34+4*Math.sin(t*4),'rgba(255,230,151,.62)');icon(c,'bell',x+17,by,23,lit?'#ffeda2':'#f3cb79');});
 L.chests.forEach(([x,y],i)=>{if(!visible(x))return;
  const age=t-(g.chestTimes[i]??-Infinity),opened=g.record.chests.includes(i);
  const id='chest'+(!opened?0:age<.09?1:age<.23?2:3);
  if(opened&&age>=0&&age<1.35)kirbyFX.chestBeam(c,x,y,age);
  sprite(c,imgs.atlas,id,x,y+1,frames[id][3]*.42);
  if(!opened)star(c,x+8,y-31+Math.sin(t*2)*2,3.5,'#fff4b6');
 });
 (L.supplies||[]).forEach(([kind,x,y],i)=>{
  if(!visible(x)||g.usedSupplies.has(i))return;
  y+=Math.sin(t*2.6+i)*3;glow(c,x,y,22+3*Math.sin(t*4+i),kind==='ward'?'rgba(101,236,242,.58)':'rgba(255,166,145,.52)');
  spellSprite(c,imgs.atlas,kind==='berry'?'dewBerry':'wardBell',x,y,kind==='berry'?28:31,1,.07*Math.sin(t*2+i));
 });
 (L.bells||[]).forEach(([x,y,name],i)=>{
  if(!visible(x))return;
  const lit=g.record.bells.includes(i),age=t-(g.bellTimes[i]??-Infinity);
  sprite(c,imgs.atlas,'hillBelfry',x,y+1,112,1,age<.72?.08*Math.sin(age*32)*(1-age/.72):0);
  glow(c,x,y-57,lit?40+5*Math.sin(t*4):18,lit?'rgba(255,226,137,.78)':'rgba(126,226,229,.44)');
  if(age<1.1){c.save();c.globalAlpha=Math.max(0,1-age/1.1);c.strokeStyle='#ffe193';c.lineWidth=3;c.beginPath();c.arc(x,y-56,14+88*age,0,TAU);c.stroke();c.restore();}
  if(!lit&&Math.abs(x-p.x)<185){
   const msg=g.touch?name+' · 按共鸣':name+' · 按 J';box(c,x-58,y-150,116,25,12,'rgba(42,34,56,.91)','#ffe4a1');label(c,msg,x,y-137,14,'#fff1c8','center');
  }
 });
 if(L.bellCrossing&&visible(L.bellCrossing)){
  const x=L.bellCrossing,y=399;sprite(c,imgs.atlas,'hillBelfry',x,y+1,125);
  if(!g.bellsReady)for(let i=0;i<6;i++)star(c,x,y-12-i*18,3,'#ffe29e',t+i);
 }
 g.starSpots.forEach(([sx,sy],i)=>{if((!visible(sx)&&!g.pulledStars.has(i))||g.record.visitStars.includes(i))return;
  const pulled=g.pulledStars.get(i),x=pulled?pulled.x:sx,y=(pulled?pulled.y:sy)+Math.sin(t*2.4+i)*3;
  if(!visible(x))return;
  const energyOnly=i>=L.stars.length||g.record.stars.includes(i);
  pickupStar(c,imgs.atlas,x,y,t,i,energyOnly,!!pulled);
 });
 if(!g.boss&&visible(L.exit)){
  const x=L.exit,base=L.platforms.find(q=>x>=q[0]&&x<=q[0]+q[2])[1];
  if(g.exitOpen)glow(c,x,base-44,54,'rgba(126,250,238,.38)');
  c.save();c.globalAlpha=g.exitOpen?1:.53;sprite(c,imgs.atlas,'exitArch',x,base+2,103);c.restore();
  if(g.exitOpen)star(c,x+1,base-58+Math.sin(t*2)*2,5+Math.sin(t*2.4),'#ecffff');
 }
}
function pickupStar(c,img,x,y,t,index,energyOnly,pulled){
 const phase=t*3.3+index*2.39996,beat=.5+.5*Math.sin(phase);
 const flash=beat**7,height=(energyOnly?31:35)+(pulled?3:0)+2*beat;
 const gold=energyOnly?'#63eadf':'#ffb42f',pearl=energyOnly?'#d8fff1':'#fff4ac';
 light.wash(c,x,y+1,32+8*beat,28+9*beat,-.13,gold,.57);
 c.save();c.globalCompositeOperation='screen';
 light.wash(c,x,y,22+5*beat,24+5*beat,0,pearl,.64);
 light.twinkle(c,x,y,20+13*flash,-.21,pearl,.34+.53*flash);c.restore();
 const id='lootStar'+(Math.floor(t*6)+index)%4,tilt=.10*Math.sin(phase*.83);
 spellSprite(c,img,id,x,y,height,1,tilt);
 c.save();c.globalCompositeOperation='screen';c.globalAlpha*=.32+.18*beat;
 spellSprite(c,img,id,x,y,height,1,tilt);c.restore();
 // The glint catches one painted facet; the five-point silhouette stays gold at its dimmest.
 const facetX=x+height*(-.15+.10*beat),facetY=y-height*(.15+.10*beat);
 light.twinkle(c,facetX,facetY,8+14*flash,-.18,pearl,.79+.20*flash);
 powerFX.glint(c,facetX,facetY,2.8+6.2*flash,-.18,'#fffee4');
 const orbit=t*1.35+index*2.41;
 for(let i=0;i<2;i++){
  const a=orbit+i*2.68,pulse=Math.max(0,Math.cos(phase*1.3+i*2.75))**2;
  const xx=x+Math.cos(a)*(height*.52+4),yy=y+Math.sin(a)*height*.53;
  light.twinkle(c,xx,yy,4+8*pulse,a*.12,pearl,.35+.63*pulse);
  if(pulse>.08)powerFX.glint(c,xx,yy,1+5*pulse,-.13,pearl);
 }
}
function vistaProp(c,img,id,x,y,h,dir,t){
 if(id!=='skySail'&&id!=='mineWinch'){sprite(c,img,id,x,y+3,h,dir);return;}
 c.save();c.translate(x,y);c.scale(dir*h/100,h/100);
 if(id==='skySail'){
  // Stitched sail and mooring line distinguish a distant landing from a usable wind rotor.
  line(c,[-31,0,-1,-96,32,0],'#785365',1.4);line(c,[0,0,0,-99],'#51425a',4);
  line(c,[-1,-98,0,-6],'#edce9f',1.3);
  const wind=3*Math.sin(t*1.35+x);
  c.beginPath();c.moveTo(2,-91);c.bezierCurveTo(12,-79,24+wind,-81,40+wind,-68);
  c.quadraticCurveTo(23,-67,9,-56);c.lineTo(2,-53);c.closePath();
  const silk=c.createLinearGradient(2,-77,42,-62);silk.addColorStop(0,'#7399a9');silk.addColorStop(.47,'#d3eee3');silk.addColorStop(1,'#deb98b');
  c.fillStyle=silk;c.fill();c.strokeStyle='#766275';c.lineWidth=1.2;c.stroke();
  line(c,[5,-85,30+wind,-69,6,-58],'#fff0c1',1);star(c,13,-70,4,'#dfb46f');
  sprite(c,img,'gems',-14,2,18);
 }else{
  // Timber trestle, hanging ore lamp and the painted pulley share the mine's slate lip.
  for(const dx of [-26,25]){
   line(c,[dx,1,dx*.62,-72],'#4e3c53',7);line(c,[dx-1,0,dx*.62-1,-72],'#b79078',2);
  }
  line(c,[-32,-69,31,-69],'#57465c',8);line(c,[-34,-72,31,-72],'#c4a18e',2);
  sprite(c,img,'millWheel',-14,-50,32);line(c,[13,-68,13,-37],'#a48e85',1.4);
  glow(c,13,-32,19,'rgba(148,251,210,.52)');sprite(c,img,'gems',13,-25,17);sprite(c,img,'gems',-27,2,26,-1);
 }
 c.restore();
}
function gateFragments(c,atlas,gate,age){
 const u=age/.54;if(!atlas||u>=1)return;
 const fire=gate.type==='fire',id=fire?'dryVines':'crackedRock',f=frames[id];
 const scale=(fire?112:85)/f[3],page=texture(atlas,id);
 c.save();c.globalAlpha=(1-u)*(1-u);
 for(let i=0;i<5;i++){
  const a=Math.floor(f[2]*i/5),b=Math.floor(f[2]*(i+1)/5),w=(b-a)*scale;
  const spread=(i-2)*u*(fire?5:12),fall=fire?-u*(17+i%2*9):u*u*64-u*(17+i%2*7);
  c.save();c.translate(gate.x+((a+b)/2-f[2]/2)*scale+spread,gate.y+2-f[3]*scale/2+fall);
  c.rotate((i-2)*u*(fire?.12:.22));c.drawImage(page,f[0]+a,f[1],b-a,f[3],-w/2,-f[3]*scale/2,w,f[3]*scale);c.restore();
 }
 c.restore();
}
const creatureScale={ember:.47,plume:.49,moss:.50,burr:.43,cap:.45,moth:.37};
// Wing tips move through a large arc. Attach flight to the breast or the mushroom stalk.
const flightPivot={
 cap0:[.55,.55],cap1:[.59,.55],cap2:[.61,.60],capAim:[.76,.59],capHover:[.55,.55],capBrake:[.67,.58],
 capUp:[.58,.59],capDown:[.57,.53],capSpear:[.75,.70],capParachute:[.67,.60],
 plume0:[.65,.57],plume1:[.69,.58],plume2:[.64,.51],plume3:[.55,.61],
 plumeLift:[.59,.61],plumeBank:[.67,.50],plumeGlide:[.62,.64],plumeBrake:[.57,.61],
 mothEdge:[.58,.48],mothPeel:[.70,.47],mothBank:[.60,.50],mothBud:[.54,.40]
};
function creatureSprite(c,img,id,family,x,y,h,face,angle=0,breath=1){
 if(id==='burrWheel'||id==='burr2'){
  spellSprite(c,img,id,x,y-h*.5,h,face,angle,.5,.5);
 }else if(family==='cap'||family==='plume'||family==='moth'){
  const [ax,ay]=flightPivot[id]||[.5,.5];
  spellSprite(c,img,id,x,y-(family==='moth'?15:20),h,face,angle,ax,ay);
 }else sprite(c,img,id,x,y,h,face,angle,breath);
}
function friends(c,g,imgs){
 for(const m of g.monsters){if(m.hidden>0||m.x<g.camera-100||m.x>g.camera+g.viewWidth+100)continue;
  const d=species[m.kind],p=g.player,id=creatureFrame(m),kind=d.rare?'moth':m.kind;
  const reveal=1-m.appear/.32;
  c.save();c.globalAlpha*=reveal;
  const shrink=resonance.smooth(m.drawIn);
  const h=frames[id][3]*creatureScale[kind]*(1-.84*shrink)*(.78+.22*reveal);
  c.globalAlpha*=1-.78*resonance.smooth((m.drawIn-.68)/.32);
  const facing=g.captured===m?-p.bellFace:m.face;
  if(d.rare)glow(c,m.x,m.y-18,27,'rgba(216,191,255,.41)');
  if((kind==='ember'||kind==='moss'||kind==='burr')&&m.pull<.1&&Math.abs(m.y-m.homeY)<3)oval(c,m.x,m.homeY+1,h*.23,2,'rgba(44,30,53,.23)');
  const breath=m.state==='idle'?1+.018*Math.sin(m.clock*3+m.seed):1;
  creatureSprite(c,imgs.atlas,id,kind,m.x,m.y,h,facing,creatureAngle(m,id),breath);
  if(m.kind==='burr'&&m.state==='idle')label(c,'z',m.x+16,m.y-h-6,13,'#fff4ef','center',serif,700);
  if(m.state==='warn')label(c,'!',m.x,m.y-h-9,18,'#fff0b0','center',serif,700);
  if(m.state==='windup'){
   if(m.pattern==='cinder'){
    const x=m.x+m.face*22,y=m.y-27;spellSprite(c,imgs.atlas,'fireWisp',x,y,13+22*m.elapsed,1,0,.5,.8);
    line(c,[x+m.face*14,y,x+m.face*(26+20*m.elapsed),y],'#ffce78',2);
   }else if(m.pattern==='bound'){
    oval(c,m.aimX,m.aimY-2,20+10*m.elapsed,4,'rgba(181,80,72,.75)');star(c,m.aimX,m.aimY-6,5,'#ffe4b2');
   }else for(const drop of m.drops){
    oval(c,drop.x,drop.y-2,16+3*Math.sin(m.elapsed*13),4,'rgba(150,72,170,.65)');
    spellSprite(c,imgs.atlas,'sporePod',m.x+(drop.x<m.x?-10:10),m.y-11,11+5*m.elapsed);
   }
  }
  if(g.nearby===m&&!p.bell&&!p.bellSpent&&g.scene==='play'&&!p.attack&&!p.charging&&!p.dash){
   const x=Math.max(g.camera+67,Math.min(g.camera+g.viewWidth-67,m.x)),y=m.y-Math.max(h,32)-24;
   box(c,x-56,y-12,112,24,12,'rgba(40,32,51,.88)',abilities[d.skill].color);
   spellSprite(c,imgs.atlas,d.skill+'Wisp',x-42,y,16);
   label(c,'共鸣 · '+abilities[d.skill].name,x+5,y+1,13,'#fff4d7','center');
  }
  c.restore();
 }
}
function struckCreatures(c,g,imgs){
 for(const r of g.recoils){
  const freeze=r.freeze??.032,u=clamp01((r.age-freeze)/(r.life-freeze));
  const family=species[r.kind].rare?'moth':r.kind,col=species[r.kind]?.color||'#ffe69c';
  const rx=r.curX,ry=r.curY;
  const jitterX=r.age<freeze?Math.sin(r.age*170)*(r.heavy?5.5:3.5):0;
  const jitterY=r.age<freeze?Math.cos(r.age*140)*(r.heavy?3.2:2):0;
  kirbyFX.recoilJuice(c,r,u,col);
  const h=frames[r.id][3]*creatureScale[family]*r.size,contact=r.age<freeze;
  const spin=r.dir*u*(r.heavy?7.45:3.6),stretch=contact?-.19:.14*Math.sin(Math.PI*u);
  c.save();c.globalAlpha=1-clamp01((u-.80)/.20);
  c.translate(rx+jitterX,ry-h*.5+jitterY);c.rotate(spin);c.scale(1-stretch,1+stretch);
  creatureSprite(c,imgs.atlas,r.id,family,0,h*.5,h*(r.heavy?1.14:1.06),r.face,r.angle);
  if(!contact&&r.heavy&&u<.76){
   for(let i=0;i<2;i++){const a=u*11+i*Math.PI;star(c,Math.cos(a)*h*.47,-h*.54+Math.sin(a)*4,3.7-i,'#fff4a2',a);}
  }
  c.restore();
 }
}
function tree(c,g,imgs){
 const b=g.boss;if(!b)return;const t=g.time,id=elderFrame(b),h=id==='elder'?205:frames[id][3]*.91;
 const hit=g.bossHit/.34,shake=Math.sin((1-hit)*29)*6*hit;
 const lean=Math.sin((1-hit)*Math.PI*1.8)*hit;
 sprite(c,imgs.atlas,id,b.x+shake,b.y+3,h,1,Math.sin(t*3)*.008+lean*.085,1-.075*lean,1+.07*lean);
 if(g.bossHit>0){
  c.save();c.globalAlpha=.84*hit;
  const x=b.x+shake;star(c,x,b.y-92,25*hit,'#fff7ba',.22);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.35,r=32+(1-hit)*40;star(c,x+Math.cos(a)*r,b.y-92+Math.sin(a)*r,5*hit,'#ffdf8b',a);}
  c.restore();
 }
 if(b.stage==='weak'||b.friend){
  glow(c,b.x,b.y-89,38+8*Math.sin(t*6),'rgba(255,231,132,.84)');
  if(b.stage==='weak'){
   c.save();c.globalCompositeOperation='lighter';
   const pulse=(t*1.8)%1;c.globalAlpha=.78*(1-pulse);c.strokeStyle='#fff4a8';c.lineWidth=3*(1-pulse)+1;
   c.beginPath();c.arc(b.x,b.y-89,14+44*pulse,0,TAU);c.stroke();c.restore();
  }
  star(c,b.x,b.y-89,11+Math.sin(t*6)*3,'#fff6bb',t*2);
 }
 if(!b.friend&&b.stage==='warn'&&(b.move==='fruit'||b.move==='vines'))for(const x of b.marked)oval(c,x,406,32+Math.sin(t*9)*2,6,b.move==='fruit'?'#f6b16b':'#cb8de2');
 for(const h of g.hazards){
  if(h.kind==='wave')sprite(c,imgs.atlas,'rootWave',h.x,410,65+Math.sin(h.t*19)*3);
  else if(h.kind==='fruit')spellSprite(c,imgs.atlas,'fallFruit',h.x,h.y,30,1,h.t*2.2);
  else {const growth=Math.min(1,h.t/.16,Math.max(0,(h.life-h.t)/.18));sprite(c,imgs.atlas,'vineThorn',h.x,410,78*growth,1,Math.sin(h.t*7)*.045);}
 }
}
// The texture anchor can sit on the bright nose of a bolt or on its central star.
function spellSprite(c,img,id,x,y,height,face=1,angle=0,anchorX=.5,anchorY=.5){
 const f=frames[id];if(!img||height<=0)return;
 const width=height*f[2]/f[3];
 c.save();c.translate(x,y);c.scale(face,1);c.rotate(angle);
 c.drawImage(texture(img,id),f[0],f[1],f[2],f[3],-anchorX*width,-anchorY*height,width,height);c.restore();
}
const lumiPivot=[[.67,.71],[.72,.59],[.72,.49],[.74,.55]];
function drawLumi(c,img,x,y,t,face,scale){
 const index=Math.floor(t*13)%4,id='lumi'+index;
 glow(c,x,y,18,'rgba(255,228,147,.42)');
 spellSprite(c,img,id,x,y,frames[id][3]*scale,face,0,...lumiPivot[index]);
}
function bodyLight(c,g,imgs){
 const p=g.player,t=g.time,id=heroFrame(p,g.scene,t);
 aura.flourish(c,spellSprite,imgs.atlas,g);aura.surroundings(c,spellSprite,imgs.atlas,g,false);
 aura.motionTrails(c,spellSprite,imgs.atlas,g);
 if(p.ward)aura.ward(c,spellSprite,imgs.atlas,p,t);
 if(p.bell)aura.tether(c,spellSprite,imgs.atlas,g,bellTip(p));
 if(p.charging)aura.palm(c,spellSprite,imgs.atlas,p,visibleWand(p,p.face,wandPoint(p,id,p.face)),t,false);
}
function hero(c,g,imgs){
 const p=g.player,t=g.time,id=heroFrame(p,g.scene,t),face=p.attack>0?p.castFace:p.bell?p.bellFace:id===p.form+'Brake'?p.brakeFace:p.face;
 const height=frameHeight(id),casting=p.bell||p.charging||p.attack>0;
 const idle=p.ground&&Math.abs(p.vx)<15&&!casting;
 const angle=!casting&&p.hit>.2?-.13*p.face:0;
 const tip=p.charging?visibleWand(p,face,wandPoint(p,id,face)):null;
 let supportY=Infinity;
 for(const [left,y,width] of g.level.platforms)if(p.x>=left&&p.x<=left+width&&y>=p.y-.1&&y<supportY)supportY=y;
 const airGap=supportY-p.y;
 if(airGap<160){const strength=1-airGap/170;oval(c,p.x,supportY+1,8+7*strength,1.5+1.9*strength,'rgba(43,37,56,'+(.10+.21*strength)+')');}
 c.save();if(p.inv>0&&Math.floor(p.inv*12)%2)c.globalAlpha=.60;
 const contact=casting||!p.ground?0:Math.max(0,(p.land-.075)/.105);
 const stretch=!casting&&!p.ground?Math.max(0,(p.launch-.05)/.07):0;
 const [sx,sy,shear]=castShape(p,id);
 const gait=p.stepWeight&&travel.frames[id]&&p.ground?p.stepWeight:0;
 const bounce=gait*(.008+.009*Math.min(1,Math.abs(p.vx)/250))*Math.cos(p.stride*Math.PI*4);
 if(!riding.draw(c,imgs.atlas,p,t)){
  const light=characterLight.source(g,tip,p.bell?bellTip(p):null);
  characterLight.draw(c,imgs,p,light,dest=>{
   if(p.dash>0&&p.form==='none'){starMagic.ride(dest,imgs.atlas,starMagic.surfPose(p,t));return;}
   if(!drawRegistered(dest,imgs,texture,p,face))sprite(dest,imgs.atlas,id,p.x,p.y+1,height,face,angle,sy*(1+bounce-.085*contact+.035*stretch+(idle?.008*Math.sin(t*2.8):0)),sx*(1+.075*contact-.023*stretch),shear-gait*.036*Math.min(1,Math.abs(p.vx)/250));
  });
 }
 c.restore();
 aura.surroundings(c,spellSprite,imgs.atlas,g,true);
 if(tip)aura.palm(c,spellSprite,imgs.atlas,p,tip,t,true);
 kirbyFX.lumiTrail(c,g);
 drawLumi(c,imgs.atlas,g.companion.x+Math.sin(t*2)*2,g.companion.y+Math.sin(t*3.1)*4,t,p.face,.34);
}
function clamp01(x){return Math.max(0,Math.min(1,x));}
const boltSize={none:16,fire:23,wind:25,stone:21};
function cometTrail(c,path,t,img,surface,height,alpha){
 if(path.length<2)return;
 const face=path[path.length-1].x>=path[0].x?1:-1;
 c.save();c.globalAlpha*=alpha;phoenix.wake(c,path,t,img,'none',face,surface,height);c.restore();
}
function effects(c,g,img,surface){
 for(const end of g.trails){
  const left=clamp01(1-(g.time-end.ended)/end.life);
  const tail=end.path.slice(Math.floor((1-left)*(end.path.length-1)));
  if(end.kind==='none'){cometTrail(c,tail,g.time,img,surface,end.auxiliary?22:end.heavy?49:26,left*.79);continue;}
  powerFX.trail(c,tail,end.kind,end.heavy,g.time,.88*left,end.super);nova.wake(c,tail,end.kind,end.heavy,g.time,left);
 }
 for(const f of g.spellEffects){
  const u=clamp01(f.age/f.life),rise=Math.sin(Math.min(1,u*4)*Math.PI/2);
  c.save();c.globalAlpha=f.type==='impact'?1:1-Math.pow(u,1.6);
  if(f.type==='ground'||f.type==='terminal'){c.restore();continue;}
  if(f.kind==='none'){
   if(f.type==='release'||f.type==='fade')starMagic.burst(c,img,f);
   c.restore();continue;
  }
  if(f.type==='release'){
   powerFX.release(c,spellSprite,img,f);
  }else if(f.type==='fade'){
   powerFX.paintedPhase(c,spellSprite,img,f.kind,f.x+f.face*u*12,f.y, f.heavy?65:32,f.face,.66+u*.34);
  }else{
   const size=(f.super?106:f.heavy?82:54)*(.42+.68*rise+.21*u);
   if(u<.24)glow(c,f.x,f.y,18+28*rise,'rgba(255,241,175,'+(.56*(1-u/.24))+')');
   const picture=impactFrame(f.kind,u);
   const centerY=f.kind==='stone'?(picture==='stoneFleck'?.74:.88):picture==='windBloom'?.77:.5;
   if(u<.24)spellSprite(c,img,picture,f.x,f.y,size*.66,f.face,0,.5,centerY);
  }
  c.restore();
 }
 for(const shot of g.projectiles){
  if(shot.kind==='none'){
   cometTrail(c,shot.path,g.time,img,surface,shot.auxiliary?22:shot.heavy?49:26,shot.auxiliary?.54:.85);
   starMagic.projectile(c,img,shot);continue;
  }
  const face=Math.sign(shot.vx),u=clamp01(shot.age/shot.max);
  const h=boltSize[shot.kind]*(shot.super?2.55:shot.heavy?2.15:1.18)*(.76+.24*Math.min(1,shot.age/.055));
  c.save();c.globalAlpha=Math.min(1,.35+(1-u)*5)*(shot.auxiliary?.35:1);
  nova.head(c,shot);nova.wake(c,shot.path,shot.kind,shot.heavy,g.time);
  powerFX.trail(c,shot.path,shot.kind,shot.heavy,g.time,1,shot.super);
  if(shot.heavy){
   c.globalAlpha*=shot.auxiliary?.80:shot.super?.94:.87;
   powerFX.flightCrest(c,spellSprite,img,shot);
   if(!shot.auxiliary)spellSprite(c,img,shot.kind+'Bolt',shot.x,shot.y,h*.46,face,0,.84,.5);
  }
  else spellSprite(c,img,flightFrame(shot.kind,shot.age),shot.x,shot.y,h,face,.035*Math.sin(shot.age*18),.88,.5);
  c.restore();
 }
 kirbyFX.counterStars(c,g,spellSprite,img);
 kirbyFX.rings(c,g);
 for(const f of g.fx){
  c.globalAlpha=clamp01(f.t/f.max);
  if(f.picture==='pickup'){
   const u=1-c.globalAlpha,col=f.refill?'#a1fff1':'#ffe192',size=(f.refill?32:36)*(1-.72*u);
   light.wash(c,f.x,f.y,23+17*u,23+17*u,0,col,.69);
   spellSprite(c,img,'lootStar'+Math.min(3,Math.floor(u*4)),f.x,f.y,size,1,.19*u);
   light.twinkle(c,f.x,f.y,7+17*Math.sin(Math.PI*u),-.18,col,.88);
  }else star(c,f.x,f.y,f.rad,f.color,f.t*3);
 }c.globalAlpha=1;
}
function enemyProjectiles(c,g,imgs){
 for(const h of g.enemyShots){
  if(h.x<g.camera-60||h.x>g.camera+g.viewWidth+60)continue;
  if(h.kind==='cinder'){
   glow(c,h.x,h.y,26,'rgba(255,125,59,.78)');spellSprite(c,imgs.atlas,'fireWake',h.x-12*h.dir,h.y,21,h.dir);
   spellSprite(c,imgs.atlas,'fireWisp',h.x,h.y,28,h.dir,h.dir*1.18);
  }else if(h.kind==='spore'){
   oval(c,h.targetX,h.ground-2,16,3,'rgba(151,65,162,.67)');spellSprite(c,imgs.atlas,'sporePod',h.x,h.y,28,1,.15*Math.sin(h.age*6));
  }else{
   const radius=8+180*h.age;c.save();c.globalAlpha=Math.max(0,1-h.age/.28);
   for(const side of [-1,1])sprite(c,imgs.atlas,'puff2',h.x+side*radius,h.y,11+15*h.age,side);
   c.translate(h.x,h.y-3);c.scale(1,(5+12*h.age)/radius);c.strokeStyle='#ffd27a';c.lineWidth=4;c.beginPath();c.arc(0,0,radius,0,TAU);c.stroke();c.restore();
  }
 }
}
function world(c,g,imgs,v=standard){
 c.save();
 if(g.kick){
  const u=clamp01(g.kick.age/g.kick.life),zoom=g.kick.zoom||.052,scale=1+zoom*Math.sin(Math.PI*u)*(1-u);
  const anchor=Math.min(v.width*.73,Math.max(v.width*.27,g.kick.x-g.camera)),y=Math.max(v.top+120,Math.min(v.bottom-96,g.kick.y));
  c.translate(anchor,y);c.scale(scale,scale);c.translate(-anchor,-y);
 }
 horizon(c,imgs,g.time,g.camera,g.level.tint,v);
 kirbyFX.atmosphere(c,g,v);
 kirbyFX.actionLines(c,g,v);kirbyFX.screenFlashes(c,g,v);
 let kickX=0,kickY=0;
 if(g.kick){const u=Math.min(1,g.kick.age/.20),decay=(1-u)*(1-u);kickX=-g.kick.face*Math.cos(u*15)*g.kick.amplitude*decay;kickY=Math.sin(u*15)*g.kick.amplitude*.58*decay;}
 c.save();c.translate(-g.camera+kickX,kickY);
 c.save();c.globalAlpha=.81;
 for(const [x,y,h,dir] of g.level.trees||[]){
  if(x+h*.55>g.camera&&x-h*.55<g.camera+v.width)sprite(c,imgs.atlas,'groveTree',x,y+4,h,dir);
 }c.restore();
 for(const [id,x,y,h,dir] of g.level.landmarks||[]){
  if(x+h>g.camera&&x-h<g.camera+v.width)vistaProp(c,imgs.atlas,id,x,y,h,dir,g.time);
 }
 for(const p of g.level.platforms)if(p[0]+p[2]>g.camera-20&&p[0]<g.camera+v.width+20)terrain(c,imgs.atlas,p,g.level.tint,g.time);
 for(const [x,y,w,h] of g.level.falls||[]){
  if(x>g.camera-w&&x<g.camera+v.width+w)waterfall(c,imgs.atlas,x,y+3,w,h,g.time);
 }
 fieldObjects(c,g,imgs);powerFX.backlight(c,g,v);nova.exposure(c,g,v);
 for(const f of g.spellEffects)if(['impact','ground','terminal'].includes(f.type)){
  if(f.kind==='none'){starMagic.burst(c,imgs.atlas,f);continue;}
  nova.blast(c,spellSprite,imgs.atlas,f);
  powerFX.impact(c,spellSprite,imgs.atlas,f);
 }
 nova.paintParticles(c,spellSprite,imgs.atlas,g,true);
 for(const f of g.footEffects){
  if(f.type==='starLift'){starMagic.launch(c,imgs.atlas,f);continue;}
  if(f.type==='fireLift'){phoenix.takeoff(c,f,imgs.atlas);continue;}
  const u=f.age/f.life,id='puff'+Math.min(3,Math.floor(u*4));
  const drift=f.type==='land'?0:-f.face*u*(f.type==='brake'?19:11);
  c.save();c.globalAlpha=.88*(1-u*u);
  spellSprite(c,imgs.atlas,id,f.x+drift,f.y+2,f.size*(12+11*Math.sin(u*Math.PI)),f.face,0,.5,1);c.restore();
 }
 for(const f of g.spellEffects)if(f.type==='ground')powerFX.groundCrests(c,spellSprite,imgs.atlas,f);
 for(const echo of g.echoes){
  if(echo.boost&&(echo.form==='fire'||echo.form==='none'))continue;
  const u=clamp01((g.time-echo.born)/(echo.boost?.23:echo.life));if(u<.05||u>=1)continue;
  const height=frameHeight(echo.id);
  const [sx,sy,shear]=echo.shape,th=kirbyFX.themes[echo.form]||kirbyFX.themes.none;
  c.save();
  if(echo.dash){
   c.save();kirbyFX.glow(c,echo.x,echo.y-height*.48,25*(1-u),th.rgb,.15*(1-u));c.restore();
  }
  c.globalAlpha=.40*(1-u)*(1-u);
  sprite(c,imgs.atlas,echo.id,echo.x,echo.y+1,height,echo.face,0,sy,sx,shear);
  spellSprite(c,imgs.atlas,echo.form+'Charge',echo.x-echo.face*13,echo.y-height*.42,22*(1-u),echo.face,u*1.8);c.restore();
 }
 aura.rushWake(c,g,imgs.atlas,imgs.wakeSurface);aura.rushPressure(c,g,imgs.atlas);phoenix.motes(c,g,imgs.atlas);effects(c,g,imgs.atlas,imgs.wakeSurface);nova.paintParticles(c,spellSprite,imgs.atlas,g,false);
 bodyLight(c,g,imgs);tree(c,g,imgs);friends(c,g,imgs);enemyProjectiles(c,g,imgs);hero(c,g,imgs);struckCreatures(c,g,imgs);
 kirbyFX.popups(c,g,v);
 c.restore();
 c.restore();
}
module.exports={box,line,oval,glow,star,label,wrap,sprite,icon,horizon,terrain,world,drawLumi,serif,sans};

},
"phoenix-rush": function(require,module,exports){
'use strict';
const art=require('./art-rush');
const {smooth}=require('./resonance');
const wave=require('./dash-wave');
const starMagic=require('./star-magic');
const moteArt=['rushEmber0','rushEmber1','rushSpark0','rushSpark1'];

function pressure(c,g,atlas){
  const p=g.player;
  if(p.dash<=0)return;
  if(p.form==='none'){starMagic.pressure(c,g,atlas);return;}
  const t=g.time-p.dashBorn,gain=.51+.49*smooth(t/.13)*smooth(p.dash/.18);
  const swell=.5-.5*Math.cos(t*Math.PI*2/1.12);
  const {width,height,x,y,angle,originY,face}=wave.shape(p,t);
  // The impact focus stays at the beak as the optically soft perimeter extends past the contact area.
  const w=width*(1.70+.09*swell),h=height*(1.91+.12*swell);
  c.save();c.translate(p.x,p.y+originY);c.scale(face,1);c.rotate(angle);
  const opacity=c.globalAlpha*gain;
  c.globalAlpha=opacity*(.54+.09*swell);
  c.drawImage(atlas.lights,...art.fireRushCorona,x+6-w*.866,y-h*.507,w,h);
  // This painting carries the phoenix's original honey-gold and vermilion around a small white-hot focus.
  c.globalAlpha=opacity*.97;
  c.drawImage(atlas.lights,...art.fireSurfaceLight,x-width*.81,y-height*.47,width,height);c.restore();
}

const trailArt={none:'starWake',fire:'fireRushWake',wind:'windRushWake',stone:'stoneRushWake'};
function wake(c,points,t,atlas,form,face,surface,trailHeight){
  if(!atlas?.lights||points.length<2)return;
  const last=points[points.length-1];
  if(last.heat<=.005)return;
  const flow=points.map((p,i)=>{
    if(i===0||i===points.length-1)return p;
    const a=points[i-1],b=points[i+1];
    const drift=(1-(p.heat??1))*Math.sin(p.x*.017-t*2.7)*3.4;
    return {...p,x:p.x*.64+(a.x+b.x)*.18,y:p.y*.64+(a.y+b.y)*.18+drift};
  });
  const lengths=[0],first=flow[0];
  for(let i=1;i<flow.length;i++)lengths.push(lengths[i-1]+Math.hypot(flow[i].x-flow[i-1].x,flow[i].y-flow[i-1].y));
  const span=lengths[lengths.length-1];
  if(span<3)return;
  const [sx,sy,sw,sh]=art[trailArt[form]];
  const height=(trailHeight??(form==='fire'?113:form==='none'?96:65))*(1+.032*Math.sin(t*4.6))*Math.min(1,.38+span/145);
  const dx=last.x-first.x,dy=last.y-first.y,spanAxis=Math.hypot(dx,dy);
  // Parallel cross-sections meet at every real path sample, even on a steep takeoff.
  const nx=spanAxis>1?-dy/spanAxis*face:0,ny=spanAxis>1?Math.abs(dx)/spanAxis:1;
  // Keep the hot part within a few feathers of the root even when the flight path is very long.
  const join=1-Math.min(32/span,.22);
  function sample(u){
    if(u>join)return sw*(.89+.11*(u-join)/(1-join));
    const v=u/join;
    return sw*.89*(v+.015*Math.sin(Math.PI*v)*Math.sin(v*6-t*3.9));
  }
  const gain=.97*smooth(last.heat??1),ink=surface?surface.getContext('2d'):c;
  let left,top,width,heightPx;
  if(surface){
    const xs=flow.map(q=>q.x),ys=flow.map(q=>q.y);
    const mx=Math.abs(nx)*height*.5+2,my=Math.abs(ny)*height*.5+2;
    left=Math.floor(Math.min(...xs)-mx);top=Math.floor(Math.min(...ys)-my);
    width=Math.ceil(Math.max(...xs)+mx)-left;heightPx=Math.ceil(Math.max(...ys)+my)-top;
    if(surface.width<width)surface.width=Math.max(768,Math.ceil(width/128)*128);
    if(surface.height<heightPx)surface.height=Math.max(512,Math.ceil(heightPx/128)*128);
    ink.setTransform(1,0,0,1,0,0);ink.clearRect(0,0,width,heightPx);
  }
  ink.save();
  if(surface){
    // Adjacent antialiased edge samples contribute complementary coverage on a transparent page.
    ink.translate(-left,-top);ink.globalCompositeOperation='lighter';ink.globalAlpha=1;
  }else ink.globalAlpha*=gain;
  for(let i=1;i<flow.length;i++){
    const a=flow[i-1],b=flow[i],distance=lengths[i]-lengths[i-1];
    if(distance<.1)continue;
    const u=lengths[i-1]/span,v=lengths[i]/span;
    const start=sample(u),end=sample(v);
    ink.save();
    ink.transform((b.x-a.x)/distance,(b.y-a.y)/distance,nx,ny,a.x,a.y);
    ink.drawImage(atlas.lights,sx+start,sy,end-start,sh,0,-height*.50,distance,height);
    ink.restore();
  }
  ink.restore();
  if(surface){
    c.save();c.globalAlpha*=gain;
    c.drawImage(surface,0,0,width,heightPx,left,top,width,heightPx);c.restore();
  }
}

function motes(c,g,atlas){
  for(const m of g.dashMotes){
    const age=g.time-m.born,u=age/m.life;
    const fade=smooth(age/.075)*(1-smooth((u-.26)/.74));
    if(fade<.012)continue;
    const beat=.78+.22*Math.sin(m.phase+age*8),size=m.size*(1-.22*u);
    c.save();c.translate(m.x+m.vx*age,m.y+m.vy*age-9*age*age);
    c.rotate(m.angle+m.spin*age);c.globalAlpha*=fade*beat;
    if(m.form==='none')starMagic.spark(c,atlas,0,0,size*(m.variant<2?.64:1),age+m.phase,0,.94);
    else c.drawImage(atlas.lights,...art[moteArt[m.variant]],-size/2,-size/2,size,size);
    c.restore();
  }
}

function takeoff(c,f,atlas){
  const u=f.age/f.life,spread=.24+.76*Math.sin(Math.PI*u*.5);
  c.save();c.translate(f.x,f.y-1);c.scale(f.face,1);c.globalAlpha*=(1-u)**1.25;
  for(const [angle,length,thickness] of [[.10,108,24],[.61,78,31],[1.09,48,21]]){
    const w=length*spread,h=thickness*(.65+.35*spread);
    c.save();c.rotate(angle);c.drawImage(atlas.lights,...art.fireRushWake,-w*.82,-h*.52,w,h);c.restore();
  }
  c.restore();
}
module.exports={pressure,wake,motes,takeoff};

},
"power-fx": function(require,module,exports){
'use strict';
const frames=require('./art');
const {wash,twinkle,ribbon}=require('./light');
const {quakeSpan,quakeLimit}=require('./spell-range');
const TAU=Math.PI*2;
const colors={
 none:['#61366e','#ea95c1','#ffd26c','#fff5c3'],
 fire:['#8b2539','#ed4c2b','#ffad38','#fff3a7'],
 wind:['#175d72','#15989a','#81edc6','#efffec'],
 stone:['#583d48','#9b6948','#eeb75a','#d8ffac']
};
const clamp=u=>Math.max(0,Math.min(1,u));
const ease=u=>1-(1-u)*(1-u);
const smooth=u=>{u=clamp(u);return u*u*(3-2*u);};

// Width comes from the moving silhouette. Both key drawings share the same nose or core.
function crest(c,stamp,img,kind,open,x,y,width,face,angle,anchorX,anchorY){
 const blend=smooth(open);
 for(const [pose,alpha] of [['Fold',1-blend],['Open',blend]]){
  if(alpha<.025)continue;
  const id=kind+'Crest'+pose,frame=frames[id];
  c.save();c.globalAlpha*=alpha;
  stamp(c,img,id,x,y,width*frame[3]/frame[2],face,angle,anchorX,anchorY);c.restore();
 }
}


function flightCrest(c,stamp,img,s){
 const face=Math.sign(s.vx),age=s.age,u=smooth(age/.19),sup=s.super&&!s.auxiliary?1.38:s.auxiliary?.72:1;
 const travel=Math.abs(s.x-s.path[0].x);
 if(s.auxiliary&&!s.arc){
  const prev=s.path[Math.max(0,s.path.length-2)],a=Math.atan2(s.y-prev.y,Math.abs(s.x-prev.x));
  const id=s.kind+'Wake';
  stamp(c,img,id,s.x,s.y,18+11*u,face,a,.92,.5);return;
 }
 if(s.kind==='fire'){
  if(!s.super){
   const h=44+17*u;
   wash(c,s.x-face*h*.66,s.y,h*1.24,h*.48,0,'#ff953e',.61);
   stamp(c,img,Math.sin(age*21)>0?'fireFlyA':'fireFlyB',s.x,s.y,h,face,-.035,.91,.50);return;
  }
  const wing=clamp(u+.22*Math.sin(age*19));
  const width=Math.min(78+travel*1.55,260)*sup*(1+.07*Math.sin(age*15));
  crest(c,stamp,img,'fire',wing,s.x+face*5,s.y,width,face,-.09+.085*Math.sin(age*13),.94,.57);
 }else if(s.kind==='wind'){
  const phase=age*14,span=34*u*sup;
  for(const sign of [-1,1]){
   const arc=phase+sign*Math.PI/2;
   crest(c,stamp,img,'wind',.55+.45*Math.sin(arc),s.x-face*(10+span*.35),s.y+Math.sin(arc)*span,
     (56+146*u)*sup,face,Math.cos(arc)*.48,.86,.51);
  }
 }else if(s.kind==='stone'&&s.arc){
  stamp(c,img,'stoneShard',s.x,s.y,44*sup,face,age*14);
 }
}

function backlight(c,g,v){
 const p=g.player;
 let strength=p.charging&&p.form!=='none'?smooth((p.charge-.19)/.28)*.69:0;
 let x=p.x,y=p.y-50,kind=p.form;
 if(p.form!=='none'&&p.castHeavy&&p.attack>0)strength=Math.max(strength,.82*p.attack/.38);
 for(const f of g.spellEffects){
  if(f.kind==='none'||!f.heavy||(f.type!=='impact'&&f.type!=='ground'&&f.type!=='terminal')||f.x<g.camera-32||f.x>g.camera+v.width+32)continue;
  const light=(f.type==='terminal'?.55:1)*(1-smooth((f.age-.13)/.44));
  if(light>strength){strength=light;x=f.x;y=f.y-(f.type==='ground'?62:0);kind=f.kind;}
 }
 if(strength<.015)return;
 const width=v.width,height=v.height,shade=c.createRadialGradient(x,y,18,x,y,Math.max(width*.64,390));
 c.save();c.globalAlpha*=strength;
 shade.addColorStop(0,'rgba(63,35,62,0)');shade.addColorStop(.42,'rgba(57,37,70,.04)');shade.addColorStop(1,'rgba(38,31,66,.08)');
 c.fillStyle=shade;c.fillRect(g.camera,v.top,width,height);
 const inks=colors[kind];
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3+.21,dx=Math.cos(a),dy=Math.sin(a)*.58;
  wash(c,x+dx*185,y+dy*185,71,8,Math.atan2(dy,dx),inks[2],.13);
 }
 c.restore();
}

function glint(c,x,y,r,t,color){
 c.save();c.translate(x,y);c.rotate(t);c.beginPath();
 c.moveTo(0,-r);c.quadraticCurveTo(r*.12,-r*.16,r*.68,0);c.quadraticCurveTo(r*.1,r*.14,0,r);
 c.quadraticCurveTo(-r*.12,r*.12,-r*.68,0);c.quadraticCurveTo(-r*.08,-r*.15,0,-r);
 c.fillStyle=color;c.fill();c.restore();
}

// The leading point is sampled by the simulation. Only the trailing ribbon ripples.
function trail(c,path,kind,heavy,clock,opacity=1,superCast=false){
 if(path.length<2||opacity<=0)return;
 const col=colors[kind],width=(superCast?22:heavy?16:6)*(kind==='wind'?1.12:1);
 const count=path.length-1,steps=Math.min(count,14),points=[];
 for(let j=0;j<=steps;j++){
  const u=j/steps,p=path[Math.round(u*count)];
  points.push({x:p.x,y:p.y,width:.5+width*Math.sin(u*Math.PI*.65)**.85,alpha:opacity*Math.min(1,u*2.1)});
 }
 ribbon(c,points,col);
 if(heavy)for(let j=3;j<points.length;j+=4){
  const p=points[j];twinkle(c,p.x,p.y+Math.sin(j+clock*11)*p.width,5.5,clock*.6,col[3],.78*opacity);
 }
}

const stages=[.17,.43,.76,1,1.08,1.02,.85,.65];
function paintedPhase(c,stamp,img,kind,x,y,peak,face,progress,ground=false){
 const phase=clamp(progress)*7,first=Math.floor(phase),mix=phase-first;
 for(let n=0;n<2;n++){
  const i=first+n,weight=Math.min(1,(n?mix:1-mix)*1.65);if(i>7||weight<.015)continue;
  const id=kind+'Burst'+i,f=frames[id];if(!f)continue;
  const h=Math.min(peak*stages[i],peak*(ground?2.1:1.52)*f[3]/f[2]);
  c.save();c.globalAlpha*=weight;
  stamp(c,img,id,x,y,h,face,0,.5,ground?.975:.5);c.restore();
 }
}

function impact(c,stamp,img,f){
 const earth=f.type==='ground',col=colors[f.kind],u=clamp(f.age/f.life);
 const open=ease(clamp(f.age/(f.heavy?.15:.10))),fade=1-smooth((u-.48)/.52);
 const peak=(f.super?157:f.heavy?123:70)*(f.type==='terminal'?.88:1);
 const y=f.y-(earth?9+25*open:0),face=f.face;
 // Keep a coloured, painted centre behind the struck creature; the outer plume carries the silhouette.
 wash(c,f.x,y,peak*(.23+.32*open),peak*(.22+.22*open),-.17*face,col[1],.65*fade);
 c.save();c.globalAlpha*=.91*fade;
 if(f.kind==='stone'){
  // These pieces are airborne and have alpha on every edge; the ground painting is registered to the ledge separately.
  const flight=ease(clamp(u/.56)),count=f.heavy?5:3;
  stamp(c,img,'stoneGlow',f.x,y,peak*.79,face,u*.32);
  for(let i=0;i<count;i++){
   const angle=Math.PI*(1.12+.76*i/(count-1)),dist=peak*flight*(i%2?.70:.49);
   const xx=f.x+Math.cos(angle)*dist,yy=y+Math.sin(angle)*dist+peak*.14*u*u;
   const h=peak*(i%2?.21:.29)*(.31+.69*open)*(1-.40*u);
   wash(c,xx,yy,h*.74,h*.85,angle,col[2],.69);
   stamp(c,img,i%2?'stoneShard':'stoneWisp',xx,yy,h,face,(i-2)*.42+u*(i%2?2:-2));
  }
 }else{
  const progress=f.heavy?(u<.30?.47*ease(u/.30):.47+.53*(u-.30)/.70):clamp(u*1.1);
  paintedPhase(c,stamp,img,f.kind,f.x,y,peak,face,progress);
 }
 c.restore();
 const core=(1-smooth(u/.65))*(f.heavy?.66:.53);
 if(core>.01){
  c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=core;
  stamp(c,img,f.kind+'Glow',f.x,y,peak*(.44+.34*open),face,-face*.19);
  wash(c,f.x,y,peak*.32,peak*.24,-face*.23,col[2],.66);c.restore();
 }
 if(f.heavy&&f.kind!=='stone'&&(f.kind!=='fire'||f.super)){
  const rise=smooth(f.age/.19),sail=1-smooth((u-.45)/.36);
  const span=(f.super?235:186)*(.22+.78*rise);
  const lift=f.kind==='fire'?63:f.kind==='wind'?41:17;
  c.save();c.globalAlpha*=rise*sail*(f.type==='terminal'?.58:.73);
  if(f.kind==='wind'){
   for(const side of [-1,1]){
    const a=side*(.37+.8*rise);
    crest(c,stamp,img,'wind',rise,f.x+face*28*rise,y+side*lift*rise,span*.76,face,a,.55,.55);
   }
  }else{
   crest(c,stamp,img,f.kind,rise,f.x+face*(8+42*rise),y-lift*rise,span,face,-.30*rise,.58,.57);
  }
  c.restore();
 }
 const flash=1-smooth(f.age/(f.super?.24:f.heavy?.18:.12));
 if(flash>.01){
  c.save();c.globalCompositeOperation='screen';
  wash(c,f.x,y,peak*.43,peak*.31,-.2*face,col[2],flash*.95);
  twinkle(c,f.x,y,peak*(.10+.12*open),-.28*face,col[3],flash);c.restore();
 }
}

function release(c,stamp,img,f){
 const u=clamp(f.age/f.life),col=colors[f.kind],a=1-smooth(u),h=f.super?91:f.heavy?62:28;
 const open=ease(clamp(f.age/.075)),face=f.face,x=f.x,y=f.y;
 c.save();c.globalAlpha*=a;
 const length=h*(.36+.98*open);
 if(f.kind==='fire'){
  wash(c,x+face*length*.36,y-3,length*.82,h*.46,-face*.07,col[1],.69);
  wash(c,x+face*length*.40,y-4,length*.65,h*.25,-face*.07,col[2],.77);
  wash(c,x+face*length*.27,y-2,length*.5,h*.13,-face*.07,col[3],.85);
 }else{
 const flare=[{x:x-face*9,y:y+2,width:2,alpha:.55},{x:x+face*4,y,width:h*.19,alpha:.97},
  {x:x+face*length*.56,y:y-3,width:h*.13,alpha:.88},{x:x+face*length,y:y-7,width:1,alpha:.27}];
 ribbon(c,flare,col);
 }
 wash(c,x,y,h*.54,h*.39,-.2*face,col[2],.76);
 stamp(c,img,f.kind+'Charge',x,y,h*(.62-.27*u),face,-.3+u*.65);
 twinkle(c,x+face*6,y,h*.25,-.21,col[3],.9);c.restore();
}

function groundCrests(c,stamp,img,f){
 if(!f.surface)return;
 const [left,top,width]=f.surface,right=left+width;
 const origin=Math.min(right,Math.max(left,f.x)),limit=quakeLimit(f),span=quakeSpan(f),sup=f.super;
 const fade=1-smooth((f.age-.24)/.48);
 if(fade>.01){
  const a=Math.max(left,origin-span),b=Math.min(right,origin+span),half=(b-a)/2;
  wash(c,a+half,top,half,sup?12:8,0,'#8af5b4',.92*fade);
  wash(c,a+half,top-1,half,4,0,'#fffbd0',.87*fade);
 }
 for(const side of [-1,1]){
  const available=side<0?origin-left:right-origin,reach=Math.min(limit,available);
  if(reach<8)continue;
  const count=Math.ceil(reach/(sup?83:96)),spacing=reach/count;
  for(let i=0;i<count;i++){
   const dist=spacing*(i+.50),x=origin+side*dist,age=f.age-Math.max(0,dist-20)/(sup?1030:950);
   if(age<=0||age>(sup?.78:.63))continue;
   const rise=ease(clamp(age/.13)),out=1-smooth((age-(sup?.44:.32))/.32);
   // Fit the roots on the ledge. The whole crown and all the airborne light can extend beyond it.
   const base=Math.min(sup?145:111,2.04*Math.min(x-left,right-x));
   c.save();c.globalAlpha*=out*.83;c.translate(x,top+1);c.scale(1,1+.83*rise);
   crest(c,stamp,img,'stone',rise,0,0,base*(.40+.60*rise),side,0,.50,.98);c.restore();
   wash(c,x,top-base*.17*rise,base*.32,base*.17,side*-.4,'#ceffad',.51*rise*out);
  }
 }
}
module.exports={trail,paintedPhase,impact,release,glint,colors,flightCrest,backlight,groundCrests};

},
"resonance": function(require,module,exports){
'use strict';
const {species}=require('./levels');
const duration=.58;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
function heartOffset(m){
 return species[m.kind].rare?15:m.kind==='cap'||m.kind==='plume'?20:18*(1-.84*smooth(m.drawIn));
}
function point(m){return {x:m.x,y:m.y-heartOffset(m)};}
function available(p,m,wall,elements){
 const skill=species[m.kind].skill;
 return m.hidden<=0&&m.appear<=0&&!!skill&&(!elements||elements.includes(skill))&&
  !(wall!=null&&(p.x-wall)*(m.x-wall)<0);
}
function findTarget(p,monsters,wall,elements){
 let best=null,score=Infinity;
 for(const m of monsters){
  if(!available(p,m,wall,elements))continue;
  const dx=m.x-p.x,dy=m.y-heartOffset(m)-(p.y-40);
  if((dx/207)**2+(dy/(dy<0?183:125))**2>1)continue;
  const overhead=dy< -30&&Math.abs(dx)<74;
  const rank=Math.hypot(dx,dy*.87)+(dx*p.face< -32&&!overhead?220:0);
  if(rank<score){score=rank;best=m;}
 }
 return best;
}
function canHold(p,m,wall,elements){
 return available(p,m,wall,elements)&&Math.hypot(m.x-p.x,m.y-heartOffset(m)-p.y+40)<290;
}
// Body and light travel along the same arc. Retarget its end to the moving crystal each tick.
function drawIn(m,from,tip,progress,face){
 const k=smooth(progress),dx=tip.x-from.x,dy=tip.y-from.y,length=Math.hypot(dx,dy)||1;
 const bow=Math.sin(Math.PI*k)*Math.min(29,length*.17);
 m.x=from.x+dx*k+dy/length*bow*face;
 m.y=from.y+dy*k-dx/length*bow*face+heartOffset(m);
}
module.exports={duration,smooth,point,findTarget,canHold,drawIn};

},
"riding": function(require,module,exports){
'use strict';
const art=require('./art-riding');
const {pitch}=require('./dash-wave');

const beat=['flight0','sweep0','flight1','sweep5','sweep1','sweep2',
  'flight2','flight3','sweep3','sweep4','flight4','flight5'];
const seatHeight=70;
function mounted(p){return p.form==='fire'&&p.dash>0;}
function pose(p,time){
  const age=Math.max(0,time-p.dashBorn),phase=Math.floor(age*16)%beat.length;
  return {id:beat[phase],face:p.dashFace,angle:pitch(p)*.62,
    lift:-seatHeight+1.6*Math.sin(age*16/beat.length*Math.PI*2-.8),age};
}
function draw(c,atlas,p,time){
  if(!mounted(p))return false;
  const r=p.ridePose||pose(p,time),[x,y]=art.frames[r.id];
  const {width,height,ratio,pivot}=art;
  const rect=[x,y,width,height,-pivot[0]/ratio,-pivot[1]/ratio,width/ratio,height/ratio];
  c.save();c.translate(p.x,p.y+r.lift);c.scale(r.face,1);c.rotate(r.angle);
  c.drawImage(atlas.rider,...rect);
  // The second painting contains reflected light only where this cel has a receiving surface.
  const strength=Math.min(1,r.age/.12,p.dash/.20);
  const wave=.5+.5*Math.sin(r.age*6.8);
  c.globalCompositeOperation='screen';c.globalAlpha*=(.35+.65*strength)*(.56+.44*wave);
  c.drawImage(atlas.reflect,...rect);c.restore();
  return true;
}
module.exports={mounted,pose,draw};

},
"rush-path": function(require,module,exports){
'use strict';
const {pose}=require('./riding');
const {smooth}=require('./resonance');
const starMagic=require('./star-magic');

const lifetime=1.36;

// Sample the feather root in world coordinates, including the brief lift from the takeoff point.
function anchor(g){
  const p=g.player,face=p.dashFace;
  if(p.form==='none')return starMagic.root(p,g.time);
  if(p.form!=='fire')return {x:p.x-face*16,y:p.y-26};
  const r=pose(p,g.time),c=Math.cos(r.angle),s=Math.sin(r.angle);
  const x=p.x+face*(-38*c-12*s),y=p.y+r.lift-38*s+12*c;
  for(let i=g.footEffects.length-1;i>=0;i--){
    const f=g.footEffects[i];
    if(f.type!=='fireLift'||f.face!==face||f.age>=.17)continue;
    const u=smooth(f.age/.17);
    return {x:f.x+(x-f.x)*u,y:f.y+(y-f.y)*u};
  }
  return {x,y};
}

function updateMotes(g,fromX,fromY){
  const p=g.player,time=g.time;
  g.dashMotes=g.dashMotes.filter(m=>time-m.born<m.life);
  if(!p.dash||time<g.nextDashMote)return;
  // Samples are fixed at birth. Pausing and changing direction never reseed an existing ember.
  let seed=Math.imul(++g.dashMoteCount,2654435761)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const moving=Math.hypot(p.x-fromX,p.y-fromY)>.75,face=p.dashFace;
  g.nextDashMote=time+(moving?.059:.22)+random()*(moving?.036:.08);
  const root=anchor(g),shoulder=random()<.23,side=random()<.5?-1:1;
  const x=shoulder?p.x+face*(24+random()*31):root.x-face*(random()*33);
  const y=shoulder?p.y-(p.form==='fire'?73:33)+side*(20+random()*16):root.y+(random()-.50)*44;
  const kind=random(),variant=kind<.36?0:kind<.73?1:kind<.87?2:3;
  g.dashMotes.push({born:time,life:.78+.47*random(),x,y,variant,form:p.form,
    vx:-face*(14+34*random()),vy:-5+side*(9+20*random()),angle:(random()-.5)*1.35,
    spin:(random()-.5)*1.05,size:(variant<2?17:22)+8*random(),phase:random()*Math.PI*2});
}
module.exports={anchor,lifetime,updateMotes};

},
"spell-range": function(require,module,exports){
'use strict';

// All distances are in world pixels. The broad luminous rim uses the same ellipse as the hit test.
const reach={none:[480,710],fire:[590,820],wind:[640,880]};
const fields={none:[[145,90],[218,133]],fire:[[166,100],[242,146]],wind:[[152,120],[222,170]]};
function boltReach(kind,heavy,superCast){
  return heavy?reach[kind][superCast?1:0]:kind==='none'?260:360;
}
const bloomTime=.26;
function bloomAxes(f){
  const [rx,ry]=fields[f.kind][f.super?1:0];
  const u=Math.min(1,f.age/bloomTime),scale=.10+.90*(1-(1-u)*(1-u));
  return [rx*scale,ry*scale];
}
function quakeLimit(f){return (f.super?420:290)+Math.min(50,(f.drop||0)*.25);}
function quakeSpan(f){return Math.min(quakeLimit(f),20+f.age*(f.super?1030:950));}
module.exports={boltReach,bloomTime,bloomAxes,quakeSpan,quakeLimit};

},
"star-magic": function(require,module,exports){
'use strict';
const frames = require('./art-rush');
const {smooth} = require('./resonance');
const {heavyTime,superTime} = require('./motion');
const {bloomAxes} = require('./spell-range');
const wave = require('./dash-wave');

function picture(c,atlas,id,x,y,width,height,face=1,angle=0,alpha=1,ax=.5,ay=.5) {
  if (!atlas?.lights || alpha<.008 || width<=0 || height<=0) return;
  c.save();c.translate(x,y);c.scale(face,1);c.rotate(angle);c.globalAlpha*=alpha;
  c.drawImage(atlas.lights,...frames[id],-width*ax,-height*ay,width,height);
  c.restore();
}
const phase = time => Math.floor(time*10)%4;
function spark(c,atlas,x,y,size,time,angle,alpha) {
  picture(c,atlas,'starPalm'+phase(time),x,y,size,size,1,angle,alpha);
}

function palm(c,atlas,p,tip,t,front) {
  const face=p.chargeFace, gather=smooth(p.charge/heavyTime);
  const focus=smooth((p.charge-heavyTime)/(superTime-heavyTime));
  const full=p.charge>=superTime, open=smooth((p.charge-superTime)/.14);
  const beat=.5-.5*Math.cos(t*7), height=12+21*gather+28*focus+34*open+beat*(2+5*focus);
  const cx=tip.x+face*(4+focus*5),cy=tip.y-height*.28;
  if (front) {
    spark(c,atlas,tip.x,tip.y,7+6*gather+5*open,t,-.18,.92);
    return;
  }
  picture(c,atlas,'starPalm'+phase(t),cx,cy,height,height,face,.055*Math.sin(t*6));
  const count=full?4:p.charge>=heavyTime?2:3;
  for(let i=0;i<count;i++){
    const u=(t*1.25+i/count)%1,angle=t*(full?2.2:2.9)+i*Math.PI*2/count;
    const distance=full?height*(.40+.05*Math.sin(angle)):p.charge>=heavyTime?height*.46:27*(1-u);
    const x=cx+Math.cos(angle)*distance,y=cy+Math.sin(angle)*distance*.72;
    spark(c,atlas,x,y,full?11+5*beat:5+5*gather,t+i,angle*.14,full?.9:gather*.85);
  }
}

function projectile(c,atlas,shot) {
  const face=Math.sign(shot.vx),prev=shot.path[Math.max(0,shot.path.length-2)];
  const angle=Math.atan2(shot.y-prev.y,Math.max(.1,Math.abs(shot.x-prev.x)));
  const size=(shot.auxiliary?45:shot.super?103:shot.heavy?72:43)*(.80+.20*smooth(shot.age/.07));
  picture(c,atlas,'starComet'+phase(shot.age),shot.x,shot.y,size,size,face,angle,shot.auxiliary?.91:1,.69,.49);
}

function burst(c,atlas,f) {
  const u=Math.min(1,f.age/f.life),release=f.type==='release',fade=f.type==='fade';
  if(release||fade){
    const size=(f.super?76:f.heavy?54:33)*(.72+.46*smooth(u/.45));
    picture(c,atlas,'starPalm'+phase(f.age),f.x,f.y,size,size,f.face,.15*u,1-smooth(u));
    return;
  }
  // The expanding star fragments reach the same ellipse that tests enemies and nearby pickups.
  const [rx,ry]=f.heavy?bloomAxes(f):[38+23*smooth(u/.45),32+15*smooth(u/.45)];
  const progress=Math.min(3,f.age/(f.heavy?.46:.30)*3);
  const index=Math.floor(progress),mix=progress-index;
  const alpha=(1-smooth((u-.54)/.46))*(f.type==='terminal'?.84:.96);
  const width=rx*2.17,height=ry*2.17;
  picture(c,atlas,'starBloom'+index,f.x,f.y,width,height,f.face,0,alpha*(1-mix));
  if(mix>0)picture(c,atlas,'starBloom'+(index+1),f.x,f.y,width,height,f.face,0,alpha*mix);
  if(f.age<.16)spark(c,atlas,f.x,f.y,f.heavy?65:34,f.age,-.18,1-smooth(f.age/.16));
}

function surfPose(p,time) {
  const age=Math.max(0,time-p.dashBorn),angle=wave.pitch(p)*.56;
  return {x:p.x,y:p.y-23+1.7*Math.sin(age*10),face:p.dashFace,angle,
    id:'starRide'+Math.floor(age*11)%6};
}
function ride(c,atlas,pose) {
  picture(c,atlas,pose.id,pose.x,pose.y,111,121,pose.face,pose.angle,1,.5,368/496);
}
function root(p,time) {
  const r=surfPose(p,time);
  return {x:r.x-r.face*26*Math.cos(r.angle),y:r.y-26*Math.sin(r.angle)};
}
function pressure(c,g,atlas) {
  const p=g.player,t=g.time-p.dashBorn,shape=wave.shape(p,t);
  const pulse=.5-.5*Math.cos(t*6.4);
  c.save();c.translate(p.x,p.y+shape.originY);c.scale(shape.face,1);c.rotate(shape.angle);
  const gain=.50+.50*smooth(t/.13)*smooth(p.dash/.17);
  picture(c,atlas,'starBow',shape.x,shape.y,shape.width*(1.20+.045*pulse),
    shape.height*(1.31+.09*pulse),1,0,gain,.738,.528);
  c.restore();
}
function launch(c,atlas,f) {
  const u=f.age/f.life,open=smooth(u/.42),size=28+62*open;
  picture(c,atlas,'starBloom'+Math.min(3,Math.floor(u*4)),f.x,f.y-5,size,size*.53,f.face,0,1-smooth(u));
}
module.exports={palm,projectile,burst,spark,surfPose,ride,root,pressure,launch};

},
"touch-hud": function(require,module,exports){
'use strict';
const {touchControls}=require('./viewport');
const {dashRules,clamp}=require('./game');
const {heavyTime,superTime}=require('./motion');
const {abilities}=require('./levels');
const {oval,icon,star,sprite,label}=require('./paint');
const tau=Math.PI*2,top=-Math.PI/2;

function arc(c,x,y,r,start,end,color,width){
  c.beginPath();c.arc(x,y,r,start,end);c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function drawStick(c,pad,unit,origin,axis){
  // The visible base stays on screen even when the thumb starts on a safe-area edge.
  const r=pad.r;
  const x=origin?clamp(origin.x,pad.x+r,pad.x+pad.w-r):pad.cx;
  const y=origin?clamp(origin.y,pad.y+r,pad.y+pad.h-r):pad.cy;
  oval(c,x,y,r,r,origin?'rgba(36,32,57,.55)':'rgba(36,32,57,.39)');
  arc(c,x,y,r-1*unit,0,tau,'rgba(255,235,197,.72)',2*unit);
  arc(c,x,y,r-6*unit,0,tau,'rgba(255,233,192,.25)',unit);
  for(const dir of [-1,1]){
    const bright=dir*axis>.14;
    icon(c,dir<0?'left':'right',x+dir*r*.74,y,14*unit,bright?'#fff2c8':'rgba(255,241,206,.75)');
  }
  const kx=x+axis*(r-pad.knob-6*unit);
  oval(c,kx,y+2*unit,pad.knob,pad.knob,'rgba(27,24,45,.55)');
  oval(c,kx,y,pad.knob,pad.knob,origin?'#8b7180':'rgba(116,94,112,.90)');
  arc(c,kx,y,pad.knob-unit,0,tau,'#ebcda3',2*unit);
  arc(c,kx,y,pad.knob-5*unit,Math.PI,Math.PI*1.75,'rgba(255,240,206,.46)',unit);
  star(c,kx,y,8*unit,'#ffdf9e');
}
function touchHud(c,hot,g,img,v,input={}){
  const layout=touchControls(v),u=layout.unit,p=g.player;
  drawStick(c,layout.stick,u,input.origin,g.stick||0);
  function disc(key,title,color,progress=0){
    const button=layout[key],{cx:x,cy:y,r}=button;
    const locked=p.dash>0&&(key==='attack'||key==='bell'),held=!locked&&input.held?.(key);
    const boosting=key==='dash'&&p.dash>0,ready=key==='dash'&&g.dashReady;
    c.save();c.translate(x,y+(held?1.5*u:0));if(held)c.scale(.95,.95);
    if(!held&&g.recoils.some(m=>Math.hypot(m.curX-g.camera-x,m.curY-19-y)<r+16))c.globalAlpha=.42;
    if(locked)c.globalAlpha*=.34;
    oval(c,0,2*u,r,r,'rgba(30,25,46,.34)');
    oval(c,0,0,r,r,held?'rgba(87,64,90,.87)':ready?'rgba(99,69,56,.84)':'rgba(45,37,65,.68)');
    arc(c,0,0,r-u,0,tau,color,(key==='attack'?2.5:1.6)*u);
    arc(c,0,0,r-5*u,0,tau,'rgba(255,246,221,.18)',u);
    if(key==='dash'){
      const segments=boosting?1:dashRules.minimumStars,slice=tau/segments;
      for(let i=0;i<segments;i++){
        const from=top+i*slice+.10,span=slice-.20,fill=clamp(g.dashFraction*segments-i,0,1);
        arc(c,0,0,r+2*u,from,from+span,'rgba(41,35,56,.76)',3*u);
        if(fill>0)arc(c,0,0,r+2*u,from,from+span*fill,boosting?'#9ef3e4':'#ffdf80',3*u);
      }
    }else if(progress>0)arc(c,0,0,r-4*u,top,top+tau*Math.min(1,progress),color,3.5*u);
    if(key==='attack'&&img.atlas){
      sprite(c,img.atlas,p.form==='none'?'starPalm0':p.form+'Charge',0,r*.18,r*.83);
    }else if(key==='dash'&&p.form==='none'&&img.atlas){
      sprite(c,img.atlas,'starComet0',-r*.09,r*.25,r*.98);
    }else if(key==='jump'&&img.atlas){
      icon(c,'jump',r*.24,-r*.26,r*.66,color);
      sprite(c,img.atlas,p.form+'3',-r*.14,r*.17,r*.86);
    }else{
      icon(c,key,0,-r*.21,r*.83,color);
    }
    label(c,title,0,r*.45,(key==='attack'?16:key==='jump'?14:12)*u,'#fff4da','center',undefined,650);
    c.restore();if(!locked)hot.push(button);
  }
  const attackTitle=!p.charging?'攻击':p.charge>=superTime?'蓄满':p.charge>=heavyTime?'重击':'聚能';
  disc('attack',attackTitle,p.charging&&p.charge>=heavyTime?'#fff4a6':abilities[p.form].color,p.charging?p.charge/superTime:0);
  disc('jump','跳跃','#b5efde');
  disc('bell','共鸣','#e5c5ff',g.captured?.pull||0);
  disc('dash',p.dash>0?'冲刺中':'冲刺',p.dash>0?'#9ef3e4':g.dashReady?'#ffe290':'#d7c9b7');
  hot.push(layout.stick);
}
module.exports={touchHud};

},
"viewport": function(require,module,exports){
'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const designWidth=960,designHeight=540;

// World and touch both use this uniform transform. Native insets affect controls only.
function makeViewport(w,h,ratio=1,area,menu){
  w=Math.max(1,w);h=Math.max(1,h);
  const s=Math.min(w/designWidth,h/designHeight),width=w/s,height=h/s;
  const y=(h-designHeight*s)/2,top=-y/s,bottom=top+height;
  function rect(source){
    if(!source||!['left','right','top','bottom'].every(k=>Number.isFinite(source[k])))return null;
    const left=clamp(source.left,0,w),right=clamp(source.right,0,w);
    const t=clamp(source.top,0,h),b=clamp(source.bottom,0,h);
    return right>left&&b>t?{left:left/s,right:right/s,top:(t-y)/s,bottom:(b-y)/s}:null;
  }
  const safe=rect(area)||{left:0,right:width,top,bottom};
  const capsule=rect(menu);
  return {w,h,dpr:clamp(ratio||1,1,2),s,y,width,height,top,bottom,safe,capsule};
}
const standard=makeViewport(960,540);

// Thumb sizes follow the short physical side. World-space scaling stays independent.
function touchControls(v){
  const a=v.safe,w=a.right-a.left,h=a.bottom-a.top;
  const unit=clamp(Math.min(Math.min(v.w,v.h)/390,w*v.s/660),.76,1.13)/v.s;
  const cy=a.bottom-76*unit,attackX=a.right-67*unit,jumpX=attackX-99*unit;
  function action(id,cx,cy,r,hit){
    const hitR=hit*unit;
    return {id,cx,cy,r:r*unit,hitR,x:cx-hitR,y:cy-hitR,w:2*hitR,h:2*hitR};
  }
  const zoneTop=a.top+h*.40;
  return {unit,stick:{id:'stick',x:a.left,y:zoneTop,w:w*.49,h:a.bottom-zoneTop,
      cx:a.left+76*unit,cy,r:60*unit,knob:25*unit,travel:32*unit},
    attack:action('attack',attackX,cy,47,53),
    jump:action('jump',jumpX,cy-19*unit,35,40),
    dash:action('dash',attackX+3*unit,cy-94*unit,28,34),
    bell:action('bell',jumpX-4*unit,cy-98*unit,28,34)};
}

function wechatBounds(w,h,safe,capsule){
  // Some landscape clients still return the safe rectangle in portrait coordinates.
  if(w>h&&safe&&safe.bottom>h+2&&safe.bottom<=w+2&&safe.right<=h+2){
    const home=Math.max(0,w-safe.bottom),notch=Math.max(0,safe.top,home);
    const side=Math.max(0,safe.left,h-safe.right);
    safe={left:notch,right:w-notch,top:side,bottom:h-Math.max(side,Math.min(24,home))};
    if(capsule&&capsule.right<=h+2&&capsule.left>h*.5){
      capsule={...capsule,left:capsule.left+w-h,right:capsule.right+w-h};
    }
  }
  return {safe,capsule};
}

function menuFrame(v){
  const a=v.safe;
  const top=v.capsule?Math.max(a.top,v.capsule.bottom+3):a.top;
  const k=Math.min(1,(a.right-a.left)/960,Math.max(1,a.bottom-top)/540);
  return {x:(a.left+a.right-960*k)/2,y:(top+a.bottom-540*k)/2,k};
}

function topButtons(v,touch){
  const a=v.safe,cap=v.capsule;
  const size=touch?Math.max(42,42/v.s):40,height=touch?size:36,gap=8;
  const pair=size*2+gap,margin=touch?16:27;
  let x=a.right-margin-pair,y=a.top+(touch?15:22);
  if(cap&&y<cap.bottom+6&&y+height>cap.top-6&&x<cap.right+6&&x+pair>cap.left-6){
    const before=cap.left-9-pair;
    if(before>(a.left+a.right)/2+148)x=before;
    else y=cap.bottom+8;
  }
  return {x,y,size,height,gap};
}
module.exports={makeViewport,standard,menuFrame,topButtons,wechatBounds,touchControls};

},
"web": function(require,module,exports){
'use strict';
const {createApp}=require('./app');
const {samples,sampleRate}=require('./audio');
const {tile}=require('./actor-pose');
const SAVE='bright_escape_v1';
function browserSound(){
 let ac=null;const clips={};
 return {unlock(){if(!ac){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)ac=new Audio();}if(ac&&ac.state==='suspended')ac.resume().catch(()=>{});},
  play(id,loop,volume){if(!ac)return null;try{
    if(!clips[id]){const s=samples(id),buf=ac.createBuffer(1,s.length,sampleRate);buf.getChannelData(0).set(s);clips[id]=buf;}
    const src=ac.createBufferSource(),gain=ac.createGain();gain.gain.value=volume;src.buffer=clips[id];src.loop=loop;src.connect(gain);gain.connect(ac.destination);
    src.onended=()=>{src.disconnect();gain.disconnect();};src.start();return {stop(){try{src.stop();}catch(_){}}};
   }catch(_){return null;}}};
}
async function boot(){
 const c=document.getElementById('stage'),msg=document.getElementById('loading'),live=document.getElementById('live');
 const src={rider:'WeChatGame/riding/phoenix.png',reflect:'WeChatGame/riding/reflect.png',sky:'WeChatGame/assets/dawn.webp',skyFallback:'WeChatGame/assets/dawn.jpg',lights:'WeChatGame/riding/lights.png',atlas:'WeChatGame/assets/sprites.png',detail:'WeChatGame/assets/detail.png',powers:'WeChatGame/assets/powers.png',travel:'WeChatGame/assets/travel.png',vistas:'WeChatGame/assets/vistas.jpg',...window.BRIGHT_ASSETS};
 function load(url){return new Promise((ok,fail)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>fail(new Error('图片未能打开'));im.src=url;});}
 try{
 const [sky,base,detail,powers,travel,vistas,lights,rider,reflect]=await Promise.all([
   load(src.sky).catch(()=>load(src.skyFallback)),load(src.atlas),load(src.detail),load(src.powers),load(src.travel),load(src.vistas),load(src.lights),load(src.rider),load(src.reflect)]);
 const poseSurface=document.createElement?.('canvas');
 if(poseSurface)poseSurface.width=poseSurface.height=tile*2;
 const lightSurface=document.createElement?.('canvas');
 if(lightSurface)lightSurface.width=lightSurface.height=require('./character-light').side*2;
 const wakeSurface=document.createElement?.('canvas');
 if(wakeSurface)wakeSurface.width=wakeSurface.height=1;
 const app=createApp({canvas:c,images:{sky,atlas:{base,detail,powers,travel,lights,rider,reflect},vistas,poseSurface,lightSurface,wakeSurface},audio:browserSound(),touch:matchMedia('(pointer:coarse)').matches,
 read(){try{return JSON.parse(localStorage.getItem(SAVE)||'null');}catch(_){return null;}},
 save(data){try{localStorage.setItem(SAVE,JSON.stringify(data));}catch(_){}}});
 function resize(){
  const b=c.getBoundingClientRect(),w=Math.max(1,b.width),h=Math.max(1,b.height);
  const css=typeof getComputedStyle==='function'?getComputedStyle(c):null;
  const inset=side=>parseFloat(css?.getPropertyValue('--safe-'+side))||0;
  app.resize(w,h,devicePixelRatio||1,{left:inset('left'),right:w-inset('right'),top:inset('top'),bottom:h-inset('bottom')});
 }
 resize();window.addEventListener('resize',resize);if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(c);
 const allowed=new Set(['ShiftLeft','ShiftRight','KeyA','KeyD','KeyW','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyJ','KeyK','KeyL','KeyQ','KeyE','Digit1','Digit2','Digit3','Digit4','KeyI','KeyP','Escape','Enter','Tab']);
 function key(e,down){if(!allowed.has(e.code)||document.activeElement?.tagName==='BUTTON')return;
  if(e.code==='Tab'&&document.activeElement!==c)return;e.preventDefault();app.key(e.code,down,e.repeat);}
 window.addEventListener('keydown',e=>key(e,true));window.addEventListener('keyup',e=>key(e,false));
 for(const [evt,type] of [['pointerdown','down'],['pointermove','move'],['pointerup','up'],['pointercancel','cancel'],['lostpointercapture','cancel']]){
  c.addEventListener(evt,e=>{const r=c.getBoundingClientRect();if(type==='down'){c.focus({preventScroll:true});try{c.setPointerCapture(e.pointerId);}catch(_){}}
   app.pointer(type,e.pointerId,e.clientX-r.left,e.clientY-r.top,e.pointerType!=='mouse');});}
 function visibility(){if(document.hidden)app.suspend();else app.resume();}
 document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',()=>app.suspend());window.addEventListener('focus',()=>{if(!document.hidden)app.resume();});
 const sceneTitles={title:'星铃奇旅 标题画面',play:'冒险中',pause:'游戏暂停',book:'旅行手记',map:'浮岛地图',clear:'关卡完成',retry:'回声灯重试',ending:'树灵醒来了'};
 let previous='';function frame(ms){app.frame(ms);const g=app.game;
 const dash=g.player.dash>0?'active':g.dashReady?'ready':'charging';
 const k=[g.scene,g.index,g.player.form,g.player.hp,dash,g.data.dashStars].join('-');
 if(k!==previous){previous=k;c.dataset.dashStars=String(g.data.dashStars);live.textContent=sceneTitles[g.scene]+' · '+g.level.name+' · '+g.player.hp+'颗心'+(g.scene==='play'?' · 星能 '+g.data.dashStars+' 颗':'')+(g.scene==='play'&&dash!=='charging'?(dash==='active'?' · 冲刺中':' · 冲刺就绪'):'');c.dataset.scene=g.scene;c.dataset.level=g.level.id;c.dataset.form=g.player.form;c.dataset.hearts=String(g.player.hp);c.dataset.dash=dash;}requestAnimationFrame(frame);}
 msg.hidden=true;c.focus({preventScroll:true});requestAnimationFrame(frame);
 }catch(e){msg.textContent='游戏素材读取失败。请在完整解压的工程中打开 Play.html，或重新载入此页。';}
}
boot();

}
};
const cache={};
function req(id){id=id.replace(/^\.\//,'');if(cache[id])return cache[id].exports;const fn=factories[id];if(!fn)throw Error('Missing game module '+id);const mod={exports:{}};cache[id]=mod;fn(req,mod,mod.exports);return mod.exports;}
req('web');
})();
