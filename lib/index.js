// Load modules

var Stream = require('stream');
var StringDecoder = require('string_decoder').StringDecoder;
var Boom = require('boom');
var Hoek = require('hoek');


// Declare internals

var internals = {};


var START = 0
  , HEADER_FIELD_START = 2
  , HEADER_FIELD = 3
  , HEADER_VALUE_START = 4
  , HEADER_VALUE = 5
  , HEADER_VALUE_ALMOST_DONE = 6
  , HEADERS_ALMOST_DONE = 7
  , PART_DATA_START = 8
  , PART_DATA = 9
  , PART_END = 10
  , CLOSE_BOUNDARY = 11
  , END = 12

  , LF = 10
  , CR = 13
  , SPACE = 32
  , HYPHEN = 45
  , COLON = 58;


// RFC 7231 Section 3.1.1.1
// media-type = type "/" subtype *( OWS ";" OWS parameter )
// type       = token
// subtype    = token
// parameter  = token "=" ( token / quoted-string )

//                             1: type/subtype                                                            2: "b"   3: b
internals.contentTypeRegex = /^([^\s;]+)(?:(?:\s*;\s*[^=]+=(?:"(?:[^"]+)"|[^;"]+))*(?:\s*;\s*boundary=(?:"([^"]+)"|([^;"]+))?))?/i;

exports.contentType = function (header) {

    var match = header.match(internals.contentTypeRegex);
    if (!match) {
        return Boom.badRequest('Invalid content-type header');
    }

    var mime = match[1].toLowerCase();
    var boundary = match[2] || match[3]
    if (mime.indexOf('multipart/') === 0 &&
        !boundary) {

        return Boom.badRequest('Invalid content-type header: multipart missing boundary');
    }

    return { mime: mime, boundary: boundary };
};


exports.Dispenser = internals.Dispenser = function (contentType) {

    var self = this;

    Stream.Writable.call(this);

    this.error = false;
    this.finished = false;
    this.bytesReceived = 0;
    this.flushing = 0;
    this.backpressure = false;
    this.writeCbs = [];
    this.state = START;
    this.index = null;
    this.partBoundaryFlag = false;

    this.boundary = new Buffer('\r\n--' + contentType.boundary);
    this.lookbehind = new Buffer(this.boundary.length + 8);

    this.boundaryChars = {};
    for (var i = 0, il = this.boundary.length; i < il; i++) {
        this.boundaryChars[this.boundary[i]] = true;
    }

    this.once('finish', function () {

        if ((self.state === HEADER_FIELD_START && self.index === 0) ||
            (self.state === PART_DATA && self.index === self.boundary.length)) {

            self.onParsePartEnd();
        }
        else if (self.state !== END) {
            self.handleError(new Error('stream ended unexpectedly'));
        }

        self.finished = true;
        maybeClose(self);
    });

    this.once('pipe', function (req) {

        var onError = function (err) {

            if (!self.error) {
                self.error = true;
                req.removeListener('error', onError);
                req.removeListener('aborted', onReqAborted);
                self.emit('error', err);
            }
        };

        self.handleError = onError;

        req.on('error', onError);

        var onReqAborted = function () {

            self.emit('aborted');
            onError(new Error('Request aborted'));
        };

        req.on('aborted', onReqAborted);
    });
};

Hoek.inherits(internals.Dispenser, Stream.Writable);


internals.Dispenser.prototype._write = function (buffer, encoding, cb) {

    if (this.error) {
        return;
    }

    var prevIndex = this.index;
    var index = this.index;
    var state = this.state;
    var lookbehind = this.lookbehind;
    var boundary = this.boundary;
    var boundaryChars = this.boundaryChars;
    var boundaryLength = this.boundary.length;
    var boundaryEnd = boundaryLength - 1;
    var bufferLength = buffer.length;

    for (var i = 0, il = buffer.length; i < il; i++) {
        var c = buffer[i];
        switch (state) {
            case START:
                if (index === boundaryLength - 2 && c === HYPHEN) {
                    index = 1;
                    state = CLOSE_BOUNDARY;
                    break;
                }
                else if (index === boundaryLength - 2) {
                    if (c !== CR) {
                        return this.handleError(new Error('Expected CR Received ' + c));
                    }
                    index++;
                    break;
                }
                else if (index === boundaryLength - 1) {
                    if (c !== LF) {
                        return this.handleError(new Error('Expected LF Received ' + c));
                    }
                    index = 0;
                    this.onParsePartBegin();
                    state = HEADER_FIELD_START;
                    break;
                }

                if (c !== boundary[index + 2]) {
                    index = -2;
                }

                if (c === boundary[index + 2]) {
                    index++;
                }

                break;
            case HEADER_FIELD_START:
                state = HEADER_FIELD;
                this.headerFieldMark = i;
                index = 0;
                /* falls through */
            case HEADER_FIELD:
                if (c === CR) {
                    this.headerFieldMark = null;
                    state = HEADERS_ALMOST_DONE;
                    break;
                }

                index++;
                if (c === HYPHEN) {
                    break;
                }

                if (c === COLON) {
                    if (index === 1) {
                        // empty header field
                        this.handleError(new Error('Empty header field'));
                        return;
                    }
                    this.onParseHeaderField(buffer.slice(this.headerFieldMark, i));
                    this.headerFieldMark = null;
                    state = HEADER_VALUE_START;
                    break;
                }

                var cl = c | 0x20;      // Lowercase
                if (cl < 97 || cl > 122) {              // A - Z
                    this.handleError(new Error('Expected alphabetic character, received ' + c));
                    return;
                }
                break;
            case HEADER_VALUE_START:
                if (c === SPACE) {
                    break;
                }

                this.headerValueMark = i;
                state = HEADER_VALUE;
                /* falls through */
            case HEADER_VALUE:
                if (c === CR) {
                    this.onParseHeaderValue(buffer.slice(this.headerValueMark, i));
                    this.headerValueMark = null;
                    this.onParseHeaderEnd();
                    state = HEADER_VALUE_ALMOST_DONE;
                }
                break;
            case HEADER_VALUE_ALMOST_DONE:
                if (c !== LF) {
                    return this.handleError(new Error('Expected LF Received ' + c));
                }

                state = HEADER_FIELD_START;
                break;
            case HEADERS_ALMOST_DONE:
                if (c !== LF) {
                    return this.handleError(new Error('Expected LF Received ' + c));
                }

                var err = this.onParseHeadersEnd(i + 1);
                if (err) {
                    return this.handleError(err);
                }
                state = PART_DATA_START;
                break;
            case PART_DATA_START:
                state = PART_DATA;
                this.partDataMark = i;
                /* falls through */
            case PART_DATA:
                prevIndex = index;

                if (index === 0) {
                    // boyer-moore derived algorithm to safely skip non-boundary data
                    i += boundaryEnd;
                    while (i < bufferLength && !(buffer[i] in boundaryChars)) {
                        i += boundaryLength;
                    }
                    i -= boundaryEnd;
                    c = buffer[i];
                }

                if (index < boundaryLength) {
                    if (boundary[index] === c) {
                        if (index === 0) {
                            this.onParsePartData(buffer.slice(this.partDataMark, i));
                            this.partDataMark = null;
                        }
                        index++;
                    }
                    else {
                        index = 0;
                    }
                }
                else if (index === boundaryLength) {
                    index++;
                    if (c === CR) {
                        // CR = part boundary
                        this.partBoundaryFlag = true;
                    }
                    else if (c === HYPHEN) {
                        index = 1;
                        state = CLOSE_BOUNDARY;
                        break;
                    }
                    else {
                        index = 0;
                    }
                }
                else if (index - 1 === boundaryLength) {
                    if (this.partBoundaryFlag) {
                        index = 0;
                        if (c === LF) {
                            this.partBoundaryFlag = false;
                            this.onParsePartEnd();
                            this.onParsePartBegin();
                            state = HEADER_FIELD_START;
                            break;
                        }
                    }
                    else {
                        index = 0;
                    }
                }

                if (index > 0) {
                    // when matching a possible boundary, keep a lookbehind reference
                    // in case it turns out to be a false lead
                    lookbehind[index - 1] = c;
                }
                else if (prevIndex > 0) {
                    // if our boundary turned out to be rubbish, the captured lookbehind
                    // belongs to partData
                    this.onParsePartData(lookbehind.slice(0, prevIndex));
                    prevIndex = 0;
                    this.partDataMark = i;

                    // reconsider the current character even so it interrupted the sequence
                    // it could be the beginning of a new sequence
                    i--;
                }

                break;
            case CLOSE_BOUNDARY:
                if (c !== HYPHEN) {
                    return this.handleError(new Error('Expected HYPHEN Received ' + c));
                }

                if (index === 1) {
                    this.onParsePartEnd();
                    state = END;
                }
                else if (index > 1) {
                    return this.handleError(new Error('Parser has invalid state.'));
                }
                index++;
                break;
            case END:
                break;
            default:
                this.handleError(new Error('Parser has invalid state.'));
                return;
        }
    }

    if (this.headerFieldMark != null) {
        this.onParseHeaderField(buffer.slice(this.headerFieldMark));
        this.headerFieldMark = 0;
    }

    if (this.headerValueMark != null) {
        this.onParseHeaderValue(buffer.slice(this.headerValueMark));
        this.headerValueMark = 0;
    }

    if (this.partDataMark != null) {
        this.onParsePartData(buffer.slice(this.partDataMark));
        this.partDataMark = 0;
    }

    this.index = index;
    this.state = state;

    this.bytesReceived += buffer.length;

    if (this.backpressure) {
        this.writeCbs.push(cb);
    }
    else {
        cb();
    }
};


internals.Dispenser.prototype.onParsePartBegin = function () {

    clearPartVars(this);
};


internals.Dispenser.prototype.onParseHeaderField = function (b) {

    this.headerField += this.headerFieldDecoder.write(b);
};


internals.Dispenser.prototype.onParseHeaderValue = function (b) {

    this.headerValue += this.headerValueDecoder.write(b);
};


internals.Dispenser.prototype.onParseHeaderEnd = function () {

    this.headerField = this.headerField.toLowerCase();
    this.partHeaders[this.headerField] = this.headerValue;

    var m;
    if (this.headerField === 'content-disposition') {
        if (m = this.headerValue.match(/\bname="([^"]+)"/i)) {
            this.partName = m[1];
        }
        this.partFilename = internals.parseFilename(this.headerValue);
    }
    else if (this.headerField === 'content-transfer-encoding') {
        this.partTransferEncoding = this.headerValue.toLowerCase();
    }

    this.headerFieldDecoder = new StringDecoder();
    this.headerField = '';
    this.headerValueDecoder = new StringDecoder();
    this.headerValue = '';
};


internals.Dispenser.prototype.onParsePartData = function (b) {

    if (this.partTransferEncoding === 'base64') {
        this.backpressure = !this.destStream.write(b.toString('ascii'), 'base64');
    }
    else {
        this.backpressure = !this.destStream.write(b);
    }
};


internals.Dispenser.prototype.onParsePartEnd = function () {

    if (this.destStream) {
        flushWriteCbs(this);
        var s = this.destStream;
        process.nextTick(function () {

            s.end();
        });
    }

    clearPartVars(this);
};


internals.Dispenser.prototype.onParseHeadersEnd = function (offset) {

    var self = this;
    switch (this.partTransferEncoding) {
        case 'binary':
        case '7bit':
        case '8bit':
            this.partTransferEncoding = 'binary';
            break;

        case 'base64': break;
        default:
            return new Error('unknown transfer-encoding: ' + this.partTransferEncoding);
    }

    this.destStream = new Stream.PassThrough();
    this.destStream.on('drain', function () {

        flushWriteCbs(self);
    });

    this.destStream.headers = this.partHeaders;
    this.destStream.name = this.partName;

    if (this.partFilename) {
        this.destStream.filename = this.partFilename;
        this.emit('part', this.destStream);
        beginFlush(this);
        this.destStream.on('end', function () {

            endFlush(self);
        });
    }
    else {
        var fieldStream = this.destStream;

        var value = '';
        var decoder = new StringDecoder(this.encoding);

        beginFlush(this);
        fieldStream.on('readable', function () {

            var buffer = fieldStream.read();
            if (!buffer) return;

            value += decoder.write(buffer);
        });

        fieldStream.on('end', function () {

            self.emit('field', fieldStream.name, value);
            endFlush(self);
        });
    }
};


function flushWriteCbs(self) {

    self.writeCbs.forEach(function (cb) {

        process.nextTick(cb);
    });
    self.writeCbs = [];
    self.backpressure = false;
};


function beginFlush(self) {

    self.flushing += 1;
};


function endFlush(self) {

    self.flushing -= 1;
    maybeClose(self);
};


function maybeClose(self) {

    if (!self.flushing && self.finished && !self.error) {
        self.emit('close');
    }
};


function clearPartVars(self) {

    self.partHeaders = {};
    self.partName = null;
    self.partFilename = null;
    self.partTransferEncoding = 'binary';
    self.destStream = null;

    self.headerFieldDecoder = new StringDecoder(self.encoding);
    self.headerField = '';
    self.headerValueDecoder = new StringDecoder(self.encoding);
    self.headerValue = '';
};


internals.parseFilename = function (headerValue) {

    var m = headerValue.match(/\bfilename="(.*?)"($|; )/i);
    if (!m) {
        m = headerValue.match(/\bfilename\*=utf-8\'\'(.*?)($|; )/i);
        if (m) {
            m[1] = decodeURI(m[1]);
        }
        else {
            return;
        }
    }

    var filename = m[1].substr(m[1].lastIndexOf('\\') + 1);
    filename = filename.replace(/%22/g, '"');
    filename = filename.replace(/&#([\d]{4});/g, function (m, code) {

        return String.fromCharCode(code);
    });
    return filename;
};

