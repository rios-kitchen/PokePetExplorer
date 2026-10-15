// Hidden commands. Only hashes are kept here, so the words themselves aren't in the source.
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const COMMANDS = {
  'f888af7e8876c57245ccc2000612101b809f9232efbbf48a530ee4c487c41174': 'berries',
  'b0798993dc88fae49b8eebedbb0b1e6757d7d3a15841af4ad8f6f02cfca91b4a': 'hatch',
  'c927f769f9b7c6a2391c43fd6b702dbd0dc55d1b34ba0ffe792998dbe246e867': 'shiny',
  '62307224e3c28e177fa62f4a8ab6988226ed10b68b0c32513d88903e8d3223b2': 'return'
};

/** "word arg arg" → { cmd, args } (cmd null when the word isn't one). */
function parse(text) {
  const [word = '', ...args] = String(text || '').trim().toLowerCase().split(/\s+/);
  return { cmd: COMMANDS[sha(word)] || null, args };
}

module.exports = { parse };
