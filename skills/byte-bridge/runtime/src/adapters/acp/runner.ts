// Private process-group anchor. The native agent may crash before its children;
// keep this owned leader alive until the connector explicitly closes the group.
import {spawn} from 'node:child_process';
const [binary,...args]=process.argv.slice(2);if(!binary)throw new Error('Native executable required');
const child=spawn(binary,args,{stdio:'pipe',env:process.env,cwd:process.cwd()});
const hold=setInterval(()=>{},1000);
let stopping=false;
const stopOwnedGroup=()=>{if(stopping)return;stopping=true;child.stdin.end();setTimeout(()=>{try{process.kill(-process.pid,'SIGKILL');}catch{process.exit(1);}},500);};
process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout,{end:false});child.stderr.pipe(process.stderr,{end:false});
child.stdin.on('error',()=>{});
const exited=(reason:string)=>{process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'sessionbridge/runtime_exit',params:{reason}})+'\n');};
child.once('error',()=>exited('native_start_failed'));child.once('exit',()=>exited('native_exit'));
process.stdin.once('end',stopOwnedGroup);process.stdin.once('error',stopOwnedGroup);
process.stdout.on('error',stopOwnedGroup);
process.stderr.on('error',stopOwnedGroup);
process.once('exit',()=>clearInterval(hold));
