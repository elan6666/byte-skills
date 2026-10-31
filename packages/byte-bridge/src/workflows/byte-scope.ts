import{matchesGlob,posix}from'node:path';
/** Conservative intersection: a directory scope includes descendants, not just itself. */
export function byteWriteOverlapsFrozen(write:string,frozen:string):boolean{
 const w=posix.normalize(write.replaceAll('\\','/')),f=posix.normalize(frozen.replaceAll('\\','/'));if(w==='.'||f==='.')return true;
 if(matchesGlob(w,f)||matchesGlob(f,w))return true;const glob=/[?*\[{}()!]/,wp=w.split(glob)[0]!.replace(/\/$/,''),fp=f.split(glob)[0]!.replace(/\/$/,'');
 if(!wp||!fp)return true;if(!glob.test(w)&&!glob.test(f))return wp===fp||wp.startsWith(fp+'/')||fp.startsWith(wp+'/');
 // Unknown glob suffixes cannot justify permission. Disjoint literal prefixes can.
 return wp.startsWith(fp)||fp.startsWith(wp);
}
