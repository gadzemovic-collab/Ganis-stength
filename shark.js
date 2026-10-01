let sharkPlayback=null,sharkFramesPromise=null,sharkPlaybackGeneration=0;
function stopSharkAnimation(){sharkPlaybackGeneration++;cancelAnimationFrame(sharkPlayback);sharkPlayback=null;}
// Remove only navy pixels connected to the outer background; retain dark interior details.
function clearSharkBackground(pixels,width,height){
 const visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
 function add(index){if(visited[index])return;visited[index]=1;const i=index*4;if(pixels[i]<20&&pixels[i+1]<70&&pixels[i+2]<115){pixels[i+3]=0;queue[tail++]=index;}}
 for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
 for(let y=1;y<height-1;y++){add(y*width);add(y*width+width-1);}
 while(head<tail){const index=queue[head++],x=index%width,y=Math.floor(index/width);if(x)add(index-1);if(x<width-1)add(index+1);if(y)add(index-width);if(y<height-1)add(index+width);}
 return pixels;
}
function prepareSharkFrame(image){
 const surface=document.createElement('canvas');surface.width=320;surface.height=320;
 const context=surface.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
 const data=context.getImageData(0,0,320,320);clearSharkBackground(data.data,320,320);context.putImageData(data,0,0);return surface;
}
async function startSharkAnimation(){
 stopSharkAnimation();const generation=sharkPlaybackGeneration;
 const canvas=document.getElementById('sharkCanvas'),fallback=document.getElementById('welcomeShark');
 canvas.hidden=true;fallback.hidden=false;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 try{
  sharkFramesPromise??=fetch('shark-frames.json?v=1').then(r=>{if(!r.ok)throw Error('Shark frames unavailable');return r.json();}).then(frames=>Promise.all(frames.map(async frame=>{const image=new Image();image.src=frame.src;await image.decode();return {...frame,image:prepareSharkFrame(image)};}))).catch(error=>{sharkFramesPromise=null;throw error;});
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
