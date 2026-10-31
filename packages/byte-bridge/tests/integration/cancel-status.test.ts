import {test} from 'node:test';import assert from 'node:assert/strict';
import {deliveryLab} from '../helpers/delivery-lab.js';
import {runDaemon} from '../../src/cli/daemon.js';
import {BridgeClient} from '../../src/transport/client.js';
import {issueSessionCapability} from '../../src/transport/auth.js';
test('status exposes durable cancellation even when already-delivered task remains ready',async t=>{
 const lab=await deliveryLab(t);const delivered=await lab.service.send(lab.actor,lab.envelope);assert.equal(delivered.state,'transport_confirmed');
 const daemon=await runDaemon(lab.root,undefined,lab.registry);t.after(()=>daemon.close());const client=new BridgeClient({socketPath:daemon.address,token:issueSessionCapability(lab.store,lab.actor)});
 await client.call(lab.actor,'request',{operation:'cancel_pending',request_id:'cancel-original',task_id:lab.task.task_id});
 const status=await client.call(lab.actor,'get_task_status',{task_id:lab.task.task_id}) as {task:{state:string};cancel_pending:boolean};assert.equal(status.task.state,'ready');assert.equal(status.cancel_pending,true);
});
