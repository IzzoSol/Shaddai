const hosts=["https://huggingface.co","https://api-inference.huggingface.co","https://router.huggingface.co","https://fal.run","https://queue.fal.run"];
for(const h of hosts){
  try{ const r=await fetch(h,{method:"GET"}); console.log(h,"->",r.status); }
  catch(e){ console.log(h,"-> FAIL",e.cause?.code||e.message); }
}
