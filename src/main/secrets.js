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
  '8afa857eeac9b8c86b2ddd5c1d6b2a4b741e5cad5d7c5edf16a448e0294333cb': 'battlefx',
  'fc55effc29603ccd646912cfcec556e761570777b0bb96f1ef6544f9ec01c07e': 'evolution',
  '35344ee34b8d2ee655e2509952890e8f99218e2272d6ff61b77877f23a93d452': 'quiz',
  'aebacd58458d19c80a6a76ca425b02397f92fff3876d80734ee2aa607e856a26': 'catchgame',
  '501c8c549c43abaf1ad8af1151f6e947136a2756444816ba84f0a1c1538387fb': 'memory',
  'b20c47a23d742e126d7466c3b685fa274c3f283194979b98de8d1a84febbd028': 'whack',
  'd6dde6b78972b5ebdec01fb0b242f85965d2fb0856062e213de8b8ecf55463b5': 'typequiz',
  'a237266f7de214aa9a8f397d0de82f56d98fcfae92476993783b079d4d01c055': 'rps',
  'c549f4b4f9c84ec6464b67e62d67be8f0b936335e84a1c458d66cb13deee9e20': 'voltorbflip',
  '76132fb5a501cb5ecabb265edc6769929e7459b366c55c2bcaefc5f06440d05a': 'echo',
  '60e59ea518e188c7c08383632be3a27554a68e13ff5787019c5969dda1258cf6': 'shuffle',
  '44d8c8e2038692ccab0dec2399014d221191bb565d93a53d7ef4a6708054ecb0': 'jump',
  'babd84de4184f5c12cc457e7933c90beba52208f9a62d6297d16fb1f6f9bab5b': 'puzzle',
  '9290e22d054663e59e75467b2ff519c42fdd819ea147a1beb11c52a4d8c62fd6': 'shinyhunt',
  'd519416ffd4288cb059743e0f8c6ec9c703921f063afe5ea08b77ddc2b090283': 'quickattack',
  'd50463f0a73611cef776c9b1155c9fc5a68d65544e1d882cd560a4e28a24c251': 'lights',
  'e6fddcfbe7b486c3eb1b62b949d126687e766697cb3e9149026d4a0d5caaf184': 'ditto',
  'bf130e2a9f09700d62bba89f8ae7e5cf9d61afdb0d0bf50441793dadeadc00cf': 'puzzlehint',
  'ec8f904c9ec07b6569a1ff3555f03969d348c84fabb4f3c98d20919cdfe26433': 'teamplay'
};

/** "word arg arg" → { cmd, args } (cmd null when the word isn't one). */
function parse(text) {
  const [word = '', ...args] = String(text || '').trim().toLowerCase().split(/\s+/);
  return { cmd: COMMANDS[sha(word)] || null, args };
}

module.exports = { parse };
