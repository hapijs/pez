// Load modules

var Lab = require('lab');
var Pez = require('..');
var Shot = require('shot');
var Wreck = require('wreck');


// Declare internals

var internals = {};


// Test shortcuts

var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var expect = Lab.expect;


describe('Dispenser', function () {

    var simulate = function (payload, boundary, callback) {

        var req = Wreck.toReadableStream(payload);
        req.headers = { 'content-type': 'multipart/form-data; boundary="' + boundary + '"' };

        var dispenser = new Pez.Dispenser({ boundary: boundary });

        var data = {};
        var set = function (name, value, headers, filename) {

            var item = { value: value };
            if (headers) {
                item.headers = headers;
            }

            if (filename) {
                item.filename = filename;
            }

            if (!data.hasOwnProperty(name)) {
                data[name] = item;
            }
            else if (Array.isArray(data[name])) {
                data[name].push(item);
            }
            else {
                data[name] = [data[name], item];
            }
        };

        dispenser.on('preamble', function (chunk) {

            set('preamble', chunk.toString());
        });

        dispenser.on('epilogue', function (value) {

            set('epilogue', value);
        });

        dispenser.on('part', function (part) {

            Wreck.read(part, {}, function (err, payload) {

                set(part.name, payload.toString(), part.headers, part.filename);
            });
        });

        dispenser.on('field', function (name, value) {

            set(name, value);
        });

        dispenser.once('close', function () {

            callback(null, data);
        });

        dispenser.once('error', function (err) {

            return callback(err);
        });

        req.pipe(dispenser);
    };

    it('parses RFC1867 payload', function (done) {

        var payload =
            'pre\r\nemble\r\n' +
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '\r\n' +
            'one\r\ntwo\r\n' +
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'some content\r\nwith \rnewline\r\r\n' +
            '--AaB03x--\r\n' +
            'epi\r\nlogue';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                preamble: {
                    value: 'pre\r\nemble'
                },
                field1: {
                    value: 'one\r\ntwo'
                },
                epilogue: {
                    value: 'epi\r\nlogue'
                },
                pics: {
                    value: 'some content\r\nwith \rnewline\r',
                    headers: {
                        'content-disposition': 'form-data; name=\"pics\"; filename=\"file1.txt\"',
                        'content-type': 'text/plain'
                    },
                    filename: 'file1.txt'
                }
            });

            done();
        });
    });

    it('parses payload without trailing crlf', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '\r\n' +
            'one\r\ntwo\r\n' +
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'some content\r\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                field1: {
                    value: 'one\r\ntwo'
                },
                pics: {
                    value: 'some content\r',
                    headers: {
                        'content-disposition': 'form-data; name=\"pics\"; filename=\"file1.txt\"',
                        'content-type': 'text/plain'
                    },
                    filename: 'file1.txt'
                }
            });

            done();
        });
    });

    it('errors on invalid part header (missing name)', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            ': invalid\r\n' +
            '\r\n' +
            'one\r\ntwo\r\n' +
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'some content\r\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Invalid header missing field name');

            done();
        });
    });

    it('errors on invalid part header (missing colon)', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            'invalid\r\n' +
            '\r\n' +
            'one\r\ntwo\r\n' +
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'some content\r\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Invalid header missing colon separator');

            done();
        });
    });
});

describe('contentType()', function () {

    it('parses header', function (done) {

        var contentType = Pez.contentType('application/json; some=property; and="another"');
        expect(contentType.isBoom).to.not.exist;
        expect(contentType.mime).to.equal('application/json');
        expect(contentType.boundary).to.not.exist;
        done();
    });

    it('parses header (only type)', function (done) {

        var contentType = Pez.contentType('application/json');
        expect(contentType.isBoom).to.not.exist;
        expect(contentType.mime).to.equal('application/json');
        expect(contentType.boundary).to.not.exist;
        done();
    });

    it('parses header (boundary)', function (done) {

        var contentType = Pez.contentType('application/json; boundary=abcdefghijklm');
        expect(contentType.isBoom).to.not.exist;
        expect(contentType.mime).to.equal('application/json');
        expect(contentType.boundary).to.equal('abcdefghijklm');
        done();
    });

    it('parses header (quoted boundary)', function (done) {

        var contentType = Pez.contentType('application/json; boundary="abcdefghijklm"');
        expect(contentType.isBoom).to.not.exist;
        expect(contentType.mime).to.equal('application/json');
        expect(contentType.boundary).to.equal('abcdefghijklm');
        done();
    });

    it('errors on invalid header', function (done) {

        var contentType = Pez.contentType('application/json; some');
        expect(contentType.isBoom).to.exist;
        done();
    });

    it('errors on multipart missing boundary', function (done) {

        var contentType = Pez.contentType('multipart/form-data');
        expect(contentType.isBoom).to.exist;
        done();
    });
});

describe('contentDisposition()', function (done) {

    it('handles language filename', function (done) {

        var header = 'form-data; name="file"; filename*=utf-8\'en\'with%20space';

        expect(Pez.contentDisposition(header)).to.deep.equal({ name: 'file', filename: 'with space' });
        done();
    });

    it('errors on invalid language filename', function (done) {

        var header = 'form-data; name="file"; filename*=steve';

        expect(Pez.contentDisposition(header).message).to.equal('Invalid content-disposition header format includes invalid parameters');
        done();
    });

    it('errors on invalid format', function (done) {

        var header = 'steve';

        expect(Pez.contentDisposition(header).message).to.equal('Invalid content-disposition header format');
        done();
    });

    it('errors on missing header', function (done) {

        expect(Pez.contentDisposition('').message).to.equal('Missing content-disposition header');
        done();
    });

    it('errors on missing parameters', function (done) {

        var header = 'form-data';

        expect(Pez.contentDisposition(header).message).to.equal('Invalid content-disposition header missing parameters');
        done();
    });

    it('errors on missing language value', function (done) {

        var header = 'form-data; name="file"; filename*=';

        expect(Pez.contentDisposition(header).message).to.equal('Invalid content-disposition header format includes invalid parameters');
        done();
    });

    it('errors on invalid percent encoded language value', function (done) {

        var header = 'form-data; name="file"; filename*=utf-8\'en\'with%vxspace';

        expect(Pez.contentDisposition(header).message).to.equal('Invalid content-disposition header format includes invalid parameters');
        done();
    });

    it('errors on missing name', function (done) {

        var header = 'form-data; filename=x';

        expect(Pez.contentDisposition(header).message).to.equal('Invalid content-disposition header missing name parameter');
        done();
    });
});
