import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {locateCore} from './locate.mjs';
export const name='sessionbridge-command';
export const inject=['tools','commands'];
export function apply(ctx){
 const core=locateCore(dirname(fileURLToPath(import.meta.url)));
 ctx.effect(async()=>{const {registerDshCommand}=await import(pathToFileURL(join(core,'dist/src/adapters/dsh/command.js')).href);return registerDshCommand(ctx);},'sessionbridge-command');
}
