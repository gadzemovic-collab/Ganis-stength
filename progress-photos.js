/* Rep Harbor progress photos — offline, private IndexedDB storage. */
(()=>{
"use strict";
const DB_NAME="rep-harbor-progress-photos", STORE="photos";
const angles=["Front","Side","Back"];
const $=id=>document.getElementById(id);
let database, activeURLs=[], comparisonURLs=[];
function openDB(){
 if(database)return Promise.resolve(database);
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:"id"});};
  req.onsuccess=()=>{database=req.result;resolve(database);};
  req.onerror=()=>reject(req.error);
 });
}
async function allPhotos(){
 const db=await openDB();
 return new Promise((resolve,reject)=>{const q=db.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
}
async function putPhoto(photo){
 const db=await openDB();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(photo);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error("Photo storage interrupted"));});
}
async function removePhoto(id){
 const db=await openDB();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error("Photo storage interrupted"));});
}
function shrink(file){
 return new Promise((resolve,reject)=>{
  const img=new Image(), url=URL.createObjectURL(file);
  img.onload=()=>{
   URL.revokeObjectURL(url);
   const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement("canvas");
   canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
   canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
   canvas.toBlob(blob=>blob?resolve(blob):reject(Error("Could not process photo")),"image/jpeg",0.8);
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Unable to read image"));};
  img.src=url;
 });
}
function clearURLs(){activeURLs.forEach(URL.revokeObjectURL);activeURLs=[];}
function photoURL(blob){const u=URL.createObjectURL(blob);activeURLs.push(u);return u;}
function dateLabel(date){return new Date(date+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});}
function opt(value,label){const el=document.createElement("option");el.value=value;el.textContent=label;return el;}
async function render(){
 const photos=(await allPhotos()).sort((a,b)=>b.date.localeCompare(a.date)||angles.indexOf(a.angle)-angles.indexOf(b.angle));
 clearURLs();
 const gallery=$("rhPhotoGallery");gallery.replaceChildren();
 if(!photos.length){const p=document.createElement("p");p.className="muted";p.textContent="No photos yet. Add a front, side, or back photo to a weigh-in date.";gallery.append(p);}
 for(const p of photos){
  const card=document.createElement("div");card.className="rh-photo-tile";
  const img=document.createElement("img");img.src=photoURL(p.blob);img.alt=p.angle+" progress photo on "+dateLabel(p.date);img.loading="lazy";
  const caption=document.createElement("div");caption.textContent=dateLabel(p.date)+" · "+p.angle;
  const del=document.createElement("button");del.type="button";del.className="secondary small";del.textContent="Delete";
  del.onclick=async()=>{
   if(!confirm("Delete this progress photo?"))return;
   try{await removePhoto(p.id);await render();}
   catch(error){$("rhPhotoStatus").textContent="Photo could not be deleted.";console.error(error);}
  };
  card.append(img,caption,del);gallery.append(card);
 }
 for(const side of ["A","B"]){
  const sel=$("rhCompare"+side),old=sel.value;sel.replaceChildren();
  sel.append(opt("","Choose photo"));
  photos.forEach(p=>sel.append(opt(p.id,dateLabel(p.date)+" · "+p.angle)));
  if(photos.some(p=>p.id===old))sel.value=old;
  else if(photos.length)sel.value=photos[side==="A"?Math.min(1,photos.length-1):0].id;
 }
 updateComparison(photos);
}
let cached=[];
async function updateComparison(photos){
 cached=photos||cached;
 comparisonURLs.forEach(URL.revokeObjectURL);comparisonURLs=[];
 for(const side of ["A","B"]){
  const target=$("rhCompareImg"+side),p=cached.find(p=>p.id===$("rhCompare"+side).value);
  target.replaceChildren();
  if(p){const img=document.createElement("img");img.src=URL.createObjectURL(p.blob);comparisonURLs.push(img.src);img.alt=p.angle+" on "+dateLabel(p.date);target.append(img);}
 }
}
function init(){
 const form=$("weeklyWeightForm");if(!form)return;
 const wrapper=document.createElement("div");wrapper.className="card rh-progress-photos";
 wrapper.innerHTML='<h2>Progress photos <span class="weight-optional">Optional</span></h2><p class="muted">Save front, side or back photos with your weigh-in date. Photos stay on this device, even offline. They are not included in app data exports.</p><div class="rh-photo-controls"><label for="rhPhotoAngle">View</label><select id="rhPhotoAngle"><option>Front</option><option>Side</option><option>Back</option></select><button type="button" id="rhPhotoChoose" class="secondary rh-upload-label">Add photo</button><input id="rhPhotoInput" type="file" accept="image/*" hidden></div><p id="rhPhotoStatus" class="muted" aria-live="polite"></p><div id="rhPhotoGallery" class="rh-photo-gallery"></div><h3>Compare photos</h3><div class="rh-compare-selects"><select id="rhCompareA" aria-label="First comparison photo"></select><select id="rhCompareB" aria-label="Second comparison photo"></select></div><div class="rh-compare-images"><div id="rhCompareImgA"></div><div id="rhCompareImgB"></div></div>';
 const log=$("weeklyWeightLog");log.closest(".card").insertAdjacentElement("afterend",wrapper);
 $("rhPhotoChoose").onclick=()=>$("rhPhotoInput").click();
 $("rhPhotoInput").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  const date=$("weeklyWeightDate").value,angle=$("rhPhotoAngle").value,status=$("rhPhotoStatus");
  if(!date){status.textContent="Choose a weigh-in date first.";e.target.value="";return;}
  status.textContent="Saving photo…";
  try{
   const blob=await shrink(file),id=date+"|"+angle;
   await putPhoto({id,date,angle,blob,createdAt:Date.now()});
   status.textContent="Photo saved on this device for "+dateLabel(date)+".";
   await render();
  }catch(err){status.textContent="Photo could not be saved. Check available device storage.";console.error(err);}
  e.target.value="";
 });
 ["A","B"].forEach(side=>$("rhCompare"+side).addEventListener("change",()=>updateComparison()));
 render().catch(err=>{$("rhPhotoStatus").textContent="Photo storage is unavailable in this browser.";console.error(err);});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();