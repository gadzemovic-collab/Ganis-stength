let sharkPlayback=null,sharkFramesPromise=null,sharkPlaybackGeneration=0;
function stopSharkAnimation(){sharkPlaybackGeneration++;cancelAnimationFrame(sharkPlayback);sharkPlayback=null;}
async function startSharkAnimation(){
 stopSharkAnimation();const generation=sharkPlaybackGeneration;
 const canvas=document.getElementById('sharkCanvas'),fallback=document.getElementById('welcomeShark');
 canvas.hidden=true;fallback.hidden=false;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 try{
  sharkFramesPromise??=fetch('shark-frames.json?v=1').then(r=>{if(!r.ok)throw Error('Shark frames unavailable');return r.json();}).then(frames=>Promise.all(frames.map(async frame=>{const image=new Image();image.src=frame.src;await image.decode();return {...frame,image};}))).catch(error=>{sharkFramesPromise=null;throw error;});
  const frames=await sharkFramesPromise;if(generation!==sharkPlaybackGeneration)return;
  const context=canvas.getContext('2d'),duration=frames.reduce((sum,f)=>sum+f.duration,0),floor=Math.max(...frames.map(f=>f.floor));
  let started=null,last=-1;
  function draw(time){
   if(generation!==sharkPlaybackGeneration)return;
   started??=time;const position=(time-started)%duration;let elapsed=0,index=frames.length-1;
   for(let i=0;i<frames.length;i++){elapsed+=frames[i].duration;if(position<elapsed){index=i;break;}}
   if(index!==last){const frame=frames[index];context.clearRect(0,0,320,320);context.drawImage(frame.image,0,floor-frame.floor);last=index;}
   sharkPlayback=requestAnimationFrame(draw);
  }
  fallback.hidden=true;canvas.hidden=false;sharkPlayback=requestAnimationFrame(draw);
 }catch(error){canvas.hidden=true;fallback.hidden=false;}
}
