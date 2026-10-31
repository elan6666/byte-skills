import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderCommandReference,describeContracts} from '../dist/src/cli/command-contracts.js';
import {HARNESSES,SKILLS} from '../dist/src/install/plan.js';
import {checkSkillCopies} from './lib/skill-files.mjs';
try{
 let root=dirname(dirname(fileURLToPath(import.meta.url))),write=false;
 for(let i=2;i<process.argv.length;i++){const arg=process.argv[i];if(arg==='--write')write=true;else if(arg==='--root' && process.argv[i+1])root=resolve(process.argv[++i]);else throw new Error('Unknown contract check option: '+arg);}
 const schemaPath=join(root,'plugins/hermes/request.schema.json'),schemaExpected=JSON.stringify(describeContracts('hermes.native').contracts[0].schema,null,2)+'\n';
 if(write){mkdirSync(dirname(schemaPath),{recursive:true});writeFileSync(schemaPath,schemaExpected);}
 else if(!existsSync(schemaPath) || readFileSync(schemaPath,'utf8')!==schemaExpected)throw new Error('Stale Hermes native tool schema; run npm run generate:contracts');
 const path=join(root,'skills/sessionbridge-do/references/commands.generated.md'),expected=renderCommandReference();
 if(write){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,expected);console.log(JSON.stringify({state:'generated',path}));}
 else{
  if(!existsSync(path) || readFileSync(path,'utf8')!==expected)throw new Error('Stale generated command reference: '+path+'; 重新生成: npm run generate:contracts');
  const copies=checkSkillCopies(root,HARNESSES,SKILLS);console.error(JSON.stringify({state:'passed',contracts:describeContracts().contracts.length,harnesses:HARNESSES.length,files_checked:copies}));
 }
}catch(error){console.error(error.message);process.exitCode=1;}
