'use strict';

var _ = require('lodash'),
  filename = __filename.split('/').pop().split('.').shift(),
  lib = require('./' + filename),
  db = require('./db'),
  expect = require('chai').expect,
  sinon = require('sinon'),
  bluebird = require('bluebird'),
  log = require('./log'),
  filter = require('through2-filter'),
  createMockReq = require('../test/fixtures/mocks/req'),
  createMockRes = require('../test/fixtures/mocks/res');

describe(_.startCase(filename), function () {
  var sandbox;

  /**
   * Shortcut
   *
   * @param res
   * @param code
   */
  function expectStatus(res, code) {
    sandbox.mock(res).expects('status').withArgs(code).returns(res).atLeast(1);
  }

  /**
   * Shortcut
   */
  function expectNoLogging() {
    var logExpectations = sandbox.mock(log);
    logExpectations.expects('info').never();
    logExpectations.expects('warn').never();
    logExpectations.expects('error').never();
  }

  /**
   * Shortcut
   *
   * @param res
   * @param expected
   * @param done
   */
  function expectResult(res, expected, done) {
    sandbox.stub(res, 'send', function (result) {
      sandbox.verify();
      expect(result).to.deep.equal(expected);
      done();
    });
  }

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('removeQueryString', function () {
    var fn = lib[this.title];

    it('basic case', function () {
      expect(fn('something?something')).to.equal('something');
    });
  });

  describe('removeExtension', function () {
    var fn = lib[this.title];

    it('basic case', function () {
      expect(fn('something.something')).to.equal('something');
    });
  });

  describe('notImplemented', function () {
    var fn = lib[this.title];

    it('sends 501', function (done) {
      var res = createMockRes();

      expectNoLogging();
      expectStatus(res, 501);
      expectResult(res, 'sendStatus: whatever', done);
      fn({}, res);
    });
  });

  describe('methodNotAllowed', function () {
    var fn = lib[this.title];

    it('blocks when not allowed', function (done) {
      var allowed = ['something'],
        req = createMockReq(),
        res = createMockRes({formatter: 'json'});
      req.method = 'somethingElse';

      expectNoLogging();
      expectStatus(res, 405);
      expectResult(res, {
        allow: allowed,
        code: 405,
        message: 'Method somethingElse not allowed'
      }, done);
      fn({allow: allowed})(req, res);
    });

    it('does not block when allowed', function (done) {
      var req = createMockReq(),
        res = createMockRes({formatter: 'json'});
      req.method = 'something';

      expectNoLogging();
      fn({allow: ['something']})(req, res, done);
    });
  });

  describe('expectJSON', function () {
    var fn = lib[this.title];

    it('sends json', function (done) {
      var data = {},
        res = createMockRes({formatter: 'json'});

      expectNoLogging();
      expectResult(res, data, done);
      fn(function () {
        return data;
      }, res);
    });

    it('404s on Error "not found"', function (done) {
      var res = createMockRes({formatter: 'json'});

      expectNoLogging();
      expectStatus(res, 404);
      expectResult(res, {
        message: 'Not Found',
        code: 404
      }, done);
      fn(function () {
        throw Error('something not found: etc etc');
      }, res);
    });
  });

  describe('expectHTML', function () {
    var fn = lib[this.title];

    it('sends html', function (done) {
      var data = 'some html',
        res = createMockRes({formatter: 'html'});

      expectNoLogging();
      expectResult(res, data, done);
      fn(_.constant(data), res);
    });

    it('404s on Error "not found"', function (done) {
      var res = createMockRes({formatter: 'html'});

      expectNoLogging();
      expectStatus(res, 404);
      expectResult(res, '404 Not Found', done);
      fn(function () {
        throw Error('something not found: etc etc');
      }, res);
    });
  });

  describe('list', function () {
    var fn = lib[this.title];

    beforeEach(function () {
      return db.clear().then(function () {
        return bluebird.join(
          db.put('a', 'b'),
          db.put('aa', 'b'),
          db.put('aaa', 'b'),
          db.put('c', 'd'),
          db.put('cc', 'd'),
          db.put('ccc', 'd'),
          db.put('e', 'f')
        );
      });
    });

    it('uses url as prefix if no options given', function (done) {
      var req = createMockReq(),
        res = createMockRes();

      req.url = 'a';
      expectNoLogging();
      expectResult(res, '["aa","aaa"]', done);
      fn()(req, res);
    });

    it('should use prefix in options if given', function (done) {
      var req = createMockReq(),
        res = createMockRes();

      req.url = 'a';
      expectResult(res, '["cc","ccc"]', done);
      fn({prefix: 'c'})(req, res);
    });

    it('can filter results if given appropriate transform', function (done) {
      var req = createMockReq(),
        res = createMockRes(),
        onlyCFilter = filter({wantStrings: true}, function (str) { return str.indexOf('c') !== -1; });

      req.url = '';
      expectNoLogging();
      expectResult(res, '["c","cc","ccc"]', done);
      fn({transforms: [onlyCFilter]})(req, res);
    });
  });
});