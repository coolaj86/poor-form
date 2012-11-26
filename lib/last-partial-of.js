/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

  // For any buffer that ends with the start of a pattern,
  // return the number of bytes that are the same as that pattern
  function lastPartialOf(buffer, pattern) {
    if (!Buffer.isBuffer(pattern)) {
      pattern = new Buffer(pattern);
    }

    var i
      , j
      , count = 0
      // the number of bytes to be checked must be no more than the length of the pattern
      // (and technically should be 1 byte less than that length)
      // 0 in case the pattern is longer than the buffer
      , from = Math.max(buffer.length - pattern.length, 0)
      , len = Math.min(buffer.length, pattern.length)
      ;

    j = 0;
    for (i = 0; i < len; i += 1) {
      if (buffer.get(from + i) !== pattern.get(j)) {
        j = 0;
        count = 0;
        continue;
      }
      j += 1;
      count += 1;
    }

    return count;
  }

  module.exports.lastPartialOf = lastPartialOf;
}());
