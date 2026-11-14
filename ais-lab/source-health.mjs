const target=document.getElementById("providerQuality");
function describe(data,now=Date.now()){
  if(!data || data.version!==1 || !data.checkedAt)return "لم تتوفر بيانات فحص مستقلة بعد.";
  const age=Math.round((now-Date.parse(data.checkedAt))/60000);
  if(!Number.isFinite(age)||age<0||age>150)
    return "بيانات فحص المصدر قديمة أو غير موثوقة زمنيًا ("+(Number.isFinite(age)?age:"?")+" دقيقة). لا تعتمد على حالة الاتصال.";
  const health=data.health?.reachable?"متاح":"غير متاح";
  const count=Number.isInteger(data.snapshot?.distinctMmsiCount)?String(data.snapshot.distinctMmsiCount):"غير متاح";
  return "آخر فحص مستقل (UTC): "+data.checkedAt+
    " | حالة الخدمة العامة: "+health+
    " | MMSI ظهرت في لقطة المنطقة: "+count+
    " | التغطية مقابل عبور الهيئة: غير متحقق منها"+
    (data.errors?.length?" | ملاحظات المصدر: "+data.errors.join("; "):"")+
    " | هذا ليس عدد السفن العابرة.";
}
async function refreshSourceHealth(){
try{
  const res=await fetch("../data/ais-source-health.json?ts="+Date.now(),{cache:"no-store"});
  if(!res.ok)throw Error("no diagnostic published");
  const data=await res.json();
  target.textContent=describe(data);
}catch{
  target.textContent="الفحص المستقل لم ينشر بيانات بعد، أو تعذر تحميلها. لا يوجد دليل على سلامة التغطية.";
}
}
refreshSourceHealth();
setInterval(refreshSourceHealth, 5*60*1000);

