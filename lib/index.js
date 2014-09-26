// Load modules

var Stream = require('stream');
var Boom = require('boom');
var Hoek = require('hoek');
var Nigel = require('nigel');


// Declare internals

var internals = {
    crlf: new Buffer([13, 10])
};


/*
    RFC 2046 (http://tools.ietf.org/html/rfc2046)

    multipart-body = [preamble CRLF]
                    dash-boundary *( SPACE / HTAB ) CRLF body-part
                    *( CRLF dash-boundary *( SPACE / HTAB ) CRLF body-part )
                    CRLF dash-boundary "--" *( SPACE / HTAB )
                    [CRLF epilogue]

    boundary       = 0*69<bchars> bcharsnospace
    bchars         = bcharsnospace / " "
    bcharsnospace  = DIGIT / ALPHA / "'" / "(" / ")" / "+" / "_" / "," / "-" / "." / "/" / ":" / "=" / "?"
    dash-boundary  = "--" boundary

    preamble       = discard-text
    epilogue       = discard-text
    discard-text   = *(*text CRLF) *text

    body-part      = MIME-part-headers [CRLF *OCTET]
    OCTET          = <any 0-255 octet value>

    SPACE          = 32
    HTAB           = 9
    CRLF           = 13 10
*/


internals.state = {
    preamble: 0,                // Until the first boundary is received
    boundary: 1,                // After a boundary, waiting for first line with optional linear-whitespace
    header: 2,                  // Receiving part headers
    payload: 3,                 // Receiving part payload
    epilogue: 4
};


exports.Dispenser = internals.Dispenser = function (contentType) {

    var self = this;

    Stream.Writable.call(this);

    this._boundary = contentType.boundary;
    this._state = internals.state.preamble;
    this._held = '';

    this._stream = null;
    this._headers = {};
    this._name = '';
    this._pendingHeader = '';
    this._error = null;

    this._parts = new Nigel.Stream(new Buffer('--' + contentType.boundary));
    this._lines = new Nigel.Stream(new Buffer('\r\n'));

    this._parts.on('needle', function () {

        self._onPartEnd();
    });

    this._parts.on('haystack', function (chunk) {

        self._onPart(chunk);
    });

    this._lines.on('needle', function () {

        self._onLineEnd();
    });

    this._lines.on('haystack', function (chunk) {

        self._onLine(chunk);
    });

    this.once('finish', function () {

        self._parts.end();
    });

    this._parts.once('close', function () {

        self._lines.end();
    });

    var req = null;
    var finish = function (err) {

        if (req) {
            req.removeListener('error', finish);
            req.removeListener('aborted', onReqAborted);
        }

        if (err) {
            return self._abort(err);
        }

        self._emit('close');
    };

    this._lines.once('close', function () {

        if (self._held) {
            if (self._state === internals.state.epilogue) {

                self._emit('epilogue', self._held);
                self._held = '';
            }
            else if (self._held !== '\r\n' &&
                self._held !== '--') {

                self._abort(Boom.badRequest('Only white space allowed after boundary at end'))
            }
        }

        setImmediate(finish);                  // Give pending events a chance to fire
    });

    var onReqAborted = function () {

        finish(Boom.badRequest('Client request aborted'));
    };

    this.once('pipe', function (req) {

        req.once('error', finish);
        req.once('aborted', onReqAborted);
    });
};

Hoek.inherits(internals.Dispenser, Stream.Writable);


internals.Dispenser.prototype._write = function (buffer, encoding, next) {

    if (this._error) {
        return next(this._error);
    }

    this._parts.write(buffer);
    return next();
};


internals.Dispenser.prototype._emit = function () {

    if (this._error) {
        return;
    }

    this.emit.apply(this, arguments);
};


internals.Dispenser.prototype._abort = function (err) {

    if (this._error) {
        return;
    }

    this._error = err;
    this.emit('error', err);
};


internals.Dispenser.prototype._onPartEnd = function () {

    this._lines.flush();

    if (this._state === internals.state.preamble) {
        if (this._held) {
            var last = this._held.length - 1;
            if (this._held[last] !== '\n' ||
                this._held[last - 1] !== '\r') {

                return this._abort(Boom.badRequest('Preamble missing CRLF terminator'));
            }

            this._emit('preamble', this._held.slice(0, -2));
            this._held = '';
        }

        this._parts.needle(new Buffer('\r\n--' + this._boundary))                      // CRLF no longer optional
    }

    this._state = internals.state.boundary;

    if (this._stream) {
        this._stream.end();
        this._stream = null;
    }
    else if (this._name) {
        this._emit('field', this._name, this._held);
        this._name = '';
        this._held = '';
    }
};


internals.Dispenser.prototype._onPart = function (chunk) {

    if (this._state === internals.state.preamble) {
        this._held += chunk.toString();
    }
    else if (this._state === internals.state.payload) {
        this._stream.write(chunk);                                                      // Stream payload
    }
    else {
        this._lines.write(chunk);                                                       // Look for boundary
    }
};


internals.Dispenser.prototype._onLineEnd = function () {

    // Boundary whitespace

    if (this._state === internals.state.boundary) {
        if (this._held) {
            this._held = this._held.replace(/[\t ]/g, '');                                // trim() removes new lines
            if (this._held) {
                if (this._held === '--') {
                    this._state = internals.state.epilogue;
                    this._held = '';

                    return;
                }
                else {
                    return this._abort(Boom.badRequest('Only white space allowed after boundary'));
                }
            }
        }

        this._state = internals.state.header;

        return;
    }

    // Part headers

    if (this._state === internals.state.header) {

        // Header

        if (this._held) {

            // Header continuation

            if (this._held[0] === ' ' ||
                this._held[0] === '\t') {

                if (!this._pendingHeader) {
                    return this._abort(Boom.badRequest('Invalid header continuation without valid declaration on previous line'));
                }

                this._pendingHeader += ' ' + this._held.slice(1);                       // Drop tab
                this._held = '';
                return;
            }

            // Start of new header

            this._flushHeader();
            this._pendingHeader = this._held;
            this._held = '';

            return;
        }

        // End of headers

        this._flushHeader();

        this._state = internals.state.payload;

        var disposition = exports.contentDisposition(this._headers['content-disposition']);
        if (disposition.isBoom) {
            return this._abort(disposition);
        }

        if (disposition.filename) {
            this._stream = new Stream.PassThrough();
            this._stream.name = disposition.name;
            this._stream.filename = disposition.filename;
            this._stream.headers = this._headers;
            this._headers = {};

            this._emit('part', this._stream);
        }
        else {
            this._name = disposition.name;
        }

        return;
    }

    // Payload or epilogue

    if (this._stream) {
        this._stream.write(internals.crlf)
    }
    else {
        this._held += '\r\n';
    }
};


internals.Dispenser.prototype._onLine = function (chunk) {

    if (this._state === internals.state.payload &&
        this._stream) {

        this._stream.write(chunk);                      // Stream payload
    }
    else {
        this._held += chunk.toString();                 // Reading header or field
    }
};


internals.Dispenser.prototype._flushHeader = function () {

    if (!this._pendingHeader) {
        return;
    }

    var sep = this._pendingHeader.indexOf(':');
    if (sep === -1) {
        return this._abort(Boom.badRequest('Invalid header missing colon separator'));
    }

    if (!sep) {
        return this._abort(Boom.badRequest('Invalid header missing field name'));
    }

    this._headers[this._pendingHeader.slice(0, sep).toLowerCase()] = this._pendingHeader.slice(sep + 1).trim();
    this._pendingHeader = '';
};


/*
    RFC 7231 Section 3.1.1.1

    media-type = type "/" subtype *( OWS ";" OWS parameter )
    type       = token
    subtype    = token
    parameter  = token "=" ( token / quoted-string )
*/

//                             1: type/subtype                    2: "b"   3: b
internals.contentTypeRegex = /^([^\s;]+)(?:(?:\s*;\s*boundary=(?:"([^"]+)"|([^;"]+)))|(?:\s*;\s*[^=]+=(?:(?:"(?:[^"]+)")|(?:[^;"]+))))*$/i;


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


/*
    RFC 6266 Section 4.1 (http://tools.ietf.org/html/rfc6266#section-4.1)

    content-disposition = "Content-Disposition" ":" disposition-type *( ";" disposition-parm )
    disposition-type    = "inline" | "attachment" | token                                           ; case-insensitive
    disposition-parm    = filename-parm | token [ "*" ] "=" ( token | quoted-string | ext-value)    ; ext-value defined in [RFC5987], Section 3.2

    Content-Disposition header field values with multiple instances of the same parameter name are invalid.

    Note that due to the rules for implied linear whitespace (Section 2.1 of [RFC2616]), OPTIONAL whitespace
    can appear between words (token or quoted-string) and separator characters.

    Furthermore, note that the format used for ext-value allows specifying a natural language (e.g., "en"); this is of limited use
    for filenames and is likely to be ignored by recipients.
*/


internals.contentDispositionRegex = /^\s*form-data\s*(?:;\s*(.+))?$/i;

//                                        1: name   2: *            3: ext-value                  4: quoted  5: token
internals.contentDispositionParamRegex = /([^\=\*]+)(\*)?\s*\=\s*(?:([^;']+\'[\w-]*\'[^;\s]+)|(?:\"([^"]*)\")|([^;\s]*))(?:(?:\s*;\s*)|(?:\s*$))/g;

exports.contentDisposition = function (header) {

    if (!header) {
        return Boom.badRequest('Missing content-disposition header');
    }

    var match = header.match(internals.contentDispositionRegex);
    if (!match) {
        return Boom.badRequest('Invalid content-disposition header format');
    }

    var parameters = match[1];
    if (!parameters) {
        return Boom.badRequest('Invalid content-disposition header missing parameters');
    }

    var result = {};
    var leftovers = parameters.replace(internals.contentDispositionParamRegex, function ($0, $1, $2, $3, $4, $5) {

        if ($2) {
            if (!$3) {
                return 'error';         // Generate leftovers
            }

            try {
                result[$1] = decodeURIComponent($3.split('\'')[2]);
            }
            catch (err) {
                return 'error'          // Generate leftover
            }
        }
        else {
            result[$1] = $4 || $5;
        }

        return '';
    });

    if (leftovers) {
        return Boom.badRequest('Invalid content-disposition header format includes invalid parameters');
    }

    if (!result.name) {
        return Boom.badRequest('Invalid content-disposition header missing name parameter');
    }

    return result;
};