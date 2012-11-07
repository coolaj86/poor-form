/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

  var request = require('ahr2')
    , fs = require('fs')
    , path = require('path')
    , FormData = require('FormData')
    , File = require('File')
    , crypto = require('crypto')
    , CryptoStream = require('./cryptostream')
    , walker
    , pathname = process.argv[2]
    , queue = [] 
    , buffer
    , dashBuf = new Buffer('-')
    , dashMd5 = crypto.createHash('md5').update('-').digest('hex')
    , Loop = require('loop')
    , loop = Loop()
    , fileCount
    ;

  function noop() {
  }

  // 1
  // 2 1,2 2,1
  // 3 1,2,3 2,3,1 3,1,2

/*
{
  "success": true,
  "result": [
    {
      "content-disposition": "form-data; name=\"md5sum-test.js\"; filename=\"md5sum-test.js\"",
      "content-type": "application/javascript",
      "name": "md5sum-test.js",
      "filename": "md5sum-test.js",
      "type": "application/javascript",
      "md5sum": "a522fab6fe2a6b1b5b20fe0a6eb56c51"
    }
  ]
}
 */

  function handleQueue(next, queue) {
    var form = new FormData()
      , curQueue
      , origQueue = queue.slice()
      , goodCount = 0
      ;

    curQueue = queue.splice(0);
    curQueue.forEach(function (f) {
      // f = { name, buffer }
      form.append(f.name, new File(f));
    });

    request.post('http://localhost:4444/dummy', null, form).when(function (err, ahr2, data) {
      try {
        data = JSON.parse(data.toString('utf8')).result;
      } catch(e) {
        console.error('Request could not be parsed as JSON');
        console.error(data.toString('utf8'));
        return;
      }

      data.every(function (r) {
        var excellent = false
          ;

        // NOTE: technically two files could have the same name but be different files
        //obj.root, obj.stat, obj.md5
        excellent = curQueue.some(function (l, i) {
          if (l.name === r.filename && l.md5 === r.md5sum) {
            curQueue.splice(i, 1);
            return true;
          }
        });

        if (excellent) {
          goodCount += 1;
          return true;
        }
      });

      if (goodCount === data.length && 0 === queue.length) {
        next();
        return;
      }

      console.error(data);
      console.error(origQueue);
      throw new Error('Major Badness');
    });
  }

  function sendLosFormos(bytes, size, index) {
    var cs = CryptoStream.create('md5')
      , j
      ;

    size = size || 1;
    index = index || 0;

    fileCount += 1;

    // TODO allow FormData to md5sum files with arbitrary filter
    //console.log('meow');
    cs.on('end', function () {
      //console.log('rawr');

      for (j = 0; j < size; j += 1) {
        if (j === index) {
          queue[j] = { buffer: bytes, name: "filething-" + j + "-" + fileCount, md5: cs.digest};
        } else {
          queue[j] = { buffer: dashBuf, name: "filething-" + j + "-" + fileCount, md5: dashMd5};
        }
      }
    });

    cs.write(bytes);
    cs.end();
  }
  
  buffer = new Buffer(512);

  buffer.fill('-');

  // Los Uno
  function loopA() {
    console.log('Loop A');
    fileCount = 0;
    loop.run(function (next) {
      if (fileCount >= 512) {
        next("break");
        loopB();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 1, 0);
      handleQueue(next, queue);
    });
  }

  // Los Dos
  function loopB() {
    console.log('Loop B');
    fileCount = 0;
    loop.run(function (next) {
      if (fileCount >= 512) {
        next("break");
        loopC();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 2, 0);
      handleQueue(next, queue);
    });
  }

  function loopC() {
    console.log('Loop C');
    fileCount = 0;
    loop.run(function (next) {
      if (fileCount >= 512) {
        next("break");
        loopD();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 2, 1);
      handleQueue(next, queue);
    });
  }

  // Los Tres
  function loopD() {
    console.log('Loop D');
    fileCount = 0;
    loop.run(function (next) {
      if (fileCount >= 512) {
        next("break");
        loopE();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 3, 0);
      handleQueue(next, queue);
    });
  }

  function loopE() {
    console.log('Loop E');
    fileCount = 0;
    loop.run(function (next) {
      if (fileCount >= 512) {
        next("break");
        loopF();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 3, 1);
      handleQueue(next, queue);
    });
  }

  function loopF() {
    console.log('Loop F');
    fileCount = 0;
    loop.run(function (next) {
      if (fileCount >= 512) {
        next("break");
        endLoops();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 3, 2);
      handleQueue(next, queue);
    });
  }

  function endLoops() {
    console.log('What a mighty Eagle which has graced us with its landing!');
  }

  loopA();
}());
