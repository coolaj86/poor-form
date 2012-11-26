/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  var lastPartialOf = require('../lib/last-partial-of').lastPartialOf
    // TODO colorize
    //, colors = require('colors')
    ;

  [
      {
          o: "This is something"
        , d: "This is something"
        , p: "" 
      }
    , {
          o: "This is something kinda \r\n--cool\r\n--with-boundary\r\nand more"
        , d: "This is something kinda \r\n--cool\r\n--with-boundary\r\nand more"
        , p: ""
      }
    , {
          o: "\n--with-boundary\r"
        , d: "\n--with-boundary"
        , p: "\r"
      }
    , {
          o: "\r\n--with-boundary\r"
        , d: ""
        , p: "\r\n--with-boundary\r"
      }
    , {
          o: "\r\n--with-boun"
        , d: ""
        , p: "\r\n--with-boun"
      }
    , {
          o: "\r\n--\r\n--with-boun"
        , d: "\r\n--"
        , p: "\r\n--with-boun"
      }
    , {
          o: "\r\n--X\r\n--with-boun"
        , d: "\r\n--X"
        , p: "\r\n--with-boun"
      }
    , {
          o: "\r\n--"
        , d: ""
        , p: "\r\n--"
      }
    , {
          o: "\r"
        , d: ""
        , p: "\r"
      }
    , {
          o: "\r\r"
        , d: "\r"
        , p: "\r"
      }
    , {
          o: "\r\r\r"
        , d: "\r\r"
        , p: "\r"
      }
    , {
          o: "\r\r\r\r"
        , d: "\r\r\r"
        , p: "\r"
      }
    , {
          o: "This is something kinda \r"
        , d: "This is something kinda "
        , p: "\r"
      }
    , {
          o: "This is something kinda \r"
        , d: "This is something kinda "
        , p: "\r"
      }
    , {
          o: "This is something kinda \r\n--cool\r\n--with-boundary\r"
        , d: "This is something kinda \r\n--cool"
        , p: "\r\n--with-boundary\r"
      }
    , {
          o: "This is something kinda \r\n--cool\r\n--with-boundary\rt"
        , d: "This is something kinda \r\n--cool\r\n--with-boundary\rt"
        , p: ""
      }
    , {
          o: "This is something kinda \r\n--cool\r\n--with-boundary\r\n"
        , d: "This is something kinda \r\n--cool\r\n--with-boundary"
          // NOTE: it's not possible to have a full boundary, so the last byte is never checked
          // hence even though the boundary is complete, it SHOULD in fact appear partial
        , p: "\r\n"
      }
  ].forEach(function (haystack) {
    var buffer = new Buffer(haystack.o)
      , pattern = "\r\n--with-boundary\r\n"
      , partLen
      , index
      ;

    try {
      partLen = lastPartialOf(buffer, pattern.slice(0, pattern.length - 1));
    } catch(e) {
      console.error('matched full boundary');
      return;
    }

    if (isNaN(partLen)) {
      console.error('');
      console.error('badness');
      console.error(JSON.stringify(partLen));
      console.error(JSON.stringify(haystack.o));
      console.error('');
      return;
    }

    if (partLen === pattern.length) {
      throw new Error('The original parser missed a full-length boundary');
    }

    index = buffer.length - partLen;
    if (buffer.slice(0, index).toString() !== haystack.d) {
      console.log('data mismatch', JSON.stringify(haystack.o));
      console.log(partLen);
      console.log(JSON.stringify(buffer.slice(0, index).toString()), JSON.stringify(buffer.slice(index).toString()));
    }
    else if (buffer.slice(index).toString() !== haystack.p) {
      console.log('partial boundary mismatch', JSON.stringify(haystack.o));
      console.log(partLen);
      console.log(JSON.stringify(buffer.slice(0, index).toString()), JSON.stringify(buffer.slice(index).toString()));
    }
    else {
      console.log('PASS');
    }
  });
}());
