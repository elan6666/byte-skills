import{test}from'node:test';import assert from'node:assert/strict';import{spawn}from'node:child_process';import{once}from'node:events';import{mkdtempSync,existsSync,lstatSync,rmSync}from'node:fs';import{join,resolve}from'node:path';import{runDaemon}from'../../src/cli/daemon.js';import{deliveryLab}from'../helpers/delivery-lab.js';import{projectEndpoint}from'../../src/core/endpoint.js';import{issueSessionCapability}from'../../src/transport/auth.js';import{BridgeClient}from'../../src/transport/client.js';

test('a_killed_owned_daemon_reclaims_its_refused_socket_and_preserves_state',async t=>{
 const f=await deliveryLab(t),dir=mkdtempSync('/tmp/sb-restart-'),socket=join(dir,'core.sock');const script=`const{runDaemon}=await import(${JSON.stringify('file://'+resolve('dist/src/cli/daemon.js'))});await runDaemon(process.argv[1],process.argv[2]);process.send('ready');`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,f.root,socket],{stdio:['ignore','ignore','pipe','ipc']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});});
 const ready=await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('daemon failed to start')})]);assert.equal(ready[0],'ready');const prior=projectEndpoint(f.root);assert.ok(prior);const ended=once(child,'exit');child.kill('SIGKILL');await ended;assert.equal(existsSync(socket),true);
 const restarted=await runDaemon(f.root,socket,f.registry);t.after(()=>restarted.close());
 // Filesystems may reuse an inode after unlink; prove the new owner and IPC instead.
 assert.equal(lstatSync(socket).isSocket(),true);const current=projectEndpoint(f.root);assert.equal(current?.pid,process.pid);assert.notEqual(current?.nonce,prior.nonce);
 const token=issueSessionCapability(f.store,f.actor),reply=await new BridgeClient({socketPath:socket,token}).call(f.actor,'get_task_status',{task_id:f.task.task_id}) as {task:{task_id:string}};assert.equal(reply.task.task_id,f.task.task_id);assert.equal(f.store.db.prepare('select count(*) n from tasks').get()?.n,1);
});
test('an_unowned_socket_is_never_removed_by_daemon_start',async t=>{
 const f=await deliveryLab(t),dir=mkdtempSync('/tmp/sb-unknown-'),socket=join(dir,'unknown.sock');const{createServer}=await import('node:net');const server=createServer();await new Promise<void>(resolve=>server.listen(socket,resolve));const inode=lstatSync(socket).ino;t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});});
 await assert.rejects(()=>runDaemon(f.root,socket,f.registry),/daemon|socket|已有|内核/i);assert.equal(lstatSync(socket).ino,inode);
});
test('a_live_project_core_keeps_its_socket_when_a_second_start_is_attempted',async t=>{
 const f=await deliveryLab(t),dir=mkdtempSync('/tmp/sb-live-core-'),socket=join(dir,'core.sock'),first=await runDaemon(f.root,socket,f.registry);t.after(async()=>{await first.close();rmSync(dir,{recursive:true,force:true});});const inode=lstatSync(socket).ino;await assert.rejects(()=>runDaemon(f.root,socket,f.registry),/running|已有|内核/i);assert.equal(lstatSync(socket).ino,inode);
});
