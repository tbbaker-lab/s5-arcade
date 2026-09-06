(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const targetEl = document.getElementById('target');
  const playerEl = document.getElementById('playerName');
  const difficultyEl = document.getElementById('difficulty');
  const rewardEl = document.getElementById('rewardText');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const pill = document.getElementById('connectionPill');
  const startOverlay = document.getElementById('startOverlay');
  const startBtn = document.getElementById('startBtn');
  const countdown = document.getElementById('countdown');
  const flash = document.getElementById('flash');
  const milestone = document.getElementById('milestone');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultIcon = document.getElementById('resultIcon');
  const resultKicker = document.getElementById('resultKicker');
  const resultTitle = document.getElementById('resultTitle');
  const resultBody = document.getElementById('resultBody');
  const claimCard = document.getElementById('claimCard');
  const claimCode = document.getElementById('claimCode');
  const roleText = document.getElementById('roleText');
  const discordBtn = document.getElementById('discordBtn');
  const soundBtn = document.getElementById('soundBtn');
  const authOverlay = document.getElementById('authOverlay');
  const discordLoginBtn = document.getElementById('discordLoginBtn');
  const authTarget = document.getElementById('authTarget');
  const authReward = document.getElementById('authReward');
  const authText = document.getElementById('authText');
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/,''));
  const guildId = params.get('guild') || '';
  const campaign = params.get('campaign') || '';
  const apiBase = (params.get('api') || window.S5_API_BASE || '').trim().replace(/\/+$/,'');
  const sessionStoreKey = `s5_arcade_session:${guildId}:${campaign}:${apiBase}`;
  let sessionToken = hash.get('session') || sessionStorage.getItem(sessionStoreKey) || '';
  if(hash.get('session')){
    sessionStorage.setItem(sessionStoreKey, hash.get('session'));
    history.replaceState(null,'',location.pathname + location.search);
  }


  const WORLD = { w: 1280, h: 720, birdX: 285 };
  let ws, hello = null, state = null, running = false, ended = false, lastStateAt = performance.now();
  let visualY = 360, visualVY = 0, lastFrame = performance.now(), shake = 0, scorePulse = 0, soundOn = true;
  let lastScore = 0, trail = [], sparks = [], stars = [], fog = [], rings = [], gatePulse = 0;

  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  for(let i=0;i<150;i++) stars.push({x:rand(0,WORLD.w),y:rand(0,WORLD.h),z:rand(.2,1),tw:rand(0,6.28)});
  for(let i=0;i<12;i++) fog.push({x:rand(-300,WORLD.w),y:rand(50,WORLD.h-80),r:rand(100,280),s:rand(6,18),a:rand(.012,.035)});

  let audioCtx = null;
  function ensureAudio(){ if(!soundOn) return null; if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
  function tone(freq=440,dur=.08,type='sine',gain=.05,slide=0){
    const a=ensureAudio(); if(!a) return; const t=a.currentTime, o=a.createOscillator(), g=a.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+dur+.02);
  }
  function sfxFlap(){tone(300,.09,'triangle',.035,180)} function sfxPoint(){tone(690,.08,'sine',.04,240);setTimeout(()=>tone(940,.07,'sine',.025,100),45)}
  function sfxCrash(){tone(150,.26,'sawtooth',.05,-80);setTimeout(()=>tone(80,.38,'square',.025,-30),70)} function sfxWin(){[440,554,659,880].forEach((f,i)=>setTimeout(()=>tone(f,.3,'sine',.045,90),i*120))}

  soundBtn.onclick=()=>{soundOn=!soundOn;soundBtn.textContent=`SOUND: ${soundOn?'ON':'OFF'}`;if(soundOn)ensureAudio()};
  discordBtn.onclick=()=>{ if(document.referrer && document.referrer.includes('discord')) history.back(); else window.close(); };

  function setConnection(text,mode){pill.classList.remove('online','offline');if(mode)pill.classList.add(mode);pill.querySelector('span').textContent=text}
  function apiUrl(path){
    if(!apiBase) throw new Error('The S5 bot API address is missing. Open the game from the Discord panel.');
    const u = new URL(apiBase, location.href);
    if(location.protocol==='https:' && u.protocol==='http:') throw new Error('The bot API needs HTTPS when the game is on GitHub Pages.');
    u.pathname = (u.pathname.replace(/\/+$/,'') + path).replace(/\/{2,}/g,'/');
    u.search='';u.hash='';return u;
  }
  async function loadCampaign(){
    if(!guildId || !campaign || !apiBase){
      authTarget.textContent='—'; authReward.textContent='Open from Discord';
      authText.textContent='This page needs a game campaign link from the S5 Customs Discord.';
      discordLoginBtn.disabled=true; setConnection('WAITING FOR DISCORD','offline'); return;
    }
    try{
      const u=apiUrl('/api/campaign');u.search=new URLSearchParams({guild:guildId,campaign}).toString();
      const r=await fetch(u.toString(),{cache:'no-store'});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Campaign unavailable');
      authTarget.textContent=`${data.target} PTS`;authReward.textContent=data.reward;rewardEl.textContent=data.reward;targetEl.textContent=data.target;
      if(data.winner_role)authText.textContent=`Connect Discord to enter. Beat the target and the bot automatically gives you the ${data.winner_role} role.`;
      setConnection('DISCORD LOGIN REQUIRED','');
    }catch(err){authText.textContent=err?.message||'Could not load the challenge.';discordLoginBtn.disabled=true;setConnection('API OFFLINE','offline')}
  }
  discordLoginBtn.onclick=()=>{
    try{const u=apiUrl('/auth/discord');u.search=new URLSearchParams({guild:guildId,campaign}).toString();location.href=u.toString()}
    catch(err){authText.textContent=err?.message||'Could not start Discord login.'}
  };
  function websocketUrl(){
    const u=apiUrl('/ws');
    if(u.protocol==='https:')u.protocol='wss:';else if(u.protocol==='http:')u.protocol='ws:';
    u.search=new URLSearchParams({session:sessionToken}).toString();return u.toString();
  }
  function connect(){
    if(!sessionToken){authOverlay.classList.remove('hidden');loadCampaign();return}
    authOverlay.classList.add('hidden');
    let socketUrl;try{socketUrl=websocketUrl()}catch(err){showError(err?.message||'Could not build the secure game connection.');return}
    ws=new WebSocket(socketUrl);
    ws.onopen=()=>setConnection('DISCORD VERIFIED','online');
    ws.onclose=()=>{if(!ended)setConnection('DISCONNECTED','offline')};
    ws.onerror=()=>setConnection('CONNECTION ERROR','offline');
    ws.onmessage=(ev)=>{let m;try{m=JSON.parse(ev.data)}catch{return}handleMessage(m)};
  }
  function handleMessage(m){
    if(m.type==='hello'){
      hello=m; WORLD.w=m.width||1280; WORLD.h=m.height||720; visualY=WORLD.h/2;
      playerEl.textContent=(m.player||'PLAYER').toUpperCase(); targetEl.textContent=m.target; rewardEl.textContent=m.reward; updateProgress(0,m.target);
    } else if(m.type==='state'){
      state=m;lastStateAt=performance.now();
      if(Math.abs(visualY-m.y)>150)visualY=m.y;
      visualVY=m.vy;
      updateDifficulty(m.score,m.target,m.gap,m.speed);
    } else if(m.type==='started'){ running=true; }
    else if(m.type==='point'){
      if(m.score!==lastScore){lastScore=m.score;scoreEl.textContent=m.score;updateProgress(m.score,hello?.target||m.target);pointBurst();sfxPoint();}
    } else if(m.type==='gameover'){running=false;ended=true;sfxCrash();shake=18;showResult(false,m)}
    else if(m.type==='win'){running=false;ended=true;sfxWin();showResult(true,m)}
    else if(m.type==='already_won'){ended=true;showError(`${m.message}${m.claimCode?` Claim code: ${m.claimCode}`:''}`)}
    else if(m.type==='error'){ended=true;showError(m.message||'Game server error.')}
  }
  function updateProgress(score,target){const p=clamp(score/Math.max(1,target),0,1);progressFill.style.width=`${p*100}%`;progressText.textContent=`${Math.floor(p*100)}%`;scoreEl.textContent=score}
  function updateDifficulty(score,target,gap,speed){const p=score/Math.max(1,target);difficultyEl.textContent=p>.82?'NIGHTMARE':p>.58?'EXTREME':p>.30?'SAVAGE':'BRUTAL';difficultyEl.style.color=p>.7?'#a9ff7d':'#d9ffca'}

  function runCountdown(){
    ensureAudio(); startBtn.disabled=true; startOverlay.classList.add('hide'); let n=3;
    const pop=()=>{countdown.textContent=n>0?n:'GO';countdown.classList.remove('pop');void countdown.offsetWidth;countdown.classList.add('pop');tone(n>0?280+n*80:720,.14,'square',.025,30);if(n===0){setTimeout(()=>{ws?.send(JSON.stringify({type:'start'}));running=true},300);return}n--;setTimeout(pop,720)};pop();
  }
  startBtn.onclick=()=>{if(ws?.readyState===1&&hello&&!ended)runCountdown()};

  function flapInput(){
    if(!running||ended||!ws||ws.readyState!==1)return; ensureAudio(); ws.send(JSON.stringify({type:'flap'})); visualVY=-610; sfxFlap();
    for(let i=0;i<9;i++)sparks.push({x:WORLD.birdX-20,y:visualY+rand(-8,8),vx:rand(-220,-80),vy:rand(-90,90),life:rand(.25,.5),max:.5,size:rand(2,5)});
  }
  window.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();flapInput()}});
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();flapInput()});

  function pointBurst(){
    flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on');scorePulse=1;gatePulse=1;
    for(let i=0;i<28;i++)sparks.push({x:WORLD.birdX+45,y:visualY,vx:rand(-80,340),vy:rand(-230,230),life:rand(.3,.9),max:.9,size:rand(1,5)});
    if(lastScore>0 && (lastScore===10||lastScore===25||lastScore===50||lastScore===75||lastScore%100===0)){
      milestone.textContent=`${lastScore} // KEEP GOING`;milestone.classList.remove('on');void milestone.offsetWidth;milestone.classList.add('on');
    }
  }
  function showResult(win,m){
    resultOverlay.classList.remove('hidden');resultIcon.textContent=win?'✦':'×';resultKicker.textContent=win?'CHALLENGE CLEARED':'RUN TERMINATED';resultTitle.textContent=win?'YOU WON':'GAME OVER';
    resultTitle.style.color=win?'#74ff33':'#fff';resultBody.textContent=win?`You reached ${m.score}/${m.target}. Your prize has been recorded by the S5 bot.`:`Score ${m.score}/${m.target}. ${m.reason||'One collision ended the run.'} Reload the page to try again with the same Discord login.`;
    if(win){claimCard.classList.remove('hidden');claimCode.textContent=m.claimCode||'RECORDED';roleText.textContent=m.roleText||''} else claimCard.classList.add('hidden');
  }
  function showError(msg){setConnection('LINK INVALID','offline');resultOverlay.classList.remove('hidden');resultIcon.textContent='!';resultKicker.textContent='S5 ARCADE';resultTitle.textContent='CAN’T START';resultBody.textContent=msg;claimCard.classList.add('hidden')}

  function resize(){const dpr=Math.min(2,window.devicePixelRatio||1);const r=canvas.getBoundingClientRect();canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(canvas.width/WORLD.w,0,0,canvas.height/WORLD.h,0,0)}
  window.addEventListener('resize',resize);setTimeout(resize,0);

  function drawBackground(t,dt,speed){
    const g=ctx.createLinearGradient(0,0,0,WORLD.h);g.addColorStop(0,'#071008');g.addColorStop(.55,'#020604');g.addColorStop(1,'#000201');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.w,WORLD.h);
    // animated distant vertical architecture
    ctx.save();ctx.globalAlpha=.35;for(let i=0;i<28;i++){const x=(i*83-(t*speed*.055)%(83*2)+WORLD.w)%(WORLD.w+100)-50;const h=90+(i%7)*34;ctx.fillStyle=i%3===0?'#07130a':'#050b06';ctx.fillRect(x,WORLD.h-h,52,h);ctx.fillStyle='rgba(90,255,28,.12)';for(let y=WORLD.h-h+12;y<WORLD.h-8;y+=18)ctx.fillRect(x+9,y,2,5)}ctx.restore();
    // star streaks
    for(const s of stars){s.x-=dt*(20+speed*.06)*s.z;if(s.x<0){s.x=WORLD.w;s.y=rand(0,WORLD.h)}s.tw+=dt*2;ctx.globalAlpha=.14+.38*s.z*(.6+.4*Math.sin(s.tw));ctx.fillStyle=s.z>.7?'#afff82':'#5eff21';ctx.fillRect(s.x,s.y,1+s.z*2,.6+s.z)}ctx.globalAlpha=1;
    // ground perspective grid
    ctx.save();ctx.strokeStyle='rgba(96,255,31,.065)';ctx.lineWidth=1;const horizon=WORLD.h*.72;for(let i=0;i<16;i++){const p=i/15;const y=horizon+(WORLD.h-horizon)*Math.pow(p,1.8);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.w,y);ctx.stroke()}for(let x=-WORLD.w;x<WORLD.w*2;x+=100){ctx.beginPath();ctx.moveTo(WORLD.w/2,horizon);ctx.lineTo(x,WORLD.h);ctx.stroke()}ctx.restore();
    // fog orbs
    ctx.save();for(const f of fog){f.x-=dt*f.s;if(f.x+f.r<0)f.x=WORLD.w+f.r;const rg=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r);rg.addColorStop(0,`rgba(77,255,22,${f.a})`);rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.fillRect(f.x-f.r,f.y-f.r,f.r*2,f.r*2)}ctx.restore();
  }

  function drawGate(ob,t,speed){
    const x=ob.x; const gapY=ob.gapY, gapH=ob.gapH, w=96; const topH=gapY-gapH/2, bottomY=gapY+gapH/2;
    const glow=12+gatePulse*10;
    function body(y,h,flip){ if(h<=0)return;
      ctx.save();ctx.shadowColor='#63ff20';ctx.shadowBlur=glow;const grad=ctx.createLinearGradient(x,x+w,0,0);grad.addColorStop(0,'#071008');grad.addColorStop(.45,'#142119');grad.addColorStop(.55,'#071009');grad.addColorStop(1,'#020503');ctx.fillStyle=grad;ctx.fillRect(x,y,w,h);ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(116,255,57,.72)';ctx.lineWidth=3;ctx.strokeRect(x+2,y,w-4,h);ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1;ctx.strokeRect(x+9,y+1,w-18,h-2);
      // moving energy ribs
      ctx.save();ctx.beginPath();ctx.rect(x+5,y,w-10,h);ctx.clip();for(let yy=y-60+(t*90)%34;yy<y+h+60;yy+=34){ctx.fillStyle='rgba(104,255,38,.07)';ctx.beginPath();ctx.moveTo(x+9,yy);ctx.lineTo(x+w-9,yy-18);ctx.lineTo(x+w-9,yy-10);ctx.lineTo(x+9,yy+8);ctx.fill()}ctx.restore();
      ctx.fillStyle='#64ff20';const lipY=flip?y+h-16:y;ctx.fillRect(x-12,lipY,w+24,16);ctx.fillStyle='#d5ffc2';ctx.fillRect(x-8,lipY+(flip?2:12),w+16,2);ctx.restore();
    }
    body(0,topH,true);body(bottomY,WORLD.h-bottomY,false);
    // danger markers
    ctx.save();ctx.globalAlpha=.35+.25*Math.sin(t*6+x*.02);ctx.fillStyle='#8cff52';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x+w/2-12+i*12,topH-8);ctx.lineTo(x+w/2-6+i*12,topH-15);ctx.lineTo(x+w/2+i*12,topH-8);ctx.fill();ctx.beginPath();ctx.moveTo(x+w/2-12+i*12,bottomY+8);ctx.lineTo(x+w/2-6+i*12,bottomY+15);ctx.lineTo(x+w/2+i*12,bottomY+8);ctx.fill()}ctx.restore();
  }

  function drawBird(t){
    const x=WORLD.birdX,y=visualY;trail.push({x:x-18,y:y+rand(-3,3),life:.45,size:rand(5,14)});if(trail.length>70)trail.shift();
    for(const p of trail){p.life-=1/60;ctx.globalAlpha=clamp(p.life/.45,0,1)*.22;ctx.fillStyle='#61ff20';ctx.beginPath();ctx.arc(p.x-(.45-p.life)*100,p.y,p.size*(p.life/.45),0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
    const bob=Math.sin(t*18)*2;ctx.save();ctx.translate(x,y+bob);const tilt=clamp(visualVY/900,-.38,.48);ctx.rotate(tilt);ctx.shadowColor='#62ff20';ctx.shadowBlur=30;
    // wings
    ctx.fillStyle='rgba(101,255,36,.32)';ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-55,-18-Math.sin(t*22)*8);ctx.lineTo(-30,8);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-8,4);ctx.lineTo(-46,28+Math.sin(t*22)*7);ctx.lineTo(-24,8);ctx.closePath();ctx.fill();
    // core
    const rg=ctx.createRadialGradient(-5,-7,2,0,0,28);rg.addColorStop(0,'#efffe7');rg.addColorStop(.18,'#a9ff7a');rg.addColorStop(.55,'#1d6f12');rg.addColorStop(1,'#061006');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#b9ff98';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#081006';ctx.font='1000 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('S5',0,1);ctx.restore();
  }

  function updateParticles(dt){for(const p of sparks){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt}sparks=sparks.filter(p=>p.life>0);for(const p of sparks){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.life>.15?'#aaff7a':'#e6ffdc';ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.globalAlpha=1}

  function frame(now){
    const dt=Math.min(.033,(now-lastFrame)/1000||.016);lastFrame=now;const t=now/1000;
    const speed=state?.speed||390;drawBackground(t,dt,speed);
    if(state){
      // local visual prediction between authoritative server snapshots
      if(running){visualVY+=1720*dt;visualY+=visualVY*dt;visualY=clamp(visualY,15,WORLD.h-15)}
      const follow=1-Math.pow(.001,dt);visualY += (state.y-visualY)*follow*.22;visualVY += (state.vy-visualVY)*follow*.15;
      const elapsed=(performance.now()-lastStateAt)/1000;const predicted=state.obstacles.map(o=>({...o,x:o.x-state.speed*elapsed}));
      for(const ob of predicted)drawGate(ob,t,state.speed);
    }
    drawBird(t);updateParticles(dt);gatePulse=Math.max(0,gatePulse-dt*3);scorePulse=Math.max(0,scorePulse-dt*4);
    if(shake>0){shake=Math.max(0,shake-dt*30)}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);connect();
})();
