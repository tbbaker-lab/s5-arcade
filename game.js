(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas=$('game'),ctx=canvas.getContext('2d'),scoreEl=$('score'),targetEl=$('target'),playerEl=$('playerName'),difficultyEl=$('difficulty'),rewardEl=$('rewardText'),progressFill=$('progressFill'),progressText=$('progressText'),pill=$('connectionPill'),startOverlay=$('startOverlay'),startBtn=$('startBtn'),countdown=$('countdown'),flash=$('flash'),milestone=$('milestone'),resultOverlay=$('resultOverlay'),resultIcon=$('resultIcon'),resultKicker=$('resultKicker'),resultTitle=$('resultTitle'),resultBody=$('resultBody'),claimCard=$('claimCard'),proofCode=$('proofCode'),roleText=$('roleText'),copyProofBtn=$('copyProofBtn'),retryBtn=$('retryBtn'),discordBtn=$('discordBtn'),soundBtn=$('soundBtn'),authOverlay=$('authOverlay'),discordLoginBtn=$('discordLoginBtn'),authTarget=$('authTarget'),authReward=$('authReward'),authText=$('authText');

  // Restore the panel query after Discord redirects back to the clean GitHub Pages URL.
  if(!location.search && location.hash.includes('access_token=')){
    const q=sessionStorage.getItem('s5_pending_query');
    if(q) history.replaceState(null,'',location.pathname+q+location.hash);
  }
  const params=new URLSearchParams(location.search), challenge=params.get('challenge')||'', clientId=params.get('client')||'';
  const redirectUri=location.origin+location.pathname;
  const WORLD={w:1280,h:720,birdX:285,birdRadius:20,pipeWidth:96},DT=1/60;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a);
  const b64decode=s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return decodeURIComponent(Array.from(atob(s)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''))};
  let ch=null;
  try{ch=JSON.parse(b64decode(challenge.split('.')[0]||''));}catch(_){ch=null}
  const target=clamp(Number(ch?.t||100),5,500),guildId=String(ch?.g||''),rewardPreview=String(ch?.p||'Prize shown on Discord');
  targetEl.textContent=target;authTarget.textContent=target;authReward.textContent=rewardPreview;rewardEl.textContent=rewardPreview;

  let authUser=null,running=false,ended=false,sim=null,acc=0,lastFrame=performance.now(),visualY=360,visualVY=0,lastScore=0,flapFrames=[],flapSet=new Set(),lastFlapFrame=-9999;
  let shake=0,scorePulse=0,soundOn=true,trail=[],sparks=[],stars=[],fog=[],gatePulse=0;
  for(let i=0;i<150;i++)stars.push({x:rand(0,WORLD.w),y:rand(0,WORLD.h),z:rand(.2,1),tw:rand(0,6.28)});
  for(let i=0;i<12;i++)fog.push({x:rand(-300,WORLD.w),y:rand(50,WORLD.h-80),r:rand(100,280),s:rand(6,18),a:rand(.012,.035)});

  let audioCtx=null;function ensureAudio(){if(!soundOn)return null;if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();return audioCtx}
  function tone(freq=440,dur=.08,type='sine',gain=.05,slide=0){const a=ensureAudio();if(!a)return;const t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+dur+.02)}
  const sfxFlap=()=>tone(300,.09,'triangle',.035,180),sfxPoint=()=>{tone(690,.08,'sine',.04,240);setTimeout(()=>tone(940,.07,'sine',.025,100),45)},sfxCrash=()=>{tone(150,.26,'sawtooth',.05,-80);setTimeout(()=>tone(80,.38,'square',.025,-30),70)},sfxWin=()=>[440,554,659,880].forEach((f,i)=>setTimeout(()=>tone(f,.3,'sine',.045,90),i*120));
  soundBtn.onclick=()=>{soundOn=!soundOn;soundBtn.textContent=`SOUND: ${soundOn?'ON':'OFF'}`;if(soundOn)ensureAudio()};
  function setConnection(text,mode){pill.classList.remove('online','offline');if(mode)pill.classList.add(mode);pill.querySelector('span').textContent=text}
  function failAuth(msg){setConnection('LINK INVALID','offline');authText.textContent=msg;discordLoginBtn.disabled=true;discordLoginBtn.style.opacity=.45}

  if(!ch||!challenge.includes('.')||!clientId||!guildId){failAuth('Open this game using the PLAY THE GAME button on the S5 Discord panel.');}

  function randomState(){const a=new Uint8Array(18);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')}
  discordLoginBtn.onclick=()=>{
    if(!ch||!clientId)return;
    const state=randomState();sessionStorage.setItem('s5_oauth_state',state);sessionStorage.setItem('s5_pending_query',location.search);
    const q=new URLSearchParams({response_type:'token',client_id:clientId,scope:'identify guilds',state,redirect_uri:redirectUri,prompt:'consent'});
    location.href='https://discord.com/oauth2/authorize?'+q.toString();
  };

  async function finishDiscordAuth(){
    const h=new URLSearchParams(location.hash.replace(/^#/,'')),token=h.get('access_token');if(!token)return false;
    const expected=sessionStorage.getItem('s5_oauth_state'),got=h.get('state');
    history.replaceState(null,'',location.pathname+location.search);
    if(!expected||expected!==got){failAuth('Discord login state did not match. Press Continue with Discord again.');return true}
    try{
      setConnection('CHECKING DISCORD');
      const headers={Authorization:`Bearer ${token}`};
      const [ur,gr]=await Promise.all([fetch('https://discord.com/api/v10/users/@me',{headers}),fetch('https://discord.com/api/v10/users/@me/guilds?limit=200',{headers})]);
      if(!ur.ok||!gr.ok)throw new Error('Discord rejected the login');
      const user=await ur.json(),guilds=await gr.json();
      if(!Array.isArray(guilds)||!guilds.some(g=>String(g.id)===guildId))throw new Error('You must be in the S5 Customs Discord server to play this challenge.');
      authUser=user;playerEl.textContent=(user.global_name||user.username||'PLAYER').toUpperCase();authOverlay.classList.add('hide');setTimeout(()=>authOverlay.style.display='none',450);setConnection('DISCORD LINKED','online');startOverlay.classList.remove('hide');
      sessionStorage.removeItem('s5_oauth_state');sessionStorage.removeItem('s5_pending_query');return true;
    }catch(e){failAuth(e.message||'Discord authorisation failed.');return true}
  }

  function mixSeed(seed,uid){let x=BigInt(uid);return (Number((BigInt(seed>>>0)^(x&0xffffffffn)^((x>>32n)&0xffffffffn))&0xffffffffn)>>>0)||0x6d2b79f5}
  class XorShift32{constructor(seed){this.x=seed>>>0||0x6d2b79f5}random(){let x=this.x>>>0;x^=(x<<13)>>>0;x^=x>>>17;x^=(x<<5)>>>0;this.x=x>>>0;return this.x/4294967296}}
  function difficulty(score){const p=score/Math.max(1,target),speed=390+Math.min(250,p*220+score*.52),gap=Math.max(134,258-p*103-Math.min(28,score*.11)),spawn=Math.max(.74,1.18-p*.25),gravity=1680+p*175,flap=-585-p*34;return{p,speed,gap,spawn,gravity,flap}}
  function newSim(){const seed=mixSeed(Number(ch.s||1),authUser.id);return{frame:0,y:WORLD.h*.5,vy:-120,score:0,spawnTimer:.70,lastGapY:WORLD.h*.5,obstacles:[],rng:new XorShift32(seed),won:false,crashed:false}}
  function spawnPipe(d){const margin=d.gap/2+72,maxShift=sim.score<20?155:185,candidate=sim.lastGapY+(-maxShift+sim.rng.random()*maxShift*2),gapY=clamp(candidate,margin,WORLD.h-margin);sim.lastGapY=gapY;sim.obstacles.push({x:WORLD.w+70,gapY,gapH:d.gap,scored:false})}
  function stepSim(){if(!running||ended)return;const f=sim.frame,d=difficulty(sim.score);if(flapSet.has(f))sim.vy=d.flap;sim.vy+=d.gravity*DT;sim.y+=sim.vy*DT;sim.spawnTimer-=DT;if(sim.spawnTimer<=0){spawnPipe(d);sim.spawnTimer+=d.spawn}for(const o of sim.obstacles){o.x-=d.speed*DT;o.gapH=Math.max(d.gap,o.gapH-7*DT)}
    if(sim.y-WORLD.birdRadius<=0||sim.y+WORLD.birdRadius>=WORLD.h){lose('You hit the edge of the course.');return}
    for(const o of sim.obstacles){const left=o.x,right=o.x+WORLD.pipeWidth,bl=WORLD.birdX-WORLD.birdRadius,br=WORLD.birdX+WORLD.birdRadius;if(!(br<left||bl>right)){const top=o.gapY-o.gapH/2,bottom=o.gapY+o.gapH/2;if(sim.y-WORLD.birdRadius<top||sim.y+WORLD.birdRadius>bottom){lose('You clipped a gate.');return}}if(!o.scored&&(o.x+WORLD.pipeWidth)<(WORLD.birdX-WORLD.birdRadius)){o.scored=true;sim.score++;onPoint();if(sim.score>=target){win(f);return}}}
    sim.obstacles=sim.obstacles.filter(o=>o.x>-WORLD.pipeWidth-30);sim.frame++;visualVY=sim.vy;visualY=sim.y;updateDifficulty(d);}

  function updateProgress(score){const p=clamp(score/Math.max(1,target),0,1);progressFill.style.width=`${p*100}%`;progressText.textContent=`${Math.floor(p*100)}%`;scoreEl.textContent=score}
  function updateDifficulty(d=difficulty(sim?.score||0)){const p=d.p;difficultyEl.textContent=p>.82?'NIGHTMARE':p>.58?'EXTREME':p>.30?'SAVAGE':'BRUTAL';difficultyEl.style.color=p>.7?'#a9ff7d':'#d9ffca'}
  function onPoint(){if(sim.score!==lastScore){lastScore=sim.score;updateProgress(sim.score);pointBurst();sfxPoint()}}
  function queueFlap(){if(!running||ended||!sim)return;const f=sim.frame;if(f-lastFlapFrame<4)return;lastFlapFrame=f;flapFrames.push(f);flapSet.add(f);visualVY=difficulty(sim.score).flap;sfxFlap();for(let i=0;i<9;i++)sparks.push({x:WORLD.birdX-20,y:visualY+rand(-8,8),vx:rand(-220,-80),vy:rand(-90,90),life:rand(.25,.5),max:.5,size:rand(2,5)})}
  window.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();queueFlap()}});canvas.addEventListener('pointerdown',e=>{e.preventDefault();queueFlap()});

  function resetRun(){sim=newSim();flapFrames=[];flapSet=new Set();lastFlapFrame=-9999;lastScore=0;updateProgress(0);visualY=360;visualVY=-120;ended=false;resultOverlay.classList.add('hidden');claimCard.classList.add('hidden');copyProofBtn.classList.add('hidden');retryBtn.classList.add('hidden')}
  function runCountdown(){if(!authUser)return;ensureAudio();resetRun();startBtn.disabled=true;startOverlay.classList.add('hide');let n=3;const pop=()=>{countdown.textContent=n>0?n:'GO';countdown.classList.remove('pop');void countdown.offsetWidth;countdown.classList.add('pop');tone(n>0?280+n*80:720,.14,'square',.025,30);if(n===0){setTimeout(()=>{running=true;startBtn.disabled=false},280);return}n--;setTimeout(pop,650)};pop()}
  startBtn.onclick=runCountdown;
  function lose(reason){if(ended)return;running=false;ended=true;sfxCrash();shake=18;showResult(false,reason)}
  function toBase36Big(v){return BigInt(v).toString(36)}
  function encodeFlaps(frames){let prev=0;return frames.map((f,i)=>{const d=i===0?f:f-prev;prev=f;return d.toString(36)}).join('.')}
  function makeProof(endFrame){return `S5P1|${challenge}|${toBase36Big(authUser.id)}|${endFrame.toString(36)}|${encodeFlaps(flapFrames)}`}
  function win(endFrame){if(ended)return;running=false;ended=true;sfxWin();const proof=makeProof(endFrame);showResult(true,'',proof)}
  function showResult(win,reason,proof=''){resultOverlay.classList.remove('hidden');resultIcon.textContent=win?'✦':'×';resultKicker.textContent=win?'CHALLENGE CLEARED':'RUN TERMINATED';resultTitle.textContent=win?'YOU WON':'GAME OVER';resultTitle.style.color=win?'#74ff33':'#fff';resultBody.textContent=win?`You reached ${sim.score}/${target}. Copy the Win Proof, return to the Discord panel, press CLAIM WIN and paste it. The bot will replay your entire run before giving the prize.`:`Score ${sim?.score||0}/${target}. ${reason} Reload or re-authorise to try again.`;if(win){claimCard.classList.remove('hidden');copyProofBtn.classList.remove('hidden');retryBtn.classList.add('hidden');proofCode.value=proof;roleText.textContent='Copy this proof → return to Discord → press CLAIM WIN → paste it.'}else{claimCard.classList.add('hidden');copyProofBtn.classList.add('hidden');retryBtn.classList.remove('hidden')}}
  retryBtn.onclick=()=>{resultOverlay.classList.add('hidden');startOverlay.classList.remove('hide');};
  copyProofBtn.onclick=async()=>{try{await navigator.clipboard.writeText(proofCode.value);copyProofBtn.querySelector('span').textContent='COPIED — GO TO DISCORD';setTimeout(()=>copyProofBtn.querySelector('span').textContent='COPY WIN PROOF',1800)}catch(_){proofCode.select();document.execCommand('copy')}};
  discordBtn.onclick=()=>{window.open('https://discord.com/app','_blank','noopener')};

  function pointBurst(){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on');scorePulse=1;gatePulse=1;for(let i=0;i<28;i++)sparks.push({x:WORLD.birdX+45,y:visualY,vx:rand(-80,340),vy:rand(-230,230),life:rand(.3,.9),max:.9,size:rand(1,5)});if(lastScore>0&&(lastScore===10||lastScore===25||lastScore===50||lastScore===75||lastScore%100===0)){milestone.textContent=`${lastScore} // KEEP GOING`;milestone.classList.remove('on');void milestone.offsetWidth;milestone.classList.add('on')}}
  function resize(){const dpr=Math.min(2,window.devicePixelRatio||1),r=canvas.getBoundingClientRect();canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(canvas.width/WORLD.w,0,0,canvas.height/WORLD.h,0,0)}window.addEventListener('resize',resize);setTimeout(resize,0);
  function drawBackground(t,dt,speed){const g=ctx.createLinearGradient(0,0,0,WORLD.h);g.addColorStop(0,'#071008');g.addColorStop(.55,'#020604');g.addColorStop(1,'#000201');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.w,WORLD.h);ctx.save();ctx.globalAlpha=.35;for(let i=0;i<28;i++){const x=(i*83-(t*speed*.055)%(83*2)+WORLD.w)%(WORLD.w+100)-50,h=90+(i%7)*34;ctx.fillStyle=i%3===0?'#07130a':'#050b06';ctx.fillRect(x,WORLD.h-h,52,h);ctx.fillStyle='rgba(90,255,28,.12)';for(let y=WORLD.h-h+12;y<WORLD.h-8;y+=18)ctx.fillRect(x+9,y,2,5)}ctx.restore();for(const s of stars){s.x-=dt*(20+speed*.06)*s.z;if(s.x<0){s.x=WORLD.w;s.y=rand(0,WORLD.h)}s.tw+=dt*2;ctx.globalAlpha=.14+.38*s.z*(.6+.4*Math.sin(s.tw));ctx.fillStyle=s.z>.7?'#afff82':'#5eff21';ctx.fillRect(s.x,s.y,1+s.z*2,.6+s.z)}ctx.globalAlpha=1;ctx.save();ctx.strokeStyle='rgba(96,255,31,.065)';ctx.lineWidth=1;const horizon=WORLD.h*.72;for(let i=0;i<16;i++){const p=i/15,y=horizon+(WORLD.h-horizon)*Math.pow(p,1.8);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.w,y);ctx.stroke()}for(let x=-WORLD.w;x<WORLD.w*2;x+=100){ctx.beginPath();ctx.moveTo(WORLD.w/2,horizon);ctx.lineTo(x,WORLD.h);ctx.stroke()}ctx.restore();ctx.save();for(const f of fog){f.x-=dt*f.s;if(f.x+f.r<0)f.x=WORLD.w+f.r;const rg=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r);rg.addColorStop(0,`rgba(77,255,22,${f.a})`);rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.fillRect(f.x-f.r,f.y-f.r,f.r*2,f.r*2)}ctx.restore()}
  function drawGate(o,t){const x=o.x,gapY=o.gapY,gapH=o.gapH,w=96,topH=gapY-gapH/2,bottomY=gapY+gapH/2,glow=12+gatePulse*10;function body(y,h,flip){if(h<=0)return;ctx.save();ctx.shadowColor='#63ff20';ctx.shadowBlur=glow;const grad=ctx.createLinearGradient(x,0,x+w,0);grad.addColorStop(0,'#071008');grad.addColorStop(.45,'#142119');grad.addColorStop(.55,'#071009');grad.addColorStop(1,'#020503');ctx.fillStyle=grad;ctx.fillRect(x,y,w,h);ctx.shadowBlur=0;ctx.strokeStyle='rgba(116,255,57,.72)';ctx.lineWidth=3;ctx.strokeRect(x+2,y,w-4,h);ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1;ctx.strokeRect(x+9,y+1,w-18,h-2);ctx.save();ctx.beginPath();ctx.rect(x+5,y,w-10,h);ctx.clip();for(let yy=y-60+(t*90)%34;yy<y+h+60;yy+=34){ctx.fillStyle='rgba(104,255,38,.07)';ctx.beginPath();ctx.moveTo(x+9,yy);ctx.lineTo(x+w-9,yy-18);ctx.lineTo(x+w-9,yy-10);ctx.lineTo(x+9,yy+8);ctx.fill()}ctx.restore();ctx.fillStyle='#64ff20';const lipY=flip?y+h-16:y;ctx.fillRect(x-12,lipY,w+24,16);ctx.fillStyle='#d5ffc2';ctx.fillRect(x-8,lipY+(flip?2:12),w+16,2);ctx.restore()}body(0,topH,true);body(bottomY,WORLD.h-bottomY,false)}
  function drawBird(t){const x=WORLD.birdX,y=visualY;trail.push({x:x-18,y:y+rand(-3,3),life:.45,size:rand(5,14)});if(trail.length>70)trail.shift();for(const p of trail){p.life-=1/60;ctx.globalAlpha=clamp(p.life/.45,0,1)*.22;ctx.fillStyle='#61ff20';ctx.beginPath();ctx.arc(p.x-(.45-p.life)*100,p.y,p.size*(p.life/.45),0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;const bob=Math.sin(t*18)*2;ctx.save();ctx.translate(x,y+bob);ctx.rotate(clamp(visualVY/900,-.38,.48));ctx.shadowColor='#62ff20';ctx.shadowBlur=30;ctx.fillStyle='rgba(101,255,36,.32)';ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-55,-18-Math.sin(t*22)*8);ctx.lineTo(-30,8);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-8,4);ctx.lineTo(-46,28+Math.sin(t*22)*7);ctx.lineTo(-24,8);ctx.closePath();ctx.fill();const rg=ctx.createRadialGradient(-5,-7,2,0,0,28);rg.addColorStop(0,'#efffe7');rg.addColorStop(.18,'#a9ff7a');rg.addColorStop(.55,'#1d6f12');rg.addColorStop(1,'#061006');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#b9ff98';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#081006';ctx.font='1000 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('S5',0,1);ctx.restore()}
  function updateParticles(dt){for(const p of sparks){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt}sparks=sparks.filter(p=>p.life>0);for(const p of sparks){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.life>.15?'#aaff7a':'#e6ffdc';ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.globalAlpha=1}
  function frame(now){const dt=Math.min(.05,(now-lastFrame)/1000||.016);lastFrame=now;const t=now/1000;const d=difficulty(sim?.score||0);if(running&&!ended){acc=Math.min(acc+dt,.20);while(acc>=DT&&running&&!ended){stepSim();acc-=DT}}else acc=0;drawBackground(t,dt,d.speed);if(sim)for(const o of sim.obstacles)drawGate(o,t);if(!running&&sim){visualVY+=(sim.vy-visualVY)*.15;visualY+=(sim.y-visualY)*.2}drawBird(t);updateParticles(dt);gatePulse=Math.max(0,gatePulse-dt*3);scorePulse=Math.max(0,scorePulse-dt*4);requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
  startOverlay.classList.add('hide');finishDiscordAuth();
})();