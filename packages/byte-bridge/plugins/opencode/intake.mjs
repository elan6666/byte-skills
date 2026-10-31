/** Remove an inbox entry only after validation and durable acceptance succeed. */
export async function receiveNative(queue,readStatus,publish,allowed=()=>true){
 while(queue.length){
  if(!allowed())return null;
  const e=queue[0];if(Date.parse(e.expires_at)<=Date.now()){queue.shift();continue;}
  const status=await readStatus(e);
  if(Date.parse(e.expires_at)<=Date.now()){queue.shift();continue;}
  if(!allowed())return null;
  if(status.cancel_pending || ['cancelled','cancel_requested'].includes(status.task?.state)){queue.shift();continue;}
  await publish(e);queue.shift();return e;
 }
 return null;
}
