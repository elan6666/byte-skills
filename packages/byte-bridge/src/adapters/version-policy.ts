import { BridgeError } from '../protocol/errors.js';

/** Version labels are hints. Native protocol checks decide compatibility. */
export function versionCore(label:string):number[]|null {
 const match=/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?=[^\d.]|$)/.exec(label.trim());
 if(!match)return null;
 const parts=match.slice(1).map(Number);
 return parts.every(Number.isSafeInteger)?parts:null;
}
export function requireMinimumVersion(harness:string,actual:string,minimum:string):void {
 const found=versionCore(actual),base=versionCore(minimum);
 // Development labels still get a native handshake instead of a version-only veto.
 if(!found || !base)return;
 for(let i=0;i<3;i++){
  const actualPart=found[i]??0,basePart=base[i]??0;
  if(actualPart>basePart)return;
  if(actualPart<basePart)throw new BridgeError('runtime_version_too_old',harness+' requires version >= '+minimum+'; found '+actual,'Update the native runtime; newer labels are checked through the actual protocol',3);
 }
}
