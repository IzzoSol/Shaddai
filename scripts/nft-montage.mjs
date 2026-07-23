import sharp from 'sharp';
import fs from 'fs';
const dir='backend/data/collectables/images';
const files=fs.readdirSync(dir).filter(f=>/\.png$/i.test(f)).sort();
const cell=200, cols=10, pad=3, lab=20;
// two readable halves: 0-49 and 50-99
async function build(list, offset, out){
  const rows=Math.ceil(list.length/cols);
  const W=cols*cell, H=rows*(cell+lab);
  const composites=[];
  for(let i=0;i<list.length;i++){
    const gi=offset+i;
    const x=(i%cols)*cell, y=Math.floor(i/cols)*(cell+lab);
    try{
      const buf=await sharp(`${dir}/${list[i]}`).resize(cell-pad*2,cell-pad*2,{fit:'cover'}).png().toBuffer();
      composites.push({input:buf,left:x+pad,top:y+pad});
      const label=list[i].replace('.png','').slice(0,20);
      const svg=`<svg width="${cell}" height="${lab}"><rect width="${cell}" height="${lab}" fill="#0a0e12"/><text x="3" y="15" font-size="14" font-family="monospace" fill="#9fe">${gi}:${label}</text></svg>`;
      composites.push({input:Buffer.from(svg),left:x,top:y+cell-pad});
    }catch(e){}
  }
  await sharp({create:{width:W,height:H,channels:3,background:'#0a0e12'}}).composite(composites).png().toFile(out);
  console.log(out+' ('+W+'x'+H+')');
}
await build(files.slice(0,50),0,'scripts/nft-montage-A.png');
await build(files.slice(50,100),50,'scripts/nft-montage-B.png');
console.log('total files: '+files.length);
