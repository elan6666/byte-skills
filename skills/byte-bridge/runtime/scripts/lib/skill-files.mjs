import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
export const digest=data=>createHash('sha256').update(data).digest('hex');
export function skillFiles(root,prefix=''){
 const files=[];
 for(const entry of readdirSync(join(root,prefix),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(entry.name==='__pycache__' || entry.name.endsWith('.pyc'))continue;
  if(entry.isSymbolicLink())throw new Error('Skill reference must not be a symlink: '+join(root,prefix,entry.name));
  const name=prefix?prefix+'/'+entry.name:entry.name;
  if(entry.isDirectory())files.push(...skillFiles(root,name));else if(entry.isFile())files.push({path:name,sha256:digest(readFileSync(join(root,name)))});
 }
 return files;
}
export function checkSkillCopies(root,harnesses,names){
 let count=0;
 for(const name of names){const expected=skillFiles(join(root,'skills',name));
  for(const harness of harnesses){const relative='plugins/'+harness+'/skills/'+name,actual=skillFiles(join(root,relative));
   for(const file of expected)if(actual.find(a=>a.path===file.path)?.sha256!==file.sha256)throw new Error('Skill reference differs: '+relative+'/'+file.path);
   for(const file of actual)if(!expected.some(e=>e.path===file.path))throw new Error('Unexpected packaged Skill file: '+relative+'/'+file.path);
   count+=expected.length;
  }
 }
 return count;
}
