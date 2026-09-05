const fs = require('fs');
const files = ['cannes_palme','cannes_palme_extended','cannes_grand_prix','venice_golden_lion','berlin_golden_bear'];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(f+'.json','utf8'));
    const ids = d.map(x=>x.imdbId);
    const dupes = ids.filter((id,i)=>ids.indexOf(id)!==i);
    process.stdout.write(f+': '+d.length+' entries'+(dupes.length?' DUPES:'+dupes.join(','):' OK')+'\n');
  } catch(e) { process.stdout.write(f+': ERROR '+e.message+'\n'); }
}
