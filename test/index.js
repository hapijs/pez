// Load modules

var Events = require('events');
var Stream = require('stream');
var B64 = require('b64');
var Hoek = require('hoek');
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

        var req = new internals.Payload(payload);
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
            'content-transfer-encoding: 7bit\r\n' +
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
                        'content-transfer-encoding': '7bit',
                        'content-type': 'text/plain'
                    },
                    filename: 'file1.txt'
                }
            });

            done();
        });
    });

    it('parses payload in chunks', function (done) {

        var payload = [
            'pre\r\nemble\r\n',
            '--AaB03x\r\n',
            'content-disposition: form-data; name="field1"\r\n',
            '\r\n',
            'one\r\ntwo\r\n',
            '--AaB03x\r\n',
            'content-disposition: form-data; name="pics"; filename="file.bin"\r\n',
            'Content-Type: text/plain\r\n',
            '\r\n',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
            'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc\r\n',
            '--AaB03x--'
        ];

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                preamble: {
                    value: 'pre\r\nemble'
                },
                field1: {
                    value: 'one\r\ntwo'
                },
                pics: {
                    value: 'aliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxcaliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxcaliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxcaliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxcaliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxcaliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxcaliuexrnhfaliuerxnhfaiuerhfxnlaiuerhfxnlaiuerhfxnliaeruhxnfaieruhfnxc',
                    headers: {
                        'content-disposition': 'form-data; name=\"pics\"; filename=\"file.bin\"',
                        'content-type': 'text/plain'
                    },
                    filename: 'file.bin'
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

    it('ignores whitespace after boundary', function (done) {

        var payload =
            '--AaB03x  \r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                field: {
                    value: 'value'
                }
            });

            done();
        });
    });

    it('parses single part without epilogue', function (done) {

        var payload =
            '--AaB03x  \r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--\r\n';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                field: {
                    value: 'value'
                }
            });

            done();
        });
    });

    it('reads header over multiple lines', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition:\r\n form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                field: {
                    value: 'value'
                }
            });

            done();
        });
    });

    it('parses b64 file', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"; filename="file.txt"\r\n' +
            'content-transfer-encoding: base64\r\n' +
            '\r\n' +
            B64.encode(new Buffer('this is the content of the file')) + '\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                field: {
                    value: 'this is the content of the file',
                    headers: {
                        'content-disposition': 'form-data; name="field"; filename="file.txt"',
                        'content-transfer-encoding': 'base64'
                    },
                    filename: 'file.txt'
                }
            });

            done();
        });
    });

    it('errors on partial header over multiple lines', function (done) {

        var payload =
            '--AaB03x\r\n' +
            ' form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Invalid header continuation without valid declaration on previous line');

            done();
        });
    });

    it('errors on missing terminator', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Missing end boundary');

            done();
        });
    });

    it('errors on missing preamble terminator (\\n)', function (done) {

        var payload =
            'preamble--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Preamble missing CRLF terminator');

            done();
        });
    });

    it('errors on missing preamble terminator (\\r)', function (done) {

        var payload =
            'preamble\n--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Preamble missing CRLF terminator');

            done();
        });
    });

    it('errors on incomplete part', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Incomplete multipart payload');

            done();
        });
    });

    it('errors on invalid part header (missing field name)', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            ': invalid\r\n' +
            '\r\n' +
            'content\r\n' +
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
            'content-disposition: form-data; name="field"\r\n' +
            'invalid\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Invalid header missing colon separator');

            done();
        });
    });

    it('errors on missing content-disposition', function (done) {

        var payload =
            '--AaB03x\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Missing content-disposition header');

            done();
        });
    });

    it('errors on invalid text after boundary', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03xc\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--\r\n';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Only white space allowed after boundary');

            done();
        });
    });

    it('errors on invalid text after boundary at end', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03xc';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.exist;
            expect(err.message).to.equal('Only white space allowed after boundary at end');

            done();
        });
    });

    it('errors on aborted request', function (done) {

        var req = new internals.Payload('--AaB03x\r\n', true);
        req.headers = { 'content-type': 'multipart/form-data; boundary="AaB03x"' };

        var dispenser = new Pez.Dispenser({ boundary: 'AaB03x' });

        dispenser.once('error', function (err) {

            expect(err).to.exist;
            expect(err.message).to.equal('Client request aborted');
            done();
        });

        req.pipe(dispenser);
        req.emit('aborted');
    });

    it('parses direct write', function (done) {

        var dispenser = new Pez.Dispenser({ boundary: 'AaB03x' });

        dispenser.on('field', function (name, value) {

            expect(name).to.equal('field1');
            expect(value).to.equal('value');
            done();
        });

        dispenser.write('--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--');

        dispenser.end();
    });

    it('ignores write after error', function (done) {

        var dispenser = new Pez.Dispenser({ boundary: 'AaB03x' });

        dispenser.on('field', function (name, value) {

            dispenser.write('--AaB03x\r\n' +
                'content-disposition: form-data; name="field1"\r\n' +
                '\r\n' +
                'value\r\n' +
                '--AaB03x*');

            dispenser.write('--AaB03x\r\n' +
                'content-disposition: form-data; name="field1"\r\n' +
                '\r\n' +
                'value\r\n' +
                '--AaB03x*');
        });

        dispenser.once('error', function (err) {

            done();
        });

        dispenser.write('--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x*');
    });

    it('parses a standard text file', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'content-transfer-encoding: 7bit\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB03x--\r\n';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                file: {
                    filename: 'file1.txt',
                    value: 'I am a plain text file',
                    headers: {
                        'content-disposition': 'form-data; name="file"; filename="file1.txt"',
                        'content-transfer-encoding': '7bit',
                        'content-type': 'text/plain'
                    }
                }
            });
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


internals.Payload = function (payload, err) {

    Stream.Readable.call(this);

    this._data = [].concat(payload);
    this._position = 0;
    this._err = err;
};

Hoek.inherits(internals.Payload, Stream.Readable);


internals.Payload.prototype._read = function (size) {

    var chunk = this._data[this._position++];
    if (chunk) {
        this.push(chunk);
    }
    else if (!this._err) {
        this.push(null);
    }
};


internals.Recorder = function () {

    Stream.Writable.call(this);

    this.buffers = [];
    this.nexts = [];
    this.length = 0;
};

Hoek.inherits(internals.Recorder, Stream.Writable);


internals.Recorder.prototype._write = function (chunk, encoding, next) {

    this.length += chunk.length;
    this.buffers.push(chunk);
    this.nexts.push(next);
    this.emit('ping');
};


internals.Recorder.prototype.collect = function () {

    var buffer = (this.buffers.length === 0 ? new Buffer(0) : (this.buffers.length === 1 ? this.buffers[0] : Buffer.concat(this.buffers, this.length)));
    return buffer;
};


internals.Recorder.prototype.next = function () {

    for (var i = 0, il = this.nexts.length; i < il; ++i) {
        this.nexts[i]();
    }

    this.nexts = [];
};
