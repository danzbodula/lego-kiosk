/* Regenerate the static card thumbnail from frame 0 of each new sheet, so the
   card does not visibly jump the moment the turntable starts. */
var sharp=require('/tmp/claude-1000/-home-danzbodula/2ab31edb-c4de-48f2-be22-a1ac349c80b8/scratchpad/tools/node_modules/sharp');
var fs=require('fs'), path=require('path');
var ROOT=path.join(__dirname,'..','assets','hair-render');
var CELL=340, THUMB=176;
(async function(){
  var ids=fs.readdirSync(ROOT).filter(function(d){return fs.statSync(path.join(ROOT,d)).isDirectory();}).sort();
  for(var i=0;i<ids.length;i++){
    var d=path.join(ROOT,ids[i]);
    await sharp(path.join(d,'sprite.png'))
      .extract({left:0,top:0,width:CELL,height:CELL})
      .resize(THUMB,THUMB,{kernel:'lanczos3'})
      .png({palette:true,quality:90,effort:8})
      .toFile(path.join(d,'thumb.png'));
    console.log('  '+ids[i].padEnd(8)+'thumb.png regenerated from sheet frame 0');
  }
})().catch(function(e){console.error(e.stack);});
