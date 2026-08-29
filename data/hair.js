/* ---------------------------------------------------------------------------
 * data/hair.js  --  the single source of truth for hairstyles.
 *
 * Adding, removing, renaming or reordering a style requires editing ONLY this
 * file.  Nothing in index.html, the CSS, or the other JS names a style.
 *
 * Each entry:
 *   id       folder name under assets/hair/<id>/ and assets/placeholder/hair-<id>.svg
 *   name     the label printed on the card (uppercase, kept short - it must fit
 *            226px of card at 17px/600)
 *   angles   frame order for the turntable.  Files are assets/hair/<id>/<angle>.png
 *
 * Physical part identity, for the hardware layer and for re-ordering stock:
 *   element  LEGO element ID (part + colour) - the number on the packing list
 *   design   LEGO/BrickLink design ID (the mould, any colour)
 *   part     BrickLink part name
 *   color    the REAL LEGO colour of that element, resolved from the element ID
 *            through Studio's elementInfoList.json and colour table - not
 *            eyeballed.  Note that BROWN, AUBURN and LONG are all genuinely
 *            Reddish Brown, and BLACK and CURLY are both genuinely Black: those
 *            styles are told apart by mould, not by colour.  The turntable
 *            renders show the difference; a colour swatch could not.
 *
 * The robot layer can resolve a selection to a physical part with
 * App.styleById(styleId).element  -  see README, "Integration surface".
 *
 * A style may optionally carry  thumb: false  to force the grid card to use
 * front.png instead of the smaller thumb.png.
 * ------------------------------------------------------------------------ */

var HAIR_STYLES = [
  { id: 'brown',  name: 'BROWN',  color: '#582A12',
    element: '6438262', design: '103748pb01',
    part: 'Hair Swept Left with Side Part, Molded Cochlear Implant',
    angles: ['front', 'front45', 'side', 'back'] },

  { id: 'blonde', name: 'BLONDE', color: '#E4CD9E',
    element: '6093519', design: '87991',
    part: 'Hair Tousled with Side Part',
    angles: ['front', 'front45', 'side', 'back'] },

  { id: 'auburn', name: 'AUBURN', color: '#582A12',
    element: '6123038', design: '21268',
    part: 'Hair Short Swept Back with Sideburns and Widow\'s Peak',
    angles: ['front', 'front45', 'side', 'back'] },

  { id: 'ginger', name: 'GINGER', color: '#A95500',
    element: '6310817', design: '36037',
    part: 'Hair Female Mid-Length Combed Behind Ear',
    angles: ['front', 'front45', 'side', 'back'] },

  { id: 'long',   name: 'LONG',   color: '#582A12',
    element: '4506003', design: '59363',
    part: 'Hair Female Mid-Length with Braid Around Sides',
    angles: ['front', 'front45', 'side', 'back'] },

  { id: 'black',  name: 'BLACK',  color: '#05131D',
    element: '4653226', design: '99930',
    part: 'Hair Short Combed Sideways Part Left',
    angles: ['front', 'front45', 'side', 'back'] },

  // NB: a Friends mini-doll mould, not a standard minifigure part - it fits the
  // minifigure head fine, but order it by element ID, not by browsing minifig hair.
  { id: 'curly',  name: 'CURLY',  color: '#05131D',
    element: '6409770', design: '2646',
    part: 'Mini Doll Hair Short with Curls and Pompadour',
    angles: ['front', 'front45', 'side', 'back'] },

  { id: 'cap',    name: 'CAP',    color: '#C91A09',
    element: '6032178', design: '11303',
    part: 'Headgear Cap - Short Curved Bill with Seams and Hole on Top',
    angles: ['front', 'front45', 'side', 'back'] }
];
