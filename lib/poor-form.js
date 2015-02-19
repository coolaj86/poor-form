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
    //, QuickParser = require('bop').BoyerParser
    , reIsMultipart = /multipart\/form-data/i
    , reSplitHeaders = /\s*(.+?)\s*:\s*(.+)\s*/
      // TODO the /m seems pointless? shouldn't this be on just one line?
      // I suppose the standard technically allows for \r and \n, but who does that?
    , reName = /name="([^\"]+)"/mi
    , reFilename = /filename="([^\"]+)"/mi
    , reBoundary = /boundary=([^;]+)/mi
    , eArr = []
    , CRLF = '\r\n'
    //, CRLF_LEN = 2
    , CRLFCRLF = '\r\n\r\n'
    , CRLFCRLF_LEN = 4
    , tcpChunk = 66 * 1024
    , lastPartialOf = require('./last-partial-of').lastPartialOf
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
    me._fieldStartBoundaryStr = boundString || PoorForm.test(req);
    if (!me._fieldStartBoundaryStr) {
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
    me._firstFieldParsed = false;
    me._lastChunkPartial = false;
    me._numPartialChunks = 0;
    me._numPartialBytes = 0;
    me._prevBuf = null;

    me._firstFieldStartBuf = new Buffer('--' + me._fieldStartBoundaryStr + CRLF);
    me._fieldStartBuf = new Buffer(CRLF + '--' + me._fieldStartBoundaryStr + CRLF);
    me._formEndBoundaryStr = CRLF + '--' + me._fieldStartBoundaryStr + '--' + CRLF;
    me._formEndBoundaryBuf = new Buffer(me._formEndBoundaryStr);
    me._qapFormEnd = new QuickParser(me._formEndBoundaryBuf);
    me._qapFirstFieldStart = new QuickParser(me._firstFieldStartBuf);
    me._qapFieldStart = new QuickParser(me._fieldStartBuf);
    me._qapHeaderEnd = new QuickParser(new Buffer(CRLFCRLF));
    me._formEndFound = false;

    me._boundOnData = me._onData.bind(me);
    //me._boundOnEnd = me._onEnd.bind(me);
    //me._boundOnClose = me._onClose.bind(me);
    
    //me._debugBufs = [];

    req.on('data', me._boundOnData);
    //req.on('end', me._boundOnEnd);
    //req.on('close', me._boundOnClose);
  }

  util.inherits(PoorForm, EventEmitter);

  PoorForm.prototype._onData = function onData(chunk) {
    var me = this
    , results
    , formEndSlice
    , k
    , newChunk
    ;

    //me._debugBufs.push(chunk);

    if (!me._firstFieldParsed) {
      //console.log('\n[0.0.0] Form Start');
    }
    k = me.chunks;
    //console.log('[' + k + '.0.0] onData', chunk.length);

    me.loaded += chunk.length;
    me.chunks += 1;

    if (me._prevBuf) {
      // joins the last bits of the previous potential header with the new bits
      me._numPartialChunks += 1;
      me._numPartialBytes = me._prevBuf.length;
      //  TODO
      //  if !me._incompleteHeader, concat only enough bytes to make the largest boundary
      //  then parse it manually, add to the results array, and set a curChunkIndex, and 
      chunk = Buffer.concat([me._prevBuf, chunk], me._prevBuf.length + chunk.length);
      me._prevBuf = null;
    } else {
      me._numPartialChunks = 0;
      me._numPartialBytes = 0;
    }

    // NOTE: It's quite possible that a non-browser would chunk things
    // up a bit more than usual (i.e. spit out boundaries whole and chunk
    // out files), hence the check for both numChunks and numBytes
    // TODO create a test with enormous field headers to see that this logic actually works
    if (me._numPartialChunks > 1 && me._numPartialBytes > tcpChunk) {
      throw new Error(
        'Partial boundary not resolved after '
        + me._numPartialChunks
        + ' chunks and '
        + me._numPartialBytes
        + ' bytes.'
      );
    }

    // Check to see if the Form End is in this chunk
    // (and it may be better to just compare strings)
    // TODO test for the leading \r\n here?
    if (chunk.length >= me._formEndBoundaryBuf.length) {
      formEndSlice = chunk.slice(chunk.length - me._formEndBoundaryBuf.length);

      if (undefined !== me._qapFormEnd.parse(formEndSlice)[0]) {
        // Yes, the form will end!!!
        //console.log('[EOF] found the end of the form');
        chunk = chunk.slice(0, chunk.length - me._formEndBoundaryBuf.length);
        me._formEndFound = true;
      }
    } else {
      // TODO Should probably just skip all parsing and wait for the next chunk or 'end' event
    }

    // This WILL NOT have the full end of form marker (though it may be partial)
    //console.log('[' + k + '.0.1] concat', chunk.length);
    if (!me._firstFieldParsed) {
      // this should always be 0
      results = me._qapFirstFieldStart.parse(chunk, 0, 1);
      results = results.concat(me._qapFieldStart.parse(chunk, results[0]));
    } else {
      results = me._qapFieldStart.parse(chunk);
    }
    
    me._incompleteHeader = false;
    me._lastDataStart = null;
    me._curChunkIndex = 0;

    //console.log('results', results);
    results.forEach(function (headerStart, i) {
      //console.log('[' + k + '.1.' + i + '.0] lo ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ', headerStart);
      var headerEnd
        , headerEndArr
        , headerStr
        ;

      if (null !== me._lastDataStart || (0 === i && 0 !== headerStart)) {
        //console.log('[' + k + '.1.' + i + '.1] prev fd');
                                // end of last header, 2 bytes before this header
        me.emit('fielddata', chunk.slice(me._lastDataStart || 0, headerStart));
        // NOTE: On the very first header there isn't a 2 byte predecesor, but
        // there also isn't data before it, so it's nothing to worry about
        me._lastDataStart = null;
      }

      headerEndArr = me._qapHeaderEnd.parse(chunk, headerStart, 1);
      // headerEnd = headerEndStart + headerEndLength
      headerEnd = headerEndArr[0] + CRLFCRLF_LEN;

      // the token was not found (could be found at 0, which is falsey)
      if (headerEndArr.length) {
        //console.log('[' + k + '.1.' + i + '.2] Head End', headerEnd);
        me._incompleteHeader = false;
        if (me._firstFieldParsed) {
          me.emit('fieldend');
        } else {
          me._firstFieldParsed = true;
        }
        headerStr = chunk.slice(headerStart, headerEnd).toString('utf8');
        //console.log('headerStr', JSON.stringify(headerStr));
        //console.log('headerEnd', headerStr.length, headerEnd);
        me.emit('fieldstart', formatHeaders(headerStr));
        /*
        console.log(
            '[' + k + '.1.' + i + '.2] fs'
          , headerEnd
          , chunk.length - headerEnd
          //, JSON.stringify(headerStr.substr(0, 10))
          //, JSON.stringify(headerStr.substr(headerStr.length - 10))
        );
        */
        me._lastDataStart = headerEnd;
        me._curChunkIndex = headerEnd;
      }

      // The end-of-header CRLFCRLF was not found
      else if (i === results.length - 1) {
        // this is the last field in the chunk
        //console.log('[' + k + '.1.'+ i + '.3] fd');
        me._incompleteHeader = true;
        me._curChunkIndex = headerStart;
      }
      
      else {
        // this is not the last chunk
        throw new Error("There was no end to this start, yet there's another start.");
      }
    });

    // TODO 
    newChunk = chunk.slice(me._curChunkIndex);

    if (me._formEndFound) {
      //console.log('[' + k + '.2.0] fd');
      if (me._incompleteHeader) {
        throw new Error("There was no end to this start, yet there's the form end.");
      }
      //console.log('curChunkIndex:', JSON.stringify(me._curChunkIndex));
      //console.log('curChunkIndex', JSON.stringify(chunk.toString()));
      me.emit('fielddata', newChunk);
      me.emit('fieldend');
      me.emit('formend');
      me._prevBuf = null;
      return;
    }

    // If there was a field start, but no end-of-header, save for concatonation
    if (me._incompleteHeader) {
      //console.log('[' + k + '.2.2] cc', me._curChunkIndex, chunk.length);
      me._prevBuf = newChunk;
      return;
    }
    
    // If it's not long enough for a full header
    if (newChunk.length < me._fieldStartBuf.length) {
      //console.log('[' + k + '.2.3] cc', me._curChunkIndex, chunk.length, chunk.length - me._curChunkIndex, me._fieldStartBuf.length);
      me._prevBuf = newChunk;
      return;
    }

    //console.log('[' + k + '.2.5] cc', chunk.length);
    // TODO make this faster
    me._endDataIndex = newChunk.length -
      (
        lastPartialOf(newChunk, me._formEndBoundaryBuf)
        ||
        lastPartialOf(newChunk, me._fieldStartBuf)
      )
    ;
    //console.log('[' + k + '.2.5.2] cc', me._endDataIndex);

    // There was no possible start-of-header marker
    // the whole chunk is data
    // none of the data will be concatonated
    if (-1 === me._endDataIndex) {
      //console.log('[' + k + '.2.6] cc');
      me._endDataIndex = newChunk.length;
      me._prevBuf = null;
    }

    // All data occuring before the start-of-header marker is data
    if (0 !== me._endDataIndex) {
      /*
      console.log(
          '[' + k + '.2.7] cc'
        , me._curChunkIndex
        , me._endDataIndex
        , chunk.length - me._curChunkIndex
        , chunk.length - me._endDataIndex
      );
      */
      /*
      console.log(JSON.stringify(
        chunk.slice(Math.max(me._curChunkIndex, me._endDataIndex - 100), me._endDataIndex).toString()
      ));
      */
      me.emit('fielddata', newChunk.slice(0, me._endDataIndex));
    }

    // If any of the chunk could be a header, save it for the next go
    if (newChunk.length !== me._endDataIndex) {
      //console.log('[' + k + '.2.8] cc');
      me._prevBuf = newChunk.slice(me._endDataIndex);
    }
  };

  PoorForm.prototype._onEnd = function () {
    /*
    var me = this
      ;

    //me._req.removeListener('close', me._boundOnClose);
    */
  };

  PoorForm.prototype._onClose = function () {
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
