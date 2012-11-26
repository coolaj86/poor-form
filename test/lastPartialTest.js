/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  var lastPartialOf = require('./last-partial-of').lastPartialOf;

  [
      "This is something"
    , "This is something kinda \r\n--cool\r\n--with-boundary\r\nand more"
    , "\n--with-boundary\r"
    , "\r\n--with-boundary\r"
    , "\r\n--"
    , "\r"
    , "This is something kinda \r"
    , "\r\r\r\r\r"
    , "This is something kinda \r\n--cool\r\n--with-boundary\r"
    , "This is something kinda \r\n--cool\r\n--with-boundary\rt"
    , ""
    , "This is something kinda \r\n--cool\r\n--with-boundary\r\n"
  ].forEach(function (haystack) {
    var buffer = new Buffer(haystack)
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
      console.error(JSON.stringify(haystack));
      console.error('');
      return;
    }

    if (0 === partLen) {
      console.log(false);
      return;
    }

    if (partLen === pattern.length) {
      throw new Error('The original parser missed a full-length boundary');
    }

    index = buffer.length - partLen;
    //console.log(partLen);
    console.log(JSON.stringify(buffer.slice(0, index).toString()), JSON.stringify(buffer.slice(index).toString()));
  });
}());
