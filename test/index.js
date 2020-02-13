'use strict';

const Fs = require('fs');
const Http = require('http');
const Stream = require('stream');

const B64 = require('@hapi/b64');
const Code = require('@hapi/code');
const Content = require('@hapi/content');
const FormData = require('form-data');
const Lab = require('@hapi/lab');
const Pez = require('..');
const Teamwork = require('@hapi/teamwork');
const Wreck = require('@hapi/wreck');


const internals = {};


const { describe, it } = exports.lab = Lab.script();
const expect = Code.expect;


describe('Dispenser', () => {

    const simulate = function (payload, boundary, contentType) {

        contentType = contentType || 'multipart/form-data; boundary="' + boundary + '"';
        const req = new internals.Payload(payload);
        req.headers = { 'content-type': contentType };
        return internals.interceptor(req, boundary);
    };

    it('throws on invalid options', () => {

        const fail = (options) => {

            expect(() => {

                return new Pez.Dispenser(options);
            }).to.throw(Error, 'options must be an object');
        };

        fail();
        fail(null);
        fail('foo');
        fail(1);
        fail(false);
    });

    it('parses RFC1867 payload', async () => {

        const payload =
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

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
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
    });

    it('parses payload in chunks', async () => {

        const payload = [
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

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
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
    });

    it('parses payload without trailing crlf', async () => {

        const payload =
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

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
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
    });

    it('ignores whitespace after boundary', async () => {

        const payload =
            '--AaB03x  \r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            field: {
                value: 'value'
            }
        });
    });

    it('parses single part without epilogue', async () => {

        const payload =
            '--AaB03x  \r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            field: {
                value: 'value'
            }
        });
    });

    it('reads header over multiple lines', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition:\r\n form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            field: {
                value: 'value'
            }
        });
    });

    it('reads header over multiple lines including tabs', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition:\r\n\tform-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            field: {
                value: 'value'
            }
        });
    });

    it('parses b64 file', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"; filename="file.txt"\r\n' +
            'content-transfer-encoding: base64\r\n' +
            '\r\n' +
            B64.encode(Buffer.from('this is the content of the file')) + '\r\n' +
            '--AaB03x--';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            field: {
                value: 'this is the content of the file',
                headers: {
                    'content-disposition': 'form-data; name="field"; filename="file.txt"',
                    'content-transfer-encoding': 'base64'
                },
                filename: 'file.txt'
            }
        });
    });

    it('errors on partial header over multiple lines', async () => {

        const payload =
            '--AaB03x\r\n' +
            ' form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        await expect(simulate(payload, 'AaB03x')).to.reject('Invalid header continuation without valid declaration on previous line');
    });

    it('errors on missing terminator', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x';

        await expect(simulate(payload, 'AaB03x')).to.reject('Missing end boundary');
    });

    it('errors on missing preamble terminator (\\n)', async () => {

        const payload =
            'preamble--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        await expect(simulate(payload, 'AaB03x')).to.reject('Preamble missing CRLF terminator');
    });

    it('errors on missing preamble terminator (\\r)', async () => {

        const payload =
            'preamble\n--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--';

        await expect(simulate(payload, 'AaB03x')).to.reject('Preamble missing CRLF terminator');
    });

    it('errors on incomplete part', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'value\r\n';

        await expect(simulate(payload, 'AaB03x')).to.reject('Incomplete multipart payload');
    });

    it('errors on invalid part header (missing field name)', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            ': invalid\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--';

        await expect(simulate(payload, 'AaB03x')).to.reject('Invalid header missing field name');
    });

    it('errors on invalid part header (missing colon)', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            'invalid\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--';

        await expect(simulate(payload, 'AaB03x')).to.reject('Invalid header missing colon separator');
    });

    it('errors on missing content-disposition', async () => {

        const payload =
            '--AaB03x\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--';

        await expect(simulate(payload, 'AaB03x')).to.reject('Missing content-disposition header');
    });

    it('errors on invalid text after boundary', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03xc\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03x--\r\n';

        await expect(simulate(payload, 'AaB03x')).to.reject('Only white space allowed after boundary');
    });

    it('errors on invalid text after boundary at end', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field"\r\n' +
            '\r\n' +
            'content\r\n' +
            '--AaB03xc';

        await expect(simulate(payload, 'AaB03x')).to.reject('Only white space allowed after boundary at end');
    });

    it('errors on aborted request', async () => {

        const req = new internals.Payload('--AaB03x\r\n', true);
        req.headers = { 'content-type': 'multipart/form-data; boundary="AaB03x"' };

        const dispenser = new Pez.Dispenser({ boundary: 'AaB03x' });

        const team = new Teamwork();
        dispenser.once('error', (err) => {

            expect(err).to.exist();
            expect(err.message).to.equal('Client request aborted');
            team.attend();
        });

        req.pipe(dispenser);
        req.emit('aborted');
        await team.work;
    });

    it('parses direct write', async () => {

        const dispenser = new Pez.Dispenser({ boundary: 'AaB03x' });

        const team = new Teamwork();
        dispenser.on('field', (name, value) => {

            expect(name).to.equal('field1');
            expect(value).to.equal('value');
            team.attend();
        });

        dispenser.write('--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x--');

        dispenser.end();
        await team.work;
    });

    it('ignores write after error', async () => {

        const dispenser = new Pez.Dispenser({ boundary: 'AaB03x' });

        dispenser.on('field', (name, value) => {

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

        const team = new Teamwork();
        dispenser.once('error', (err) => {

            expect(err instanceof Error).to.equal(true);
            team.attend();
        });

        dispenser.write('--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '\r\n' +
            'value\r\n' +
            '--AaB03x*');

        await team.work;
    });

    it('parses a standard text file', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'content-transfer-encoding: 7bit\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
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
    });

    it('parses an uploaded standard text file', async () => {

        let port = 0;
        const team = new Teamwork();
        const server = Http.createServer(async (req, res) => {

            const contentType = Content.type(req.headers['content-type']);
            const result = await internals.interceptor(req, contentType.boundary);
            expect(result).to.equal({
                file1: {
                    filename: 'file1.txt',
                    headers: {
                        'content-disposition': 'form-data; name="file1"; filename="file1.txt"',
                        'content-type': 'text/plain'
                    },
                    value: 'I am a plain text file'
                }
            });
            team.attend();
        }).listen(port, '127.0.0.1');

        server.once('listening', () => {

            port = server.address().port;

            const form = new FormData();
            form.append('file1', Fs.createReadStream('./test/files/file1.txt'));

            Wreck.post('http://127.0.0.1:' + port, {
                payload: form, headers: form.getHeaders()
            }, (err, res, payload) => {

                expect(err).to.not.exist();
            });
        });

        await team.work;
    });

    it('errors if the payload size exceeds the byte limit', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB03x--\r\n';

        const req = new internals.Payload(payload, true);
        req.headers = { 'content-type': 'multipart/form-data; boundary="AaB03x"' };

        const dispenser = new Pez.Dispenser({ boundary: 'AaB03x', maxBytes: payload.length - 1 });

        const team = new Teamwork();
        dispenser.once('error', (err) => {

            expect(err).to.exist();
            expect(err.message).to.equal('Maximum size exceeded');
            expect(err.output.statusCode).to.equal(413);
            team.attend();
        });

        req.pipe(dispenser);
        await team.work;
    });

    it('parses a request with "=" in the boundary', async () => {

        const payload =
            '--AaB=03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'content-transfer-encoding: 7bit\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB=03x--\r\n';

        const data = await simulate(payload, 'AaB=03x');
        expect(data).to.equal({
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
    });

    it('parses a request with non-standard contentType', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="file1.txt"\r\n' +
            'content-transfer-encoding: 7bit\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            'I am a plain text file\r\n' +
            '--AaB03x--\r\n';
        const contentType = 'multipart/form-data; boundary="--AaB03x"; charset=utf-8; random=foobar';

        const data = await simulate(payload, 'AaB03x', contentType);
        expect(data).to.equal({
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
    });

    it('parses a png file', async () => {

        const png = Fs.readFileSync('./test/files/image.png');

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="sticker"; filename="image.png"\r\n' +
            'content-transfer-encoding: base64\r\n' +
            'Content-Type: image/png\r\n' +
            '\r\n' +
            B64.encode(png) + '\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            sticker: {
                value: png.toString(),
                headers: {
                    'content-disposition': 'form-data; name="sticker"; filename="image.png"',
                    'content-transfer-encoding': 'base64',
                    'content-type': 'image/png'
                },
                filename: 'image.png'
            }
        });
    });

    it('parses an uploaded png file', async () => {

        const team = new Teamwork();
        const server = Http.createServer(async (req, res) => {

            const contentType = Content.type(req.headers['content-type']);
            const result = await internals.interceptor(req, contentType.boundary);
            expect(result).to.equal({
                sticker: {
                    value: Fs.readFileSync('./test/files/image.png').toString(),
                    headers: {
                        'content-disposition': 'form-data; name="sticker"; filename="image.png"',
                        'content-type': 'image/png'
                    },
                    filename: 'image.png'
                }
            });
            team.attend();
        }).listen(0, '127.0.0.1');

        server.once('listening', () => {

            const form = new FormData();
            form.append('sticker', Fs.createReadStream('./test/files/image.png'));
            Wreck.request('POST', 'http://127.0.0.1:' + server.address().port, { payload: form, headers: form.getHeaders() });
        });

        await team.work;
    });

    it('parses a large uploaded png file', async () => {

        const team = new Teamwork();
        const server = Http.createServer(async (req, res) => {

            const contentType = Content.type(req.headers['content-type']);
            const result = await internals.interceptor(req, contentType.boundary);
            expect(result).to.equal({
                sticker: {
                    value: Fs.readFileSync('./test/files/large.png').toString(),
                    headers: {
                        'content-disposition': 'form-data; name="sticker"; filename="large.png"',
                        'content-type': 'image/png'
                    },
                    filename: 'large.png'
                }
            });
            team.attend();
        }).listen(0, '127.0.0.1');

        server.once('listening', () => {

            const form = new FormData();
            form.append('sticker', Fs.createReadStream('./test/files/large.png'));
            Wreck.request('POST', 'http://127.0.0.1:' + server.address().port, { payload: form, headers: form.getHeaders() });
        });

        await team.work;
    });

    it('parses a blank gif file', async () => {

        const blankgif = Fs.readFileSync('./test/files/blank.gif');

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="blank.gif"\r\n' +
            'content-transfer-encoding: base64\r\n' +
            'Content-Type: image/gif\r\n' +
            '\r\n' +
            B64.encode(blankgif) + '\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            file: {
                filename: 'blank.gif',
                value: blankgif.toString(),
                headers: {
                    'content-disposition': 'form-data; name="file"; filename="blank.gif"',
                    'content-transfer-encoding': 'base64',
                    'content-type': 'image/gif'
                }
            }
        });
    });

    it('parses an uploaded blank gif file', async () => {

        const team = new Teamwork();
        const server = Http.createServer(async (req, res) => {

            const contentType = Content.type(req.headers['content-type']);
            const result = await internals.interceptor(req, contentType.boundary);
            expect(result).to.equal({
                file: {
                    value: Fs.readFileSync('./test/files/blank.gif').toString(),
                    headers: {
                        'content-disposition': 'form-data; name="file"; filename="blank.gif"',
                        'content-type': 'image/gif'
                    },
                    filename: 'blank.gif'
                }
            });
            team.attend();
        }).listen(0, '127.0.0.1');

        server.once('listening', () => {

            const form = new FormData();
            form.append('file', Fs.createReadStream('./test/files/blank.gif'));
            Wreck.request('POST', 'http://127.0.0.1:' + server.address().port, { payload: form, headers: form.getHeaders() });
        });

        await team.work;
    });

    it('parses an empty file without a filename', async () => {

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename=""\r\n' +
            '\r\n' +
            '\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            file: {
                value: '',
                headers: {
                    'content-disposition': 'form-data; name="file"; filename=""'
                }
            }
        });
    });

    it('parses a file without a filename', async () => {

        const blankgif = Fs.readFileSync('./test/files/blank.gif');

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename=""\r\n' +
            'content-transfer-encoding: base64\r\n' +
            'Content-Type: image/gif\r\n' +
            '\r\n' +
            B64.encode(blankgif) + '\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            file: {
                value: blankgif.toString(),
                headers: {
                    'content-disposition': 'form-data; name="file"; filename=""',
                    'content-transfer-encoding': 'base64',
                    'content-type': 'image/gif'
                }
            }
        });
    });

    it('handles unusual filename', async () => {

        const blankgif = Fs.readFileSync('./test/files/blank.gif');
        const filename = ': \\ ? % * | %22 < > . ? ; \' @ # $ ^ & ( ) - _ = + { } [ ] ` ~.txt';

        const payload =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
            'content-transfer-encoding: base64\r\n' +
            'Content-Type: image/gif\r\n' +
            '\r\n' +
            B64.encode(blankgif) + '\r\n' +
            '--AaB03x--\r\n';

        const data = await simulate(payload, 'AaB03x');
        expect(data).to.equal({
            file: {
                value: blankgif.toString(),
                headers: {
                    'content-disposition': 'form-data; name="file"; filename="' + filename + '"',
                    'content-transfer-encoding': 'base64',
                    'content-type': 'image/gif'
                },
                filename
            }
        });
    });

    it('errors on __proto__ header', async () => {

        const payload =
            'pre\r\nemble\r\n' +
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="field1"\r\n' +
            '__proto__: bad\r\n' +
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

        await expect(simulate(payload, 'AaB03x')).to.reject('Invalid header');
    });
});


internals.Payload = class extends Stream.Readable {

    constructor(payload, err) {

        super();

        this._data = [].concat(payload);
        this._position = 0;
        this._err = err;
    }

    _read(size) {

        const chunk = this._data[this._position++];

        if (chunk) {
            this.push(chunk);
        }
        else if (!this._err) {
            this.push(null);
        }
    }
};


internals.Recorder = class extends Stream.Writable {

    constructor() {

        super();

        this.buffers = [];
        this.nexts = [];
        this.length = 0;
    }

    _write(chunk, encoding, next) {

        this.length = this.length + chunk.length;
        this.buffers.push(chunk);
        this.nexts.push(next);
        this.emit('ping');
    }

    collect() {

        const buffer = (this.buffers.length === 0 ? Buffer.alloc(0) : (this.buffers.length === 1 ? this.buffers[0] : Buffer.concat(this.buffers, this.length)));
        return buffer;
    }

    next() {

        for (let i = 0; i < this.nexts.length; ++i) {
            this.nexts[i]();
        }

        this.nexts = [];
    }
};


internals.interceptor = function (req, boundary) {

    const dispenser = new Pez.Dispenser({ boundary });
    const data = {};
    const set = function (name, value, headers, filename) {

        const item = { value };

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

    dispenser.on('preamble', (chunk) => {

        set('preamble', chunk.toString());
    });

    dispenser.on('epilogue', (value) => {

        set('epilogue', value);
    });

    dispenser.on('part', async (part) => {

        const payload = await Wreck.read(part);
        set(part.name, payload.toString(), part.headers, part.filename);
    });

    dispenser.on('field', (name, value) => {

        set(name, value);
    });

    return new Promise((resolve, reject) => {

        dispenser.once('close', () => resolve(data));
        dispenser.once('error', reject);
        req.pipe(dispenser);
    });
};
