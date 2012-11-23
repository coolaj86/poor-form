/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  require('bufferjs');

  // TODO
  // Almost all clients send \r\n (Chrome, Firefox, cURL, etc)
  // However, it is useful to allow for a single \r or \n for use
  // with debugging tools such as netcat

  var EventEmitter = require('events').EventEmitter
    , util = require('util')
    , QuickParser = require('qap').QuickParser
    , reIsMultipart = /multipart\/form-data/i
    , reSplitHeaders = /\s*(.+?)\s*:\s*(.+)\s*/
      // TODO the /m seems pointless? shouldn't this be on just one line?
      // I suppose the standard technically allows for \r and \n, but who does that?
    , reName = /name="([^\"]+)"/mi
    , reFilename = /filename="([^\"]+)"/mi
    , reBoundary = /boundary=([^;]+)/mi
    , eArr = []
    , CRLF = '\r\n'
    , CRLF_LEN = 2
    , CRLFCRLF = '\r\n\r\n'
    , CRLFCRLF_LEN = 4
    , tcpChunk = 66 * 1024
    //, zeroBuf = new Buffer(0)
    ;

  // NOTE
  // if we're really trying to detect and correct villany
  // this is not a good parser. But for getting good user data
  // and ignoring villany, it should be good enough
  //
  // ^M
  // Content-Disposition: form-data; name="avatar"; filename="smiley-cool.png"^M
  // Content-Type: image/png^M
  // ^M
  function formatHeaders(str) {
    var headers = {}
      , disposition
      , lines
      ;

    lines = str.trim().split(CRLF);
    lines.shift(); // get rid of the boundary marker itself
    lines.forEach(function (header) {
      var pair = reSplitHeaders.exec(header)
        ;

      // TODO check for existance before assignment?
      // (headers are technically arrays)
      headers[pair[1].toLowerCase()] = pair[2];
    });

    disposition = headers['content-disposition'];
    headers.name = (str.match(reName)||eArr)[1];
    headers.filename = (str.match(reFilename)||eArr)[1];
    headers.type = (headers['content-type']||'').replace(/;.*/, '');
    //headers.size = 0;

    return headers;
  }

  // Note this could be chunked and have no length specified
  function PoorForm(req, boundString) {
    var me = this
      ;

    // First of all, is it even worth the expense of the object?
    boundString = boundString || PoorForm.test(req);
    if (!boundString) {
      throw new Error('req.headers[..]: the multipart/form-data request is not HTTP-compliant, boundary string wasn\'t found..');
    }

    // Secondly, am I already a PoorForm object?
    if (!(this instanceof PoorForm)) {
      return new PoorForm(req);
    }

    EventEmitter.call(this);

    me.total = req.headers['content-length'] || Infinity;
    me.loaded = 0;
    // TODO I'm not convinced that this is super useful yet
    me.chunks = 0;

    me._req = req;
    me._theFirstTime = true;
    me._lastChunkPartial = false;
    me._numPartialChunks = 0;
    me._numPartialBytes = 0;
    me._prevBuf = null;

    me._boundBuffer = new Buffer('--' + boundString);
    me.bblength = me._boundBuffer.length;
    me.boundaryEnd = CRLF + '--' + boundString + '--' + CRLF;
    me.boundaryEndBuffer = new Buffer(me.boundaryEnd);
    me._qapBoundEnd = new QuickParser(me.boundaryEndBuffer);
    me._qapBoundStart = new QuickParser(me._boundBuffer);
    me._qapHeaderEnd = new QuickParser(new Buffer(CRLFCRLF), 1);
    me._fieldInProgress = false;
    me._formEndFound = false;

    me._boundOnData = me._onData.bind(me);
    me._boundOnEnd = me._onEnd.bind(me);
    //me._boundOnClose = me._onClose.bind(me);
    
    me._debugBufs = [];

    req.on('data', me._boundOnData);
    req.on('end', me._boundOnEnd);
    //req.on('close', me._boundOnClose);
  }

  util.inherits(PoorForm, EventEmitter);

  PoorForm.prototype._onData = function onData(chunk) {
    var me = this
    , results
    , lastDataStart = null
    , formEndSlice
    , originalChunk
    , k
    ;

    me._debugBufs.push(chunk);

    if (me._theFirstTime) {
      console.log('\n[0.0.0] Form Start');
    }
    k = me.chunks;
    console.log('[' + k + '.0.0] onData');

    me.loaded += chunk.length;
    me.chunks += 1;

    // NOTE: It's quite possible that a non-browser would chunk things
    // up a bit more than usual (i.e. spit out boundaries whole and chunk
    // out files), hence the check for both numChunks and numBytes
    if (me._numPartialChunks > 1 && me._numPartialBytes > tcpChunk) {
      throw new Error(
        'Partial boundary not resolved after '
        + me._numPartialChunks
        + ' chunks and '
        + me._numPartialBytes
        + '.'
      );
    }

    if (me._prevBuf) {
      // joins the last bits of the previous potential header with the new bits
      me._numPartialChunks += 1;
      me._numPartialBytes += chunk.length;
      chunk = Buffer.concat([me._prevBuf, chunk], me._prevBuf.length + chunk.length);
      me._prevBuf = null;
    } else {
      me._numPartialChunks = 0;
      me._numPartialBytes = 0;
    }

    // Check to see if the Form End is in this chunk
    // (and it may be better to just compare strings)
    // TODO test for the leading \r\n here?
    if (chunk.length >= me.boundaryEndBuffer.length) {
      formEndSlice = chunk.slice(chunk.length - me.boundaryEndBuffer.length);

      if (undefined !== me._qapBoundEnd.parse(formEndSlice)[0]) {
        // Yes, the form will end!!!
        console.log('[EOF] found the end of the form');
        //console.log('================================================================');
        //console.log(chunk.slice(0, 100).toString());
        chunk = chunk.slice(0, chunk.length - me.boundaryEndBuffer.length);
        //console.log('================================================================');
        //console.log(chunk.slice(0, 100).toString());
        //console.log('================================================================');
        me._formEndFound = true;
      }
    } else {
      // TODO Should probably just skip all parsing and wait for the next chunk or 'end' event
    }

    // This WILL NOT have the full end of form marker (though it may be partial)
    console.log('chunk.length', chunk.length);
    originalChunk = chunk;
    results = me._qapBoundStart.parse(originalChunk);
    //console.log('results.length', results.length);
    
    results.some(function (headerStart, i) {
      console.log('[' + k + '.1.' + i + '.0] lo');
      var headerAndData
        , endIndex = results[i + 1] || originalChunk.length
        //, endIndex = Math.min(results[i + 1] || chunk.length, chunk.length)
        , headerEndArr
        , headerEnd
        , headerStr
        , lastDataEnd = headerStart - CRLF_LEN
        ;

      headerAndData = originalChunk.slice(headerStart, endIndex);

      if (null !== lastDataStart) {
        console.log('[' + k + '.1.' + i + '.1] pr');
                                // end of last header, 2 bytes before this header
        me._debugData = originalChunk.slice(lastDataStart, lastDataEnd);
        me.emit('fielddata', originalChunk.slice(lastDataStart, lastDataEnd));
        // NOTE: On the very first header there isn't a 2 byte predecesor, but
        // there also isn't data before it, so it's nothing to worry about
        lastDataStart = null;
      }

      headerEndArr = me._qapHeaderEnd.parse(headerAndData);
      headerEnd = headerEndArr[0];

      // the token was not found (could be found at 0, which is falsey)
      if (headerEndArr.length) {
        console.log('[' + k + '.1.' + i + '.2] fs');
        if (!me._theFirstTime) {
          me._fieldInProgress = false;
          me.emit('fieldend');
        } else {
          me._theFirstTime = false;
        }
        headerStr = headerAndData.slice(0, headerEnd).toString('utf8');
        //console.log('+++++++++++++++++++++++++++++++++++++++++++++++++++++++');
        //console.log(JSON.stringify(headerStr));
        //console.log('+++++++++++++++++++++++++++++++++++++++++++++++++++++++');
        me.emit('fieldstart', formatHeaders(headerStr));
        lastDataStart = headerStart + headerEnd + CRLFCRLF_LEN;
        //console.log(JSON.stringify(chunk.slice(lastDataStart).toString()));
        chunk = originalChunk.slice(lastDataStart);
        //console.log('+++++++++++++++++++++++++++++++++++++++++++++++++++++++');
        me._fieldInProgress = true;
        return;
      }

      if (i === results.length - 1) {
        // this is the last field in the chunk
        console.log('[' + k + '.1.'+ i + '.3] fd');
        chunk = originalChunk.slice(headerStart);
        return;
      }
      
      // this is not the last chunk
      throw new Error("There was no end to this start, yet there's another start.");
    });

    if (me._formEndFound) {
      console.log('[' + k + '.2.0] fd');
      me._debugData = chunk;
      me.emit('fielddata', chunk);
      me._fieldInProgress = false;
      me.emit('fieldend');
      me.emit('formend');
      me._prevBuf = null;
      return;
    }

    /*
    if (-1 !== chunk.indexOf('\r')) {
      console.log('[' + k + '.2.1] fd');
      me._prevBuf = chunk;
      return;
    }
    */

    if (chunk.length > me._boundBuffer.length + CRLFCRLF_LEN) {
      if (-1 === chunk.indexOf('\r', chunk.length - (me._boundBuffer.length + CRLFCRLF_LEN))) {
        console.log('[' + k + '.2.2] fd');
        // If there's no '\r', then there's definitely no '\r\n--' and hence no partial boundary.
        // That means this chunk of data is safe to pass along
        me._debugData = chunk;
        me.emit('fielddata', chunk);
      } else {
        console.log('[' + k + '.2.3] fd');
        //console.log(chunk.toString());
        me._debugData = chunk.slice(0, chunk.length - (me._boundBuffer.length + CRLFCRLF_LEN));
        me.emit('fielddata', chunk.slice(0, chunk.length - (me._boundBuffer.length + CRLFCRLF_LEN)));
        me._prevBuf = chunk.slice(chunk.length - (me._boundBuffer.length + CRLFCRLF_LEN));
      }
    } else {
      console.log('[' + k + '2.4] fd');
      me._prevBuf = chunk;
    }
  };

  PoorForm.prototype._onEnd = function onEnd() {
    var buf = Buffer.concat(this._debugBufs);
    if (this._prevBuf) {
      console.log('[end]');
      console.log('[BOUND]', JSON.stringify(this.boundaryEndBuffer.toString()));
      console.log('[ENDB] ', JSON.stringify(this._prevBuf.slice(Math.max(this._prevBuf.length - 100, 0)).toString()));
      console.log('[CHUNK]', JSON.stringify(this._debugData.slice(this._debugData.length - 100).toString()));
      console.log('[START]', JSON.stringify(buf.slice(0, 300).toString()));
      console.log('[ENDF] ', JSON.stringify(buf.slice(buf.length - 100).toString()));
      if (this._prevBuf.toString() === this.boundaryEndBuffer.toString().substr(2)) {
        this.emit('fieldend');
        this.emit('formend');
      }
    }
    // do something with unfinished formitude?
    /*
    var me = this
      ;

    //me._req.removeListener('close', me._boundOnClose);
    */
  };

  PoorForm.prototype._onClose = function onEnd() {
    /*
    var me = this
      ;

    //me.emit('error', new Error("Connection unexpectedly closed"));
    me.emit('formend');
    */
  };

  PoorForm.test = function (req) {
    var ctype = req.headers['content-type'] || ''
      , boundString
      ;

    if (req.complete || !reIsMultipart.test(ctype)) {
      return false;
    }

    boundString = (ctype.match(reBoundary)||eArr)[1];
    if (!boundString) {
      return false;
    }

    return boundString;
  };
  PoorForm.create = function (req) {
    var boundString = PoorForm.test(req)
      ;

    if (boundString) {
      return new PoorForm(req, boundString);
    } else {
      return null;
    }
  };

  PoorForm.QuickParser = QuickParser;
  PoorForm.PoorForm = PoorForm;
  exports.PoorForm = PoorForm; // as if there were a competing non-node commonjs environment
  module.exports = PoorForm;
}());
