// Hidden commands. Only hashes are kept here, so the words themselves aren't in the source.
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const COMMANDS = {
  'f888af7e8876c57245ccc2000612101b809f9232efbbf48a530ee4c487c41174': 'berries',
  'b0798993dc88fae49b8eebedbb0b1e6757d7d3a15841af4ad8f6f02cfca91b4a': 'hatch',
  'c927f769f9b7c6a2391c43fd6b702dbd0dc55d1b34ba0ffe792998dbe246e867': 'shiny',
  '62307224e3c28e177fa62f4a8ab6988226ed10b68b0c32513d88903e8d3223b2': 'return',
  '5dcfa8298f5a409f61b33c879f80276ec63724d4e6b6a3f9d1a423a44480ae7d': 'battle',
  '5f91878bc4dbc355306fbf80bc6cb4a3282b4c17c049f0e5528722c7cc30b5a9': 'win',
  '89daadd83375c3bc31be5d85d578c2f9b9285bf945b0eb79901242c21791aa43': 'catch',
  'ad66dc8cce6b0b3c93b820c32f70bd8e584c4db896ca0f10a1810e1b623e4f47': 'fishing',
  '7865ea6c656f619cc6821f555213260a0c8cd4cd57879179900ffa9ab28aecbe': 'update',
  'd357527e18864d84b43a71899b8c09738b0b474af4ef898252c1127d5381c3f1': 'forecast',
  '8afa857eeac9b8c86b2ddd5c1d6b2a4b741e5cad5d7c5edf16a448e0294333cb': 'battlefx'
};

/** "word arg arg" → { cmd, args } (cmd null when the word isn't one). */
function parse(text) {
  const [word = '', ...args] = String(text || '').trim().toLowerCase().split(/\s+/);
  return { cmd: COMMANDS[sha(word)] || null, args };
}

module.exports = { parse };
