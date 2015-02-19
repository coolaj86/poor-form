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
    , fillVal = 'a'
    //, fillVal = '\r'
    , bittyBuf = new Buffer('&')
    , bittyMd5 = crypto.createHash('md5').update(bittyBuf).digest('hex')
    , Loop = require('loop')
    , loop = Loop()
    , fileCount
    , startSize = 0 // 58 * 1024
    //, startSize = 110 * 1024
    //, startSize = 200 * 1024 * 1024 // 58 * 1024
    //, endSize = 200 * 1024 * 1024 + 1 // 58 * 1024
    , endSize = 160 * 1024 // 68 * 1024
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
      if (err) {
        console.error(err);
        return;
      }

      try {
        data = JSON.parse(data.toString('utf8')).result;
      } catch(e) {
        console.error('Request could not be parsed as JSON');
        console.error(e);
        console.log(data);
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

      console.error('data');
      console.error(data);
      origQueue.forEach(function (item) {
        item.size = item.buffer.length;
        delete item.buffer;
      });
      console.error('origQueue');
      console.error(origQueue);
      throw new Error('md5sum mismatch');
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
          queue[j] = { buffer: bytes, name: "biggyfile-" + j + "-" + fileCount, md5: cs.digest};
        } else {
          queue[j] = { buffer: bittyBuf, name: "bittyfile-" + j + "-" + fileCount, md5: bittyMd5};
        }
      }
    });

    cs.write(bytes);
    cs.end();
  }
  
  // Standard 10/100 Ethernet MTU is around 1500
  //buffer = new Buffer(1500 * 3);
  // Standard TCP packet size is around 65k
  buffer = new Buffer(endSize);

  // for the adventurous:
  //buffer.fill('-');
  buffer.fill(fillVal);

  // Los Uno
  function loopA() {
    console.log('Loop A');
    fileCount = startSize;
    loop.run(function (next) {
      if (fileCount >= buffer.length) {
        next("break");
        loopB();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 1, 0);
      handleQueue(next, queue);
    });
  }

  //
  // Los Dos
  //
  function loopB() {
    console.log('Loop B');
    fileCount = startSize;
    loop.run(function (next) {
      if (fileCount >= buffer.length) {
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
    fileCount = startSize;
    loop.run(function (next) {
      if (fileCount >= buffer.length) {
        next("break");
        loopD();
        return;
      }
      sendLosFormos(buffer.slice(0, fileCount + 1), 2, 1);
      handleQueue(next, queue);
    });
  }

  //
  // Los Tres
  //
  function loopD() {
    console.log('Loop D');
    fileCount = startSize;
    loop.run(function (next) {
      if (fileCount >= buffer.length) {
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
    fileCount = startSize;
    loop.run(function (next) {
      if (fileCount >= buffer.length) {
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
    fileCount = startSize;
    loop.run(function (next) {
      if (fileCount >= buffer.length) {
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
