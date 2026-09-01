/* Stills for the turntable.
 *
 * Each is cell 0 of the corresponding sheet, at that sheet's cell resolution,
 * so a still and the sheet's first frame are pixel-identical.  That is the
 * whole point: the still can then overlap the live sheet for as long as it
 * takes the sheet to decode without any visible seam - no upscale softening,
 * no halo where a soft edge extends past a sharp one.
 *
 *   thumb.png  128px, from sprite-t.png   the card at 88px
 *   still.png  340px, from sprite.png     the completion figure at 344px
 */
var sharp=require('/tmp/claude-1000/-home-danzbodula/2ab31edb-c4de-48f2-be22-a1ac349c80b8/scratchpad/tools/node_modules/sharp');
var fs=require('fs'), path=require('path');
var ROOT=path.join(__dirname,'..','assets','hair-render');
var HERO_CELL=340, CARD_CELL=128;

(async function(){
  var ids=fs.readdirSync(ROOT).filter(function(d){return fs.statSync(path.join(ROOT,d)).isDirectory();}).sort();
  for(var i=0;i<ids.length;i++){
    var d=path.join(ROOT,ids[i]);
    await sharp(path.join(d,'sprite-t.png'))
      .extract({left:0,top:0,width:CARD_CELL,height:CARD_CELL})
      .png({palette:true,quality:90,effort:8}).toFile(path.join(d,'thumb.png'));
    await sharp(path.join(d,'sprite.png'))
      .extract({left:0,top:0,width:HERO_CELL,height:HERO_CELL})
      .png({palette:true,quality:90,effort:8}).toFile(path.join(d,'still.png'));
    console.log('  '+ids[i].padEnd(8)+
      'thumb '+CARD_CELL+'px '+Math.round(fs.statSync(path.join(d,'thumb.png')).size/1024)+'KB   '+
      'still '+HERO_CELL+'px '+Math.round(fs.statSync(path.join(d,'still.png')).size/1024)+'KB');
  }
})().catch(function(e){console.error(e.stack);});
