const assert = require('assert');
const feathers = require('@feathersjs/feathers');
const jwt = require('jsonwebtoken');

const AuthenticationBase = require('../lib/base');
const { Strategy1, Strategy2 } = require('./fixtures');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('authentication/base', () => {
  let app, auth;

  beforeEach(() => {
    app = feathers();
    auth = new AuthenticationBase(app, {
      secret: 'supersecret'
    });
    
    auth.register('first', new Strategy1());
    auth.register('second', new Strategy2());
  });

  it('configuration', () => {
    assert.strictEqual(auth.configuration.entity, 'user');
    assert.deepStrictEqual(auth.configuration, app.authentication);
  });

  describe('strategies', () => {
    it('strategyNames', () => {
      assert.deepStrictEqual(auth.strategyNames, [ 'first', 'second' ]);
    });

    it('getStrategies', () => {
      const first = auth.getStrategies('first');
      const invalid = auth.getStrategies('first', 'invalid', 'second');

      assert.strictEqual(first.length, 1);
      assert.strictEqual(invalid.length, 3);
      assert.strictEqual(invalid[1], undefined);
    });

    it('calls setName, setApplication and setAuthentication if available', () => {
      const [ first ] = auth.getStrategies('first');

      assert.strictEqual(first.name, 'first');
      assert.strictEqual(first.app, app);
      assert.strictEqual(first.authentication, auth);
    });
  });

  describe('authenticate', () => {
    describe('with strategy set in params', () => {
      it('returns first success', () => {
        return auth.authenticate({
          strategy: 'first',
          username: 'David'
        }, 'first', 'second').then(result => {
          assert.deepStrictEqual(result, Strategy1.result);
        });
      });

      it('returns error when failed', () => {
        return auth.authenticate({
          strategy: 'first',
          username: 'Steve'
        }, 'first', 'second').then(() => {
          assert.fail('Should never get here');
        }).catch(error => {
          assert.strictEqual(error.name, 'NotAuthenticated');
          assert.strictEqual(error.message, 'Invalid Dave');
        });
      });

      it('returns second success', () => {
        return auth.authenticate({
          strategy: 'second',
          v2: true,
          password: 'supersecret'
        }, 'first', 'second').then(result => {
          assert.deepStrictEqual(result, Strategy2.result);
        });
      });

      it('returns first success when both strategies succeed', () => {
        return auth.authenticate({
          both: true
        }, ...auth.strategyNames).then(result => {
          assert.deepStrictEqual(result, Strategy1.result);
        });
      });

      it('throws error when allowed and passed strategy does not match', () => {
        return auth.authenticate({
          strategy: 'first',
          username: 'Dummy'
        }, 'second').then(() =>
          assert.fail('Should never get here')
        ).catch(error => {
          assert.strictEqual(error.name, 'NotAuthenticated');
          assert.strictEqual(error.message, `Invalid authentication strategy 'first'`);
        });
      });
    });

    describe('with a list of strategies and strategy not set in params', () => {
      it('returns first success in chain', () => {
        return auth.authenticate({
          v2: true,
          password: 'supersecret'
        }, 'first', 'second').then(result => {
          assert.deepStrictEqual(result, Strategy2.result);
        });
      });

      it('returns first error when all strategies fail', () => {
        return auth.authenticate({}, 'first', 'second').then(() => {
          assert.fail('Should never get here');
        }).catch(error => {
          assert.strictEqual(error.name, 'NotAuthenticated');
          assert.strictEqual(error.message, 'Invalid Dave');
        });
      });

      it('errors when there is no valid strategy', () => {
        return auth.authenticate({}, 'bla').then(() => {
          assert.fail('Should never get here');
        }).catch(error => {
          assert.strictEqual(error.name, 'NotAuthenticated');
          assert.strictEqual(error.message, 'No valid authentication strategy available');
        });
      });
    });
  });

  describe('parse', () => {
    it('errors when no names are given', () => {
      return auth.parse({}).then(() => {
        assert.fail('Should never get here');
      }).catch(error => {
        assert.strictEqual(error.message, 'Authentication HTTP parser needs at least one allowed strategy');
      });
    });

    it('successfully parses a request (first)', () => {
      return auth.parse({
        isDave: true
      }, {}, 'first', 'second').then(result => {
        assert.deepStrictEqual(result, Strategy1.result);
      });
    });

    it('successfully parses a request (second)', () => {
      return auth.parse({
        isV2: true
      }, {}, 'first', 'second').then(result => {
        assert.deepStrictEqual(result, Strategy2.result);
      });
    });

    it('null when no success', () => {
      return auth.parse({}, {}, 'first', 'second').then(result => {
        assert.strictEqual(result, null);
      });
    });
  });

  describe('jwt', () => {
    const message = 'Some payload';

    describe('createJWT', () => {
      it('errors with no payload', () => {
        return auth.createJWT()
          .then(() => assert.fail('Should never get here'))
          .catch(error => {
            assert.strictEqual(error.message, 'payload is required');
          });
      });
  
      it('with default options', () => {
        const message = 'Some payload';
  
        return auth.createJWT({ message }).then(accessToken => {
          assert.ok(typeof accessToken === 'string');
  
          const decoded = jwt.decode(accessToken);
          const options = auth.configuration;
  
          assert.strictEqual(decoded.message, message, 'Set payload');
          assert.ok(UUID.test(decoded.jti), 'Set `jti` to default UUID');
          assert.strictEqual(decoded.aud, options.jwt.audience);
          assert.strictEqual(decoded.iss, options.jwt.issuer);
        });
      });
  
      it('with default and overriden options', () => {
        const overrides = {
          issuer: 'someoneelse',
          audience: 'people',
          jwtid: 'something'
        };
  
        return auth.createJWT({ message }, overrides).then(accessToken => {
          assert.ok(typeof accessToken === 'string');
  
          const decoded = jwt.decode(accessToken);
  
          assert.strictEqual(decoded.message, message, 'Set payload');
          assert.strictEqual(decoded.jti, 'something');
          assert.strictEqual(decoded.aud, overrides.audience);
          assert.strictEqual(decoded.iss, overrides.issuer);
        });
      });
  
      it('errors with invalid options', () => {
        const overrides = {
          algorithm: 'fdjsklfsndkl'
        };
  
        return auth.createJWT({}, overrides)
          .then(() => assert.fail('Should never get here'))
          .catch(error => {
            assert.strictEqual(error.message, '"algorithm" must be a valid string enum value');
          });
      });
    });
  
    describe('verifyJWT', () => {
      let validToken, expiredToken;
  
      beforeEach(() => auth.createJWT({ message }).then(vt => {
        validToken = vt;
  
        return auth.createJWT({}, {
          expiresIn: '1ms'
        }).then(et => {
          expiredToken = et;
        });
      }));
  
      it('returns payload when token is valid', () => {
        return auth.verifyJWT(validToken).then(payload => {
          assert.strictEqual(payload.message, message);
        });
      });
  
      it('errors when custom algorithm property does not match', () => {
        return auth.verifyJWT(validToken, {
          algorithm: [ 'HS512' ]
        }).then(() => assert.fail('Should never get here')).catch(error => {
          assert.strictEqual(error.message, 'invalid algorithm');
        });
      });
  
      it('errors when algorithms property does not match', () => {
        return auth.verifyJWT(validToken, {
          algorithms: [ 'HS512' ]
        }).then(() => assert.fail('Should never get here')).catch(error => {
          assert.strictEqual(error.message, 'invalid algorithm');
        });
      });
  
      it('errors when secret is different', () => {
        return auth.verifyJWT(validToken, {}, 'fdjskl')
          .then(() => assert.fail('Should never get here'))
          .catch(error => {
            assert.strictEqual(error.message, 'invalid signature');
          });
      });
  
      it('errors when other custom options do not match', () => {
        return auth.verifyJWT(validToken, { issuer: 'someonelse' })
          .then(() => assert.fail('Should never get here'))
          .catch(error => {
            assert.ok(/jwt issuer invalid/.test(error.message));
          });
      });
  
      it('errors when token is expired', () => {
        return auth.verifyJWT(expiredToken)
          .then(() => assert.fail('Should never get here'))
          .catch(error => {
            assert.strictEqual(error.message, 'jwt expired');
          });
      });
    });
  });
});
