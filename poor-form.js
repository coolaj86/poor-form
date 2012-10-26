/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  // TODO
  // Almost all clients send \r\n (Chrome, Firefox, cURL, etc)
  // However, it is useful to allow for a single \r or \n for use
  // with debugging tools such as netcat

  var EventEmitter = require('events').EventEmitter
    , util = require('util')
    , QuickParser = require('./quickParser')
    , reEndsWith2Crlf = /\r\n\r\n$/
    , reIsMultipart = /multipart\/form-data/i
    , reSplitHeaders = /\s*(.+?)\s*:\s*(.+)\s*/
    , reName = /name="([^\"]+)"/mi
    , reFilename = /filename="([^\"]+)"/mi
    , reBoundary = /boundary=([^;]+)/mi
    , eArr = []
    , CRLF = '\r\n'
    , CRLF_LEN = 2
    //, CRLFCRLF = '\r\n\r\n'
    , CRLFCRLF_LEN = 4
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
      ;

    str.trim().split(CRLF).forEach(function (header) {
      var pair = reSplitHeaders.exec(header)
        ;

      // TODO check for existance before assignment?
      // (headers are technically arrays)
      headers[pair[1].toLowerCase()] = pair[2];
    });

    disposition = headers['content-disposition'];
    headers.name = (str.match(reName)||eArr)[1];
    headers.filename = (str.match(reFilename)||eArr)[1];
    headers.type = headers['content-type'];
    //headers.size = 0;

    return headers;
  }

  function PoorForm(req) {
    var me = this
      , ctype = req.headers['content-type'] || ''
        // this could be chunked and have no length specified
      //, clength = req.headers['content-length']
      , boundString
      , boundBuffer
      ;

    // First of all, is it even worth the expense of the object?
    if (req.complete || !reIsMultipart.test(ctype)) {
      return null;
    }

    // Secondly, am I already a PoorForm object?
    if (!(this instanceof PoorForm)) {
      return new PoorForm(req);
    }

    EventEmitter.call(this);

    me.total = req.headers['content-length'] || Infinity;
    me.loaded = 0;

    me._req = req;
    me._theFirstTime = true;
    me._lastChunkPartial = null;
    me._lastBuf = null;


    // TODO the /m seems pointless? shouldn't this be on just one line?
    // I suppose the standard technically allows for \r and \n, but who does that?
    boundString = (ctype.match(reBoundary)||eArr)[1];
    if (!boundString) {
      // TODO
      console.error('req.headers[..]: the multipart/form-data request is not HTTP-compliant, boundary string wasn\'t found..');
      return null;
    }

    //boundBuffer = new Buffer(boundString);
    boundBuffer = new Buffer('--' + boundString);
    me.bblength = boundBuffer.length;
    me.boundEnd = '--' + boundString + '--';
    me.qkp = new QuickParser.quickParser(boundBuffer);

    me._boundOnData = me._onData.bind(me);
    me._boundOnEnd = me._onEnd.bind(me);
    //me._boundOnClose = me._onClose.bind(me);

    req.on('data', me._boundOnData);
    req.on('end', me._boundOnEnd);
    //req.on('close', me._boundOnClose);
  }

  util.inherits(PoorForm, EventEmitter);

  PoorForm.prototype._onData = function onData(chunk) {
    var me = this
      , results
      , index = 0
      ;

    me.loaded += chunk.length;

    if (me._lastChunkPartial) {
      // joins the last bits of the previous potential header with the new bits
      chunk = Buffer.concat([me._lastBuf, chunk], me._lastBuf.length + chunk.length);
      me._lastChunkPartial = false;
    }

    results = me.qkp.parse(chunk);

    results.some(function (result, i) {
      var rstart = result.start
        , rfinish = result.finish
        , boundary
        , headers
        , headersStr
        , boundaryEnd = rstart + me.bblength + CRLF_LEN
        , sliceLen = chunk.length - rstart
        ;

      // rstart occurs just after \r\n
      if (rstart === 0) {
        // ignore
      } else if (rstart < CRLF_LEN) {
        console.error(__filename);
        console.error("Report to PoorForm: rstart === 1? I don't see how that's possible.");
        return true; // break
      } else {
        // in all circumstances the chunk up to rstart is data
        // even if the last headers were partial, they have been
        // concatonated with the next chunk by this point
        // (in which case the length of the first body will be 0)
        me.emit('fielddata', chunk.slice(index, rstart - CRLF_LEN));
        // in the case of partial headers,
        // make sure that lastBuf doesn't contain any data
        index = rstart; // skipping the CRLF
        if (index > chunk.length) {
          console.log('what the weird?');
        }
      }

      // NOTE
      // In the case of <boundary>\r\n<header> the chunk will larger than <boundary>\r\n
      // And the case of <boundary>-- 
      // we still know that boundaryEnd is at least that long
      if (chunk.length >= (boundaryEnd - rstart)) {
        boundary = chunk.slice(rstart, boundaryEnd);
        //console.log('[BOUNDARY]', boundary.toString('utf8'));
      }

      /*
      console.log('[CHUNK]', chunk.length, rstart, rfinish);
      console.log('[HLENG]', chunk.length - rstart);
      console.log('[HDLEN]', (rfinish + CRLF_LEN) - rstart);
      */

      if (sliceLen >= ((rfinish + CRLFCRLF_LEN) - rstart)) {
        // reaches double CRLF (end-of-header)
        headers = chunk.slice(
            boundaryEnd
          , rfinish + CRLFCRLF_LEN
        );
        headersStr = headers.toString('utf8');

        if (!reEndsWith2Crlf.test(headersStr)) {
          me._lastChunkPartial = true;
        } else {
          index = rfinish + CRLFCRLF_LEN;
          if (index > chunk.length) {
            console.error('expected more bytes then what I have to give!');
          }
          if (!me._theFirstTime) {
            me.emit('fieldend');
          } else {
            me._theFirstTime = false;
          }
          me.emit('fieldstart', formatHeaders(headersStr));
        }
      } else if (sliceLen >= ((rfinish + CRLF_LEN) - rstart)) {
        // doesn't reach a single CRLF, probably a partial header
        headers = chunk.slice(
            boundaryEnd
          , rfinish + CRLF_LEN
        );
        headersStr = headers.toString('utf8');
        if (-1 === boundary.toString('utf8').indexOf(me.boundEnd)) {
          // This header was neither ended properly, nor a end-of-boundary marker
          // it must be rechecked later
          me._lastChunkPartial = true;
        } else {
          // The header deos have the end-of-boundary marker
          index = rfinish + CRLF_LEN;
          if (index > chunk.length) {
            console.error('expected more bytes then what I got!');
          }
          me.emit('fieldend');
          // this is an assumed end of the form, although more (villanous) data may come
          me.emit('formend');
          me._req.removeListener('data', me._boundOnData);
          me._req.on('data', function (garb) {
            console.error(__filename, 'Got unexpected data after parsing was "complete"');
            console.error(garb);
          });

          // If this isn't the last chunk in the loop then my parser logic is bad
          // until I can extensively test it, this check will remain in place
          if (results.length - 1 !== i) {
            console.log(headersStr);
            console.log(headersStr.substr(headersStr.length - 4));
            console.error(__filename);
            console.error('Report this error to PoorForm: MAJOR badness in the header malformation');
            console.error('You may have lost some data during this upload, or received maliciously corrupt data');
          }
        }
      }

    });

    me._lastBuf = chunk.slice(index, chunk.length);
    if (!me._lastChunkPartial && 0 !== me._lastBuf.length) {
      me.emit('fielddata', me._lastBuf);
      me._lastBuf = null;
    }
  };

  PoorForm.prototype._onEnd = function onEnd() {
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

  PoorForm.create = function (req) {
    return new PoorForm(req);
  };

  PoorForm.PoorForm = PoorForm;
  exports.PoorForm = PoorForm; // as if there were a competing non-node commonjs environment
  module.exports = PoorForm;
}());
