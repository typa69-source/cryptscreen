const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
const begin = source.indexOf('const EMAIL_RE');
const finish = source.indexOf('// POST /api/auth/register', begin);
assert.ok(begin >= 0 && finish > begin, 'actual auth validation function must be found');
const context = vm.createContext({});
vm.runInContext(source.slice(begin, finish), context);

function validate(body) {
  let status;
  let payload;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };
  const result = context.validateEmailPassword({ body }, response);
  return { result, status, payload };
}

for (const [label, body] of [
  ['numeric password', { email: 'test@example.com', password: 123456 }],
  ['array password', { email: 'test@example.com', password: ['a', 'b', 'c', 'd', 'e', 'f'] }],
  ['object password', { email: 'test@example.com', password: { length: 6 } }],
  ['array email', { email: ['test@example.com'], password: 'abcdef' }],
  ['null body', null],
  ['missing body', undefined],
]) {
  test('auth rejects ' + label + ' as a client error', () => {
    let output;
    assert.doesNotThrow(() => { output = validate(body); });
    assert.equal(output.result, null, 'invalid values must not reach bcrypt or database calls');
    assert.equal(output.status, 400);
    assert.equal(typeof output.payload.error, 'string');
  });
}

test('valid credentials retain email normalization and password', () => {
  const output = validate({ email: ' TEST@Example.com ', password: 'abcdef' });
  assert.equal(output.result.email, 'test@example.com');
  assert.equal(output.result.password, 'abcdef');
  assert.equal(output.status, undefined);
});
