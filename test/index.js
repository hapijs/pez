// Load modules

var Events = require('events');
var Http = require('http');
var Stream = require('stream');
var B64 = require('b64');
var FormData = require('form-data');
var Fs = require('fs');
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

    var simulate = function (payload, boundary, contentType, callback) {

        if (arguments.length === 3) {
            callback = contentType;
            contentType = 'multipart/form-data; boundary="' + boundary + '"'
        }

        var req = new internals.Payload(payload);
        req.headers = { 'content-type': contentType };

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

    it('parses an uploaded standard text file', function (done) {

        var server = Http.createServer(function (req, res) {

            var payload = '';

            req.on('data', function (chunk) {

                payload += chunk;
            });

            req.on('end', function () {

                // Pull out the boundary value
                var boundary = payload.match(/-(\d+)/);
                payload = payload.replace(/-{2,}/g, '--');

                simulate(payload, boundary[1], function (err, result) {

                    expect(result).to.deep.equal({
                        file1: {
                            filename: 'file1.txt',
                            headers: {
                                'content-disposition': 'form-data; name="file1"; filename="file1.txt"',
                                'content-type': 'text/plain'
                            },
                            value: 'I am a plain text file'
                        }
                    });
                    done();
                });
            });
        }).listen(1337, '127.0.0.1');

        var form = new FormData();
        form.append('file1', Fs.createReadStream('./test/fixtures/file1.txt'));

        Wreck.post('http://127.0.0.1:1337', {
            payload: form, headers: form.getHeaders()
        }, function (err, res, payload) {});
    });

    it('parses a request with "=" in the boundary', function (done) {

        var payload =
            '--AaB=03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'content-transfer-encoding: 7bit\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB=03x--\r\n';

        simulate(payload, 'AaB=03x', function (err, data) {

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

    it('parses a request with non-standard contentType', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'content-transfer-encoding: 7bit\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB03x--\r\n';
        var contentType = 'multipart/form-data; boundary="--AaB03x"; charset=utf-8; random=foobar';

        simulate(payload, 'AaB03x', contentType, function (err, data) {

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

    it('parses a png file', function (done) {

        var payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="sticker"; filename="image.png"\r\n' +
            'content-transfer-encoding: base64\r\n' +
            'Content-Type: img/png\r\n' +
            '\r\n' +
            B64.encode(new Buffer('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')) + '\r\n' +
            '--AaB03x--\r\n';

        simulate(payload, 'AaB03x', function (err, data) {

            expect(err).to.not.exist;
            expect(data).to.deep.equal({
                sticker: {
                    filename: 'image.png',
                    value: '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',
                    headers: {
                        'content-disposition': 'form-data; name="sticker"; filename="image.png"',
                        'content-transfer-encoding': 'base64',
                        'content-type': 'img/png'
                    }
                }
            });
            done();
        });
    });

    it('parses an uploaded png file', function (done) {

        Http.createServer(function (req, res) {
debugger
            var payload = '';

            req.on('data', function (chunk) {

                payload += chunk;
            });

            req.on('end', function () {
debugger;
                // Pull out the boundary value
                var boundary = payload.match(/-(\d+)/);
                payload = payload.replace(/-{2,}/g, '--');
                Fs.writeFileSync('./test/fixtures/tmp.txt', payload)

                simulate(payload, boundary[1], function (err, result) {

                    expect(result).to.deep.equal({
                        sticker: {
                            filename: 'image.png',
                            value: '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',
                            headers: {
                                'content-disposition': 'form-data; name="sticker"; filename="image.png"',
                                'content-transfer-encoding': 'base64',
                                'content-type': 'img/png'
                            }
                        }
                    });
                    done();
                });
            });
        }).listen(1338, '127.0.0.1');

        var form = new FormData();
        form.append('sticker', Fs.createReadStream('./test/fixtures/image.png'), {
            contentType: 'image/png',
            filename: 'image.png'
        });
debugger
        Wreck.request('POST','http://127.0.0.1:1338', {
            payload: form,
            headers: {
                'content-transfer-encoding': 'base64'
            }
        }, function (err, res, payload) {});
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
